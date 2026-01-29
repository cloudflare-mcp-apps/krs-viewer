/**
 * API Key Authentication Handler for {{SERVER_NAME}} MCP Server
 *
 * Provides API key authentication for MCP clients that don't support OAuth.
 * Uses an LRU cache to prevent memory leaks from unbounded server creation.
 *
 * TODO: When you add new tools to server.ts, you MUST also:
 * 1. Register them in getOrCreateServer() (tool registration section)
 * 2. Add tool schemas to handleToolsList()
 * 3. Add cases to handleToolsCall()
 *
 * Pattern: The API key handler creates its own McpServer instance per user
 * because the McpAgent (which extends DurableObject) is only used for OAuth flow.
 */

import * as z from "zod/v4";
import { validateApiKey } from "./auth/apiKeys";
import type { Env } from "./types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
  // v1.0.0+: Compatible with stable ext-apps SDK features
  // Uses nested _meta.ui.resourceUri, supports updateModelContext, fullscreen, widgetUUID
} from "@modelcontextprotocol/ext-apps/server";
import { TOOL_METADATA, getToolDescription } from "./tools/descriptions";
import { logger } from "./shared/logger";
import { UI_RESOURCES, UI_MIME_TYPE } from "./resources/ui-resources";
import { loadHtml } from "./helpers/assets";
import { SERVER_INSTRUCTIONS } from "./server-instructions";

// ============================================================================
// Configuration
// ============================================================================

/** Maximum number of McpServer instances to cache (prevents memory leaks) */
const MAX_CACHED_SERVERS = 100;

/** Server configuration - must match server.ts */
const SERVER_NAME = "{{SERVER_NAME}}";
const SERVER_VERSION = "1.0.0";

// ============================================================================
// LRU Cache for McpServer instances
// ============================================================================

/**
 * Simple LRU Cache for MCP Server instances
 *
 * Prevents memory leaks by limiting the number of cached servers.
 * When the cache is full, the least recently accessed server is evicted.
 */
class LRUCache<K, V> {
  private cache: Map<K, { value: V; lastAccessed: number }>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    this.cache.set(key, { value, lastAccessed: Date.now() });
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) {
      logger.info({
        event: 'lru_cache_eviction',
        evicted_user_id: String(oldestKey),
        cache_size: this.cache.size,
      });
      this.cache.delete(oldestKey);
    }
  }
}

const serverCache = new LRUCache<string, McpServer>(MAX_CACHED_SERVERS);

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main entry point for API key authenticated MCP requests
 *
 * @param request - The incoming HTTP request
 * @param env - Cloudflare Workers environment bindings
 * @param ctx - Execution context
 * @param pathname - URL pathname (should be "/mcp")
 * @returns HTTP response
 */
