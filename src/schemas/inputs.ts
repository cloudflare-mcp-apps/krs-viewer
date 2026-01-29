/**
 * Input Schemas for {{SERVER_NAME}} MCP Tools
 *
 * Zod validation schemas for tool input parameters.
 * Use Zod 4 syntax with plain objects (ZodRawShapeCompat pattern).
 *
 * IMPORTANT: Define schemas as plain objects with Zod fields, NOT z.object()!
 * The MCP SDK expects ZodRawShapeCompat format for inputSchema.
 *
 * @module schemas/inputs
 */

import * as z from "zod/v4";

/**
 * Input schema for example_tool
 *
 * Pattern: Plain object with Zod fields (ZodRawShapeCompat)
 * This is the CORRECT pattern for MCP SDK inputSchema.
 *
 * TODO: Replace with your tool's input parameters
 */
export const ExampleToolInput = {
  query: z.string()
    .min(1)
    .meta({ description: "The search query or input value" }),
  format: z.enum(["concise", "detailed"])
    .optional()
    .meta({ description: "Response format: concise (default) or detailed" }),
};

/**
 * Type definition (manual since it's a plain object, not z.object())
 *
 * NOTE: With plain object pattern, use interface instead of z.infer<>
 */
export interface ExampleToolParams {
  query: string;
  format?: "concise" | "detailed";
}

// TODO: Add more input schemas for your tools
//
// CORRECT Pattern:
// export const MyToolInput = {
//   field: z.string().meta({ description: "..." }),
//   optional_field: z.number().optional().meta({ description: "..." }),
// };
// export interface MyToolParams {
//   field: string;
//   optional_field?: number;
// }
//
// WRONG Pattern (don't use z.object):
// export const WrongInput = z.object({ ... }).shape;  // ❌ Broken in Zod 4
