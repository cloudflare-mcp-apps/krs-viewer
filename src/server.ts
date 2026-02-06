/**
 * KRS Company Viewer MCP Server
 *
 * McpAgent extension with OAuth authentication and SEP-1865 MCP Apps support.
 *
 * Provides company lookup from Polish KRS (Krajowy Rejestr Sądowy) registry
 * with visual card display in MCP Apps-enabled hosts.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { Env, ViewCompanyParams } from "./types.js";
import type { Props } from "./auth/props.js";
import { loadHtml } from "./helpers/assets.js";
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";
import { KrsClient, formatCompanyAsText } from "./krs-client.js";
import { logger } from "./shared/logger.js";

// Resource URI for company card widget
const RESOURCE_URI = "ui://krs-viewer/company-card.html";
const UI_MIME_TYPE = "text/html;profile=mcp-app";

// Zod 4 input schema (plain object, NOT z.object)
const ViewCompanyInput = {
  krs: z
    .string()
    .regex(/^\d{10}$/)
    .meta({ description: "10-digit KRS number (Krajowy Rejestr Sądowy)" }),
  type: z
    .enum(["aktualny", "pelny"])
    .optional()
    .meta({
      description:
        "Extract type: 'aktualny' (current, default) or 'pelny' (full history)",
    }),
};

/**
 * KRS Viewer MCP Server
 *
 * Stateless server for company lookup from Polish KRS registry.
 */
export class KrsViewer extends McpAgent<Env, unknown, Props> {
  server = new McpServer(
    {
      name: "krs-viewer",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  async init() {
    // Initialize KRS API client
    const krsClient = new KrsClient(this.env);

    // ========================================================================
    // PART 1: Register Resource (Company Card Widget)
    // ========================================================================
    this.server.registerResource(
      "company_card",
      RESOURCE_URI,
      {
        description:
          "Interactive company card widget displaying KRS registry data",
        mimeType: UI_MIME_TYPE,
      },
      async () => {
        const templateHTML = await loadHtml(
          this.env.ASSETS,
          "/company-card.html"
        );

        return {
          contents: [
            {
              uri: RESOURCE_URI,
              mimeType: UI_MIME_TYPE,
              text: templateHTML,
              _meta: {
                ui: {
                  csp: {
                    connectDomains: ["https://api-krs.ms.gov.pl"],
                  },
                  prefersBorder: true,
                },
              },
            },
          ],
        };
      }
    );

    logger.info({
      event: "ui_resource_registered",
      uri: RESOURCE_URI,
      name: "company_card",
    });

    // ========================================================================
    // PART 2: Register view_company Tool
    // ========================================================================
    this.server.registerTool(
      "view_company",
      {
        title: "View Polish Company",
        description:
          "Displays company data from Polish KRS registry as a visual card. Returns company details including name, legal form, address, share capital, representatives, and PKD activity codes. Use when user asks about a Polish company, wants to verify business partner, or needs KRS data for due diligence.",
        inputSchema: ViewCompanyInput,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true, // Calls external KRS API
        },
        outputSchema: z.object({
          name: z.string(),
          krs: z.string(),
          nip: z.string().nullable(),
          regon: z.string().nullable(),
          legalForm: z.string(),
          address: z.object({
            city: z.string(),
            voivodeship: z.string().optional(),
            street: z.string(),
            building: z.string().optional(),
            unit: z.string().nullable().optional(),
            postalCode: z.string(),
            country: z.string(),
          }),
          capital: z
            .object({
              value: z.string(),
              currency: z.string(),
            })
            .nullable(),
          representation: z
            .object({
              organName: z.string(),
              method: z.string(),
              members: z.array(
                z.object({
                  name: z.string(),
                  function: z.string(),
                })
              ),
            })
            .optional(),
          mainActivity: z.array(
            z.object({
              code: z.string(),
              description: z.string(),
            })
          ),
          registrationDate: z.string(),
          lastUpdate: z.string(),
        }),
        _meta: {
          ui: {
            resourceUri: RESOURCE_URI,
          },
        },
      },
      async (args) => {
        // Verify user is authenticated
        if (!this.props?.userId) {
          throw new Error("User ID not found in authentication context");
        }

        const { krs, type = "aktualny" } = args as ViewCompanyParams;

        logger.info({
          event: "tool_started",
          tool: "view_company",
          user_id: this.props.userId ?? "",
          user_email: this.props.email ?? "",
          action_id: krs,
          args: { krs, type },
        });

        const startTime = Date.now();

        try {
          // Fetch company data from KRS API
          const companyData = await krsClient.getCompany(krs, type);

          const duration = Date.now() - startTime;

          logger.info({
            event: "tool_completed",
            tool: "view_company",
            user_id: this.props.userId ?? "",
            user_email: this.props.email ?? "",
            action_id: krs,
            duration_ms: duration,
          });

          // Return both text fallback and structured data
          return {
            content: [
              {
                type: "text" as const,
                text:
                  formatCompanyAsText(companyData) +
                  "\n\nNext steps: Ask follow-up questions about this company's board, capital, or activities. " +
                  "For full historical data, call view_company again with type 'pelny'.",
              },
            ],
            structuredContent: companyData as unknown as Record<
              string,
              unknown
            >,
            _meta: {
              viewUUID: crypto.randomUUID(),
            },
          };
        } catch (error) {
          const duration = Date.now() - startTime;

          logger.error({
            event: "tool_failed",
            tool: "view_company",
            error: error instanceof Error ? error.message : String(error),
          });

          // Return user-friendly error message
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";

          return {
            content: [
              {
                type: "text" as const,
                text: `Error looking up KRS ${krs}: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // ========================================================================
    // Register lookup-company Prompt
    // ========================================================================
    this.server.registerPrompt(
      "lookup-company",
      {
        title: "Lookup Polish Company",
        description:
          "Search and display company data from Polish KRS registry by KRS number",
        argsSchema: {
          krs: z.string().meta({ description: "KRS number to lookup" }),
        },
      },
      async ({ krs }) => {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please use the 'view_company' tool to look up the Polish company with KRS number: ${krs}`,
              },
            },
          ],
        };
      }
    );

    logger.info({ event: "server_started", auth_mode: "dual" });
  }
}
