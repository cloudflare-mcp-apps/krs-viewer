/**
 * Tool Descriptions and Metadata
 *
 * Centralized metadata for all MCP server tools.
 * Follows the 4-part description pattern from TOOL_DESCRIPTION_BEST_PRACTICES.md
 *
 * Pattern: Purpose -> Returns -> Use Case -> Constraints
 *
 * Security Notes:
 * - NO API/service names in descriptions (only functional capabilities)
 * - NO implementation details (e.g., "fast and cheap", "bounding box")
 *
 * @module tools/descriptions
 */

/**
 * Metadata structure for a single tool
 */
export interface ToolMetadata {
  /** Display name for UI and tool listings */
  title: string;

  /** 4-part description pattern */
  description: {
    /** Part 1: Action verb + what it does (1-2 sentences) */
    part1_purpose: string;

    /** Part 2: Explicit data fields returned (1 sentence) */
    part2_returns: string;

    /** Part 3: When/why to use this tool (1 sentence) */
    part3_useCase: string;

    /** Part 4: Limitations, edge cases, constraints (1-3 sentences) */
    part4_constraints: string;
  };

  /** Use case examples for documentation and testing */
  examples: {
    /** Short scenario name */
    scenario: string;

    /** Detailed description of the use case */
    description: string;
  }[];
}

/**
 * Tool metadata registry
 *
 * TODO: Replace example tool with your actual tools
 *
 * Contains complete metadata for all tools including descriptions
 * and use case examples.
 */
export const TOOL_METADATA = {
  /**
   * Example Tool
   *
   * TODO: Replace with your actual tool definitions
   * Each tool should follow the 4-part description pattern:
   * 1. Purpose: What it does
   * 2. Returns: What data it returns
   * 3. Use Case: When to use it
   * 4. Constraints: Limitations and edge cases
   */
  "example-tool": {
    title: "Example Tool",

    description: {
      part1_purpose: "Performs an example operation on the provided input.",

      part2_returns: "Returns the result object with processed data, status, and metadata fields.",

      part3_useCase: "Use this when you need to demonstrate the tool pattern or test the MCP server setup.",

      part4_constraints: "Note: This is a placeholder tool. Replace with your actual implementation. Input must be non-empty."
    },

    examples: [
      {
        scenario: "Basic usage",
        description: "Call the tool with a simple input to verify server connectivity"
      },
      {
        scenario: "Error handling",
        description: "Test tool behavior with invalid input to verify error responses"
      }
    ]
  } as const satisfies ToolMetadata,

  // TODO: Add your tools here following this pattern:
  //
  // "your-tool-name": {
  //   title: "Your Tool Name",
  //   description: {
  //     part1_purpose: "What the tool does...",
  //     part2_returns: "Returns X, Y, Z...",
  //     part3_useCase: "Use when...",
  //     part4_constraints: "Note: limitations..."
  //   },
  //   examples: [
  //     { scenario: "Example 1", description: "..." }
  //   ]
  // } as const satisfies ToolMetadata,

} as const;

/**
 * Type-safe tool name (for autocomplete and validation)
 */
export type ToolName = keyof typeof TOOL_METADATA;

/**
 * Generate full tool description from metadata
 *
 * Concatenates all 4 parts of the description pattern into a single string
 * suitable for the MCP tool registration `description` field.
 *
 * @param toolName - Name of the tool (type-safe)
 * @returns Full description string following 4-part pattern
 *
 * @example
 * ```typescript
 * const desc = getToolDescription("example-tool");
 * // Returns: "Performs an example operation... Returns the result... Use this when... Note: ..."
 * ```
 */
export function getToolDescription(toolName: ToolName): string {
  const meta = TOOL_METADATA[toolName];
  const { part1_purpose, part2_returns, part3_useCase, part4_constraints } = meta.description;

  return `${part1_purpose} ${part2_returns} ${part3_useCase} ${part4_constraints}`;
}

/**
 * Get all use case examples for a tool
 *
 * Retrieves documented use cases for testing and documentation purposes.
 *
 * @param toolName - Name of the tool (type-safe)
 * @returns Array of use case examples
 *
 * @example
 * ```typescript
 * const examples = getToolExamples("example-tool");
 * // Returns: [{ scenario: "Basic usage", description: "..." }, ...]
 * ```
 */
export function getToolExamples(toolName: ToolName): readonly { scenario: string; description: string }[] {
  return TOOL_METADATA[toolName].examples;
}