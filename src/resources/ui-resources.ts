/**
 * MCP App UI Resource Definitions (SEP-1865)
 *
 * Defines UI resources that can be linked to MCP tools via the
 * _meta["ui/resourceUri"] field, enabling rich interactive widgets
 * to be displayed in MCP-capable chat clients.
 *
 * Pattern: Two-Part Registration
 * 1. Register Resource (UI Template) - via registerAppResource or server.registerResource
 * 2. Register Tool with _meta linkage - tool._meta[RESOURCE_URI_META_KEY] = resource.uri
 *
 * @see https://github.com/modelcontextprotocol/specification/blob/main/docs/specification/extensions/sep-1865-mcp-apps.md
 */

/**
 * MIME type for MCP App UI resources
 * Uses profile parameter to indicate MCP App compliance
 *
 * Note: This value matches the SEP-1865 specification
 * Import from @modelcontextprotocol/ext-apps if available, or use this constant
 */
export const UI_MIME_TYPE = "text/html;profile=mcp-app" as const;

/**
 * UI Resource metadata structure per SEP-1865 specification
 */
export interface UIResourceMeta {
  ui?: {
    /**
     * Content Security Policy configuration
     * Servers declare which external origins their UI needs to access.
     */
    csp?: {
      /** Origins for network requests (fetch/XHR/WebSocket) */
      connectDomains?: string[];
      /** Origins for static resources (images, scripts, stylesheets, fonts) */
      resourceDomains?: string[];
    };
    /** Dedicated origin for widget sandbox */
    domain?: string;
    /** Visual boundary preference */
    prefersBorder?: boolean;
  };
}

/**
 * Predeclared UI resource definition
 */
export interface UIResourceDefinition {
  /** Unique URI using ui:// scheme (e.g., "ui://server-name/widget-name") */
  uri: string;
  /** Human-readable name for the resource */
  name: string;
  /** Description of the resource's purpose */
  description: string;
  /** MIME type - must be "text/html;profile=mcp-app" for SEP-1865 */
  mimeType: typeof UI_MIME_TYPE;
  /** Resource metadata including CSP and display preferences */
  _meta: UIResourceMeta;
}

/**
 * UI Resources Registry
 *
 * Define your widgets here. Each widget should:
 * 1. Have a unique URI using ui:// scheme
 * 2. Be built by Vite into web/dist/widgets/
 * 3. Be loaded via loadHtml(env.ASSETS, "/widget-name.html")
 *
 * TODO: Replace {{SERVER_ID}} with your actual server ID
 * TODO: Update widget definitions for your use case
 */
export const UI_RESOURCES = {
  /**
   * Main Widget
   *
   * TODO: Replace with your actual widget configuration
   *
   * Used by: your_tool_name tool
   * Data delivery: Via ui/notifications/tool-result postMessage
   */
  widget: {
    /** Unique URI identifying this UI resource */
    uri: "ui://{{SERVER_ID}}/widget",

    /** Resource name for registration and logging */
    name: "main_widget",

    /** Human-readable description */
    description:
      "Interactive widget for {{SERVER_NAME}}. " +
      "TODO: Replace with a detailed description of what this widget displays and its features.",

    /** MIME type indicating this is an MCP App */
    mimeType: UI_MIME_TYPE,

    /** SEP-1865 UI metadata */
    _meta: {
      ui: {
        csp: {
          // connectDomains: Empty because all data comes via MCP protocol (no external API calls from widget)
          // If your widget needs to call external APIs, add domains here
          connectDomains: [] as string[],
          // resourceDomains: Empty because all resources (React, CSS) are inlined by viteSingleFile
          // Add domains here if you load external images, scripts, or fonts
          resourceDomains: [] as string[],
        },
        /** Request visible border from host client */
        prefersBorder: true,
      },
    },
  },
} as const;

/**
 * Type helper for UI resource URIs
 */
export type UiResourceUri = typeof UI_RESOURCES[keyof typeof UI_RESOURCES]["uri"];

/**
 * Extension identifier for capability negotiation
 * Hosts advertise support via extensions["io.modelcontextprotocol/ui"]
 */
export const UI_EXTENSION_ID = "io.modelcontextprotocol/ui";

/**
 * Check if client capabilities include MCP Apps UI support
 *
 * @param clientCapabilities - Client capabilities from initialize response
 * @returns true if client supports MCP Apps UI
 */
export function hasUISupport(clientCapabilities: unknown): boolean {
  if (!clientCapabilities || typeof clientCapabilities !== "object") {
    return false;
  }

  const caps = clientCapabilities as Record<string, unknown>;
  const extensions = caps.extensions as Record<string, unknown> | undefined;

  if (!extensions) {
    return false;
  }

  const uiExtension = extensions[UI_EXTENSION_ID] as
    | Record<string, unknown>
    | undefined;

  if (!uiExtension) {
    return false;
  }

  const mimeTypes = uiExtension.mimeTypes as string[] | undefined;

  if (!Array.isArray(mimeTypes)) {
    return false;
  }

  return mimeTypes.includes(UI_MIME_TYPE);
}