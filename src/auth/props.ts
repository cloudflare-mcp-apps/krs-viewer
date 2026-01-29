import type { User } from "@workos-inc/node";

/**
 * Props type for authenticated user context in your MCP Server
 *
 * This type defines the authentication and authorization data that will be
 * available via `this.props` in the McpAgent after successful OAuth flow.
 *
 * Data comes from WorkOS AuthKit after Magic Auth authentication.
 */
export interface Props {
    // WorkOS authentication data
    /** WorkOS user object containing id, email, firstName, lastName, etc. */
    user: User;

    /** JWT access token issued by WorkOS for this session */
    accessToken: string;

    /** Refresh token for renewing the access token when it expires */
    refreshToken: string;

    /** Array of permission slugs assigned to this user (e.g., ["tool_access", "admin"]) */
    permissions: string[];

    /** Optional: WorkOS organization ID if user belongs to an organization */
    organizationId?: string;

    // User identification
    /** User ID (from database) */
    userId: string;

    /** User email address */
    email: string;

    /**
     * Index signature required by McpAgent generic Props type
     * Allows additional custom properties to be stored in the auth context
     */
    [key: string]: unknown;
}