export async function handleApiKeyRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response> {
  try {
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      return jsonError("Missing Authorization header", 401);
    }

    const validationResult = await validateApiKey(apiKey, env);
    if (!validationResult) {
      logger.warn({
        event: 'auth_attempt',
        method: 'api_key',
        success: false,
        reason: 'Invalid or expired API key',
      });
      return jsonError("Invalid or expired API key", 401);
    }

    const { userId, email } = validationResult;
    logger.info({
      event: 'auth_attempt',
      method: 'api_key',
      user_email: email,
      user_id: userId,
      success: true,
    });

    const server = await getOrCreateServer(env, userId, email);

    if (pathname === "/mcp") {
      return await handleHTTPTransport(server, request, env, userId, email);
    } else {
      return jsonError("Invalid endpoint. Use /mcp", 400);
    }
  } catch (error) {
    logger.error({
      event: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      context: 'API key handler',
    });
    return jsonError(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
}

// ============================================================================
// Server Instance Management
// ============================================================================

/**
 * Get or create MCP server instance for API key user
 *
 * Uses LRU cache to prevent memory leaks. Each user gets their own
 * server instance with tools that have access to their userId/email.
 */
async function getOrCreateServer(
  env: Env,
  userId: string,
  email: string
): Promise<McpServer> {
  const cached = serverCache.get(userId);
  if (cached) return cached;

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true }
    },
    instructions: SERVER_INSTRUCTIONS
  });

  // ========================================================================
  // SEP-1865 MCP Apps: UI Resource Registration
  // ========================================================================
  const widgetResource = UI_RESOURCES.widget;

  registerAppResource(
    server,
    widgetResource.uri,
    widgetResource.uri,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: widgetResource.description,
      _meta: { ui: widgetResource._meta.ui! }
    },
    async () => {
      const templateHTML = await loadHtml(env.ASSETS, "/widget.html");
      return {
        contents: [{
          uri: widgetResource.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: templateHTML,
          _meta: widgetResource._meta as Record<string, unknown>
        }]
      };
    }
  );

  // ========================================================================
  // Tool Registration (must match server.ts)
  // TODO: Add your tools here - KEEP IN SYNC with server.ts
  // ========================================================================
  registerAppTool(
    server,
    "example-tool",
    {
      title: TOOL_METADATA["example-tool"].title,
      description: getToolDescription("example-tool"),
      inputSchema: {
        input: z.string()
          .min(1)
          .meta({ description: "Input string to process" }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: {
          resourceUri: widgetResource.uri  // v1.0.0: nested structure (stable)
        }
      }
    },
    async (args: { input: string }) => {
      const { input } = args;

      try {
        // TODO: Replace with your actual tool logic
        const result = {
          message: `Processed: ${input}`,
          timestamp: new Date().toISOString(),
          userId: userId,
        };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  serverCache.set(userId, server);
  return server;
}

// ============================================================================
// HTTP Transport Handler (JSON-RPC over HTTP)
// ============================================================================

/**
 * Handle HTTP transport for MCP protocol
 *
 * Implements JSON-RPC 2.0 over HTTP for MCP communication.
 */
async function handleHTTPTransport(
  server: McpServer,
  request: Request,
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  try {
    const jsonRpcRequest = await request.json() as {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: unknown;
    };

    if (jsonRpcRequest.jsonrpc !== "2.0") {
      return jsonRpcResponse(jsonRpcRequest.id, null, { code: -32600, message: "Invalid Request" });
    }

    switch (jsonRpcRequest.method) {
      case "initialize":
        return handleInitialize(jsonRpcRequest);
      case "ping":
        return handlePing(jsonRpcRequest);
      case "tools/list":
        return await handleToolsList(jsonRpcRequest);
      case "tools/call":
        return await handleToolsCall(jsonRpcRequest, env, userId, userEmail);
      case "resources/list":
        return await handleResourcesList(jsonRpcRequest);
      case "resources/read":
        return await handleResourcesRead(jsonRpcRequest, env);
      case "prompts/list":
        return await handlePromptsList(jsonRpcRequest);
      default:
        return jsonRpcResponse(jsonRpcRequest.id, null, { code: -32601, message: `Method not found: ${jsonRpcRequest.method}` });
    }
  } catch (error) {
    return jsonRpcResponse("error", null, { code: -32700, message: `Parse error: ${error instanceof Error ? error.message : String(error)}` });
  }
}

// ============================================================================
// JSON-RPC Method Handlers
// ============================================================================

function handleInitialize(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true }
    },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
  });
}

function handlePing(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {});
}

async function handleToolsList(request: { id: number | string }): Promise<Response> {
  // TODO: Add your tools to this list - KEEP IN SYNC with server.ts
  return jsonRpcResponse(request.id, {
    tools: [{
      name: "example-tool",
      title: TOOL_METADATA["example-tool"].title,
      description: getToolDescription("example-tool"),
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input string to process" }
        },
        required: ["input"]
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    }]
  });
}

async function handleToolsCall(
  request: { id: number | string; params?: unknown },
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
  const { name, arguments: args } = params || {};

  // TODO: Add cases for your tools - KEEP IN SYNC with server.ts
  switch (name) {
    case "example-tool": {
      const input = (args?.input as string) || "";

      try {
        const result = {
          message: `Processed: ${input}`,
          timestamp: new Date().toISOString(),
          userId: userId,
        };

        return jsonRpcResponse(request.id, {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result
        });
      } catch (error) {
        return jsonRpcResponse(request.id, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        });
      }
    }
    default:
      return jsonRpcResponse(request.id, null, { code: -32602, message: `Unknown tool: ${name}` });
  }
}

async function handleResourcesList(request: { id: number | string }): Promise<Response> {
  return jsonRpcResponse(request.id, {
    resources: [{
      uri: UI_RESOURCES.widget.uri,
      name: UI_RESOURCES.widget.name,
      description: UI_RESOURCES.widget.description,
      mimeType: UI_RESOURCES.widget.mimeType
    }]
  });
}

async function handleResourcesRead(
  request: { id: number | string; params?: unknown },
  env: Env
): Promise<Response> {
  const params = request.params as { uri?: string } | undefined;
  const { uri } = params || {};

  if (uri === UI_RESOURCES.widget.uri) {
    const html = await loadHtml(env.ASSETS, "/widget.html");
    return jsonRpcResponse(request.id, {
      contents: [{
        uri: UI_RESOURCES.widget.uri,
        mimeType: UI_MIME_TYPE,
        text: html,
        _meta: UI_RESOURCES.widget._meta
      }]
    });
  }

  return jsonRpcResponse(request.id, null, { code: -32602, message: `Unknown resource: ${uri}` });
}

async function handlePromptsList(request: { id: number | string }): Promise<Response> {
  // TODO: Add prompts here if needed
  return jsonRpcResponse(request.id, { prompts: [] });
}

// ============================================================================
// Helper Functions
// ============================================================================

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function jsonRpcResponse(id: number | string, result: unknown, error?: { code: number; message: string }): Response {
  const response: Record<string, unknown> = { jsonrpc: "2.0", id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" }
  });
}
