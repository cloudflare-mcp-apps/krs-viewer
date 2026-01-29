/**
 * Tool Registry
 *
 * Central export point for all {{SERVER_NAME}} MCP tools.
 * Provides clean imports for server.ts and api-key-handler.ts
 *
 * @module tools
 */

// Tool metadata
export { TOOL_METADATA, getToolDescription, getToolExamples } from './descriptions';
export type { ToolMetadata, ToolName } from './descriptions';

// TODO: Add your tool executor exports here
// Example:
// export { executeYourTool } from './your-tool';
