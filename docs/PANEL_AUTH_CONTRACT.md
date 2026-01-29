# Panel Authentication Contract

This document defines the contract between MCP servers and `panel.wtyczki.ai` for centralized authentication.

## Overview

All MCP servers share authentication through a centralized login at `panel.wtyczki.ai`. This enables Single Sign-On (SSO) across all 20+ MCP servers - users authenticate once and gain access to all servers.

## Shared Resources

| Resource | Binding | ID |
|----------|---------|-----|
| USER_SESSIONS KV | `USER_SESSIONS` | `e5ad189139cd44f38ba0224c3d596c73` |
| TOKEN_DB D1 | `TOKEN_DB` | `eac93639-d58e-4777-82e9-f1e28113d5b2` |
| WorkOS Client ID | `WORKOS_CLIENT_ID` | `client_01K7KRY0MM95MPAY1YD5PEQW8M` |

---

## Endpoint: `/auth/login-custom`

### URL
```
https://panel.wtyczki.ai/auth/login-custom
```

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `return_to` | Yes | Full URL to redirect after successful authentication |

### Example Request
```
https://panel.wtyczki.ai/auth/login-custom?return_to=https://quiz-mcp.wtyczki.ai/authorize?client_id=xxx&...
```

---

## Expected Panel Behavior

### 1. Display Email Input
Show a clean UI for entering email address for Magic Auth.

### 2. Send Magic Auth Code
Call WorkOS API to send 6-digit code:
```typescript
await workos.userManagement.sendMagicAuthCode({
  email: userEmail,
});
```
Code expires in **10 minutes**.

### 3. Verify Code
After user enters code, verify with WorkOS:
```typescript
const response = await workos.userManagement.authenticateWithMagicAuth({
  clientId: WORKOS_CLIENT_ID,
  code: sixDigitCode,
  email: userEmail,
});
// response contains: user, accessToken, refreshToken
```

### 4. Create Session in KV
Store enhanced session in USER_SESSIONS:

```typescript
const sessionToken = crypto.randomUUID();
const session: WorkOSSession = {
  user_id: response.user.id,
  email: response.user.email,
  expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
  refresh_token: response.refreshToken,
  created_at: Date.now(),
  last_accessed_at: Date.now(),
};

await USER_SESSIONS.put(
  `workos_session:${sessionToken}`,
  JSON.stringify(session),
  { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
);
```

### 5. Set Cookie
Set the session cookie with proper attributes:

```typescript
const cookie = [
  `workos_session=${sessionToken}`,
  `HttpOnly`,
  `Secure`,
  `SameSite=Lax`,
  `Max-Age=2592000`,        // 30 days in seconds
  `Domain=.wtyczki.ai`,     // Shared across all subdomains
  `Path=/`
].join('; ');

response.headers.set('Set-Cookie', cookie);
```

### 6. Redirect Back
Redirect to the `return_to` URL:
```typescript
return Response.redirect(returnTo, 302);
```

---

## Session Structure

```typescript
interface WorkOSSession {
  /** WorkOS user ID */
  user_id: string;

  /** User email address */
  email: string;

  /** Session expiration timestamp (milliseconds since epoch) */
  expires_at: number;

  /** WorkOS refresh token for session renewal */
  refresh_token: string;

  /** Session creation timestamp */
  created_at: number;

  /** Last access timestamp (updated on each validation) */
  last_accessed_at: number;
}
```

### KV Key Format
```
workos_session:{sessionToken}
```

### Example Session
```json
{
  "user_id": "user_01HXYZ...",
  "email": "user@example.com",
  "expires_at": 1735689600000,
  "refresh_token": "wrt_01HXYZ...",
  "created_at": 1733097600000,
  "last_accessed_at": 1733097600000
}
```

---

## Cookie Specification

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `HttpOnly` | true | Prevent XSS access |
| `Secure` | true | HTTPS only |
| `SameSite` | Lax | Allow cross-subdomain navigation |
| `Max-Age` | 2592000 | 30 days in seconds |
| `Domain` | .wtyczki.ai | Share across all subdomains |
| `Path` | / | Available on all paths |

---

## MCP Server Validation Flow

When an MCP server receives a request with `workos_session` cookie:

1. **Extract cookie** from `Cookie` header
2. **Query KV** for `workos_session:{token}`
3. **Check expiration** - if expired, attempt refresh with `refresh_token`
4. **Verify user** exists in TOKEN_DB and is not deleted
5. **Complete OAuth** with user's Props

### Auto-Refresh Logic

If session is expired but has valid `refresh_token`:

```typescript
const newAuth = await workos.userManagement.authenticateWithRefreshToken({
  clientId: WORKOS_CLIENT_ID,
  refreshToken: session.refresh_token,
});

// Update session with new refresh token
session.refresh_token = newAuth.refreshToken;
session.expires_at = Date.now() + (30 * 24 * 60 * 60 * 1000);
session.last_accessed_at = Date.now();

await USER_SESSIONS.put(
  `workos_session:${sessionToken}`,
  JSON.stringify(session),
  { expirationTtl: 30 * 24 * 60 * 60 }
);
```

---

## Error Handling

### User Not in Database
If email not found in TOKEN_DB:
- Show "Registration required" page
- Redirect to `panel.wtyczki.ai/?return_to={originalUrl}`

### User Deleted
If `is_deleted = 1` in TOKEN_DB:
- Show "Account deleted" page
- Link to `panel.wtyczki.ai` to create new account

### Session Expired + Refresh Failed
If refresh token is invalid/expired:
- Delete session from KV
- Redirect to `panel.wtyczki.ai/auth/login-custom?return_to={originalUrl}`

---

## Testing Checklist

- [ ] New user flow (email not in DB) → Registration page
- [ ] Existing user flow → Instant access
- [ ] Expired session with valid refresh → Auto-refresh
- [ ] Expired session with invalid refresh → Redirect to login
- [ ] Deleted user → Deleted account page
- [ ] Cross-subdomain SSO → Login on A, access B instantly
- [ ] 30-day cookie persistence → Browser remembers session
