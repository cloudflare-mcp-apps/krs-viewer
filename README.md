# {{SERVER_NAME}} MCP Server

MCP Apps server with SEP-1865 interactive widget support, dual authentication (OAuth + API Key), and Cloudflare Workers deployment.

## Quick Start

### 1. Replace Placeholders

Search and replace these placeholders in all files:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{SERVER_NAME}}` | Human-readable name | "Currency Converter" |
| `{{SERVER_ID}}` | kebab-case identifier | "currency-converter" |
| `{{McpAgentClassName}}` | PascalCase class name | "CurrencyConverterMcp" |
| `{{SERVER_DESCRIPTION}}` | Brief description | "Convert currencies using real-time exchange rates" |
| `{{WIDGET_TITLE}}` | Widget HTML title | "Currency Converter Widget" |
| `{{GITHUB_ORG}}` | GitHub organization | "your-org" |

### 2. Update wrangler.jsonc

1. Replace `{{SERVER_ID}}` with your server ID
2. Replace `{{McpAgentClassName}}` with your class name
3. Update the custom domain pattern

### 3. Install and Build

```bash
npm install
npm run build:widgets
```

### 4. Set Secrets

```bash
wrangler secret put WORKOS_CLIENT_ID
wrangler secret put WORKOS_API_KEY
```

### 5. Deploy

Deployment is automatic via Cloudflare Workers Builds when you push to GitHub.

For manual deployment (not recommended):
```bash
npm run deploy
```

## Project Structure

```
src/
  index.ts              # Entry point with dual auth routing
  server.ts             # McpAgent class (OAuth path)
  api-key-handler.ts    # API key authentication with LRU cache
  types.ts              # Environment bindings
  server-instructions.ts # LLM system prompt instructions

  auth/
    authkit-handler.ts  # WorkOS OAuth with PKCE
    apiKeys.ts          # API key validation
    auth-utils.ts       # User lookup, HTML pages
    props.ts            # Auth context type
    session-types.ts    # Session interfaces

  helpers/
    assets.ts           # loadHtml() for widget loading

  resources/
    ui-resources.ts     # SEP-1865 UI resource definitions

  tools/
    descriptions.ts     # Tool metadata (4-part pattern)

  shared/
    logger.ts           # Structured logging

  optional/             # Advanced features (delete if not needed)

web/
  widgets/
    widget.html         # Widget entry point
    widget.tsx          # React widget component
  components/           # shadcn/ui components
  lib/                  # Utilities (cn, types)
  styles/               # Tailwind CSS
  dist/widgets/         # Built output (gitignored)
```

## Adding New Tools

When adding a tool, update these locations:

### 1. Tool Metadata (`src/tools/descriptions.ts`)
```typescript
"your-tool": {
  title: "Your Tool",
  description: {
    part1_purpose: "What it does...",
    part2_returns: "Returns X, Y, Z...",
    part3_useCase: "Use when...",
    part4_constraints: "Note: limitations..."
  },
  examples: [...]
}
```

### 2. Server Registration (`src/server.ts`)
```typescript
registerAppTool(
  this.server,
  "your-tool",
  {
    title: TOOL_METADATA["your-tool"].title,
    description: getToolDescription("your-tool"),
    inputSchema: { /* Zod schema */ },
    _meta: { [RESOURCE_URI_META_KEY]: widgetResource.uri }
  },
  async (args) => { /* implementation */ }
);
```

### 3. API Key Handler (`src/api-key-handler.ts`)
Duplicate the tool registration for API key authentication path.

## SEP-1865 MCP Apps Pattern

This skeleton uses the Two-Part Registration pattern:

1. **PART 1: Register Resource** - UI HTML template from Assets
2. **PART 2: Register Tool** - Links to resource via `_meta[RESOURCE_URI_META_KEY]`

Data flows:
```
Tool Result -> structuredContent -> postMessage -> Widget State
```

## Authentication

### OAuth 2.1 (OAuth-capable clients)
- Flow: `/authorize` -> WorkOS AuthKit -> `/callback` -> Tools
- PKCE support (RFC 7636)
- Centralized login at panel.wtyczki.ai
- Example clients: Claude Desktop

### API Key (Non-OAuth clients)
- Header: `Authorization: Bearer wtyk_xxxxx`
- Keys generated via panel.wtyczki.ai
- LRU cache prevents memory leaks
- Example clients: AnythingLLM, Cursor

## Widget Development

### Key Concepts

- React 18 with `useApp()` hook from `@modelcontextprotocol/ext-apps/react`
- Tailwind CSS with automatic dark mode (via host context)
- Fixed 600px height container (mandatory for MCP Apps)
- viteSingleFile inlines all JS/CSS into single HTML

### Development

```bash
# Build widget
npm run build:widgets

# Watch mode
npm run dev:widget

# Full dev (server + widget watch)
npm run dev:full
```

### Widget Lifecycle

```typescript
const { app } = useApp({
  onAppCreated: (app) => {
    app.ontoolinput = (params) => { /* tool called */ };
    app.ontoolresult = (result) => { /* display result */ };
    app.onhostcontextchanged = (ctx) => { /* theme change */ };
    app.onteardown = async () => { /* cleanup */ };
  }
});
```

## Configuration Files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Cloudflare Workers config (bindings, routes) |
| `vite.config.ts` | Widget build config |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config (server) |
| `web/tsconfig.json` | TypeScript config (widget) |

## Environment Variables

Set via `wrangler secret put`:

| Variable | Required | Description |
|----------|----------|-------------|
| `WORKOS_CLIENT_ID` | Yes | WorkOS client ID |
| `WORKOS_API_KEY` | Yes | WorkOS API key (starts with sk_) |
| `AI_GATEWAY_TOKEN` | No | AI Gateway token (if using Workers AI) |

## Common Issues

### Widget not loading
1. Check `npm run build:widgets` completed successfully
2. Verify `web/dist/widgets/widget.html` exists
3. Check ASSETS binding in wrangler.jsonc

### Authentication failures
1. Verify WORKOS_CLIENT_ID and WORKOS_API_KEY secrets are set
2. Check USER_SESSIONS KV namespace is configured
3. Ensure custom domain is set up in Cloudflare

### Tool not appearing
1. Check tool is registered in BOTH server.ts AND api-key-handler.ts
2. Verify tool name matches exactly in all locations
3. Check handleToolsList() includes the tool schema

## Production Checklist

- [ ] All `{{PLACEHOLDER}}` values replaced
- [ ] wrangler.jsonc configured with correct IDs
- [ ] Secrets set via `wrangler secret put`
- [ ] Custom domain configured in Cloudflare
- [ ] GitHub repository connected to Cloudflare Workers Builds
- [ ] Widget builds successfully (`npm run build:widgets`)
- [ ] Type checking passes (`npm run type-check`)