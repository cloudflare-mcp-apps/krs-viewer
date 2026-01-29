/**
 * Widget Types for {{SERVER_NAME}} MCP
 *
 * TODO: Define your widget-specific types here
 */

/**
 * Example widget state
 */
export interface WidgetState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: unknown;
  error?: string;
}

/**
 * Example tool result type
 */
export interface ToolResultData {
  message: string;
  data: unknown;
  widget_uri?: string;
}
