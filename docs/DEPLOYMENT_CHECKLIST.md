# Deployment Checklist for {{SERVER_NAME}}

## Pre-Deployment

### 1. Configuration
- [ ] All `{{PLACEHOLDER}}` values replaced
- [ ] `wrangler.jsonc` updated with correct server name
- [ ] Custom domain configured in `routes`
- [ ] Durable Object class name matches in migrations and bindings

### 2. Authentication
- [ ] WorkOS secrets configured: `wrangler secret put WORKOS_CLIENT_ID`
- [ ] WorkOS secrets configured: `wrangler secret put WORKOS_API_KEY`
- [ ] AI Gateway token (if using AI): `wrangler secret put AI_GATEWAY_TOKEN`

### 3. Build Verification
- [ ] `npm run type-check` passes without errors
- [ ] `npm run build:widgets` succeeds
- [ ] Widget HTML generated in `web/dist/widgets/`

### 4. Tool Registration
- [ ] All tools registered in `src/server.ts` (OAuth path)
- [ ] All tools registered in `src/api-key-handler.ts` (API key path)
- [ ] Tool schemas defined in `src/schemas/`
- [ ] Tool metadata in `src/tool-descriptions.ts`

### 5. Widget
- [ ] Fixed 600px height implemented
- [ ] Dark mode support via onhostcontextchanged
- [ ] All event handlers registered before connect()
- [ ] Security self-test runs on mount (optional)

## Deployment

```bash
# Deploy to Cloudflare
npm run deploy
```

## Post-Deployment

### 1. Verification
- [ ] Custom domain accessible
- [ ] OAuth flow works (test with Claude Desktop)
- [ ] API key authentication works (test with curl)
- [ ] Widget loads correctly

### 2. Monitoring
- [ ] Cloudflare Workers logs enabled
- [ ] AI Gateway dashboard accessible (if using AI)

## Rollback

If issues occur:
```bash
# List deployments
wrangler deployments list

# Rollback to previous
wrangler rollback
```
