/**
 * Constants for {{SERVER_NAME}} MCP Server
 *
 * Centralizes all configuration values.
 */

/**
 * LRU cache configuration for API key handler
 *
 * Controls server instance caching behavior to optimize performance.
 */
export const CACHE_CONFIG = {
  MAX_SERVERS: 1000,
  EVICTION_POLICY: 'LRU' as const
} as const;

/**
 * Server configuration
 *
 * Core MCP server metadata.
 */
export const SERVER_CONFIG = {
  NAME: "{{SERVER_NAME}}",
  VERSION: "1.0.0"
} as const;
