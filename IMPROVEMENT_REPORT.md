# Improvement Report: KRS Viewer

**Generated:** 2026-02-06
**Analyzed Files:** 28

## Executive Summary

- **Overall Score:** 8.5/10
- **Critical Issues:** 0
- **High Priority:** 2
- **Medium Priority:** 3
- **Low Priority:** 4
- **Opportunities:** 5

**Summary:** KRS Viewer is a well-architected MCP server following most best practices. The server demonstrates strong adherence to core principles including proper tool consolidation (1 tool), excellent description independence, effective noise reduction, and appropriate security patterns. The implementation shows solid Cloudflare integration with KV caching and Assets binding. Main areas for improvement include adding instructional feedback to guide next actions, implementing output schema for structured responses, and exploring Cloudflare capabilities like Workers AI for enhanced data processing.

---

## 1. Tool Interface Design

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Anti-Mirror | ✅ OK | Single consolidated tool instead of API endpoint mapping |
| Consolidation | ✅ OK | One `view_company` tool returns all data in single call |
| Selective Exposure | ✅ OK | Only exposes safe read-only operation; no dangerous tools |
| Description Independence | ✅ OK | Tool description is comprehensive and self-contained |

**Analysis:**

The server follows the Anti-Mirror Rule excellently by providing a single purpose-driven tool (`view_company`) rather than mirroring KRS API endpoints. The tool description at lines 113-115 is comprehensive:

```typescript
"Displays company data from Polish KRS registry as a visual card. Returns company 
details including name, legal form, address, share capital, representatives, and 
PKD activity codes. Use when user asks about a Polish company, wants to verify 
business partner, or needs KRS data for due diligence."
```

This description is fully self-contained, explaining:
- What the tool does
- What data it returns
- When to use it
- Business context (due diligence, verification)

The input schema (lines 25-37) properly uses Zod 4 `.meta()` syntax with clear descriptions and validation rules.

### Recommendations

**[LOW]** Consider adding usage examples in tool description for KRS number format clarity.

```typescript
description: `Displays company data from Polish KRS registry as a visual card. Returns 
company details including name, legal form, address, share capital, representatives, and 
PKD activity codes. Use when user asks about a Polish company, wants to verify business 
partner, or needs KRS data for due diligence.

Examples:
- "Show me company KRS 0000821672"
- "Look up 0001234567 in KRS registry"`,
```

---

## 2. Response Engineering

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Binary Results | ✅ OK | Returns complete CompanyData object with all details |
| Instructional Feedback | ⚠️ MISSING | No `next_steps` or `available_actions` in responses |
| Noise Reduction | ✅ OK | Excellent data transformation removes API noise |
| Structured Output | ⚠️ MISSING | Missing `outputSchema` on tool definition |

**Analysis:**

**Eliminate Binary Results - EXCELLENT:**
The tool returns comprehensive data (lines 164-178), not just success/failure flags. The response includes actionable data: company name, KRS number, full address, board members, etc.

**Noise Reduction - EXCELLENT:**
The `transformResponse()` method (lines 85-172 in krs-client.ts) demonstrates excellent noise reduction:
- Raw API response has nested structures like `odpis.dane.dzial1.danePodmiotu.nazwa`
- Transformed to flat, readable structure: `{ name: "...", krs: "...", address: {...} }`
- Removes internal metadata fields
- Formats for human readability (e.g., PKD codes as "XX.XX.XX")

**Instructional Feedback - MISSING:**
Responses don't guide the LLM on what to do next. After displaying company data, the LLM has no explicit guidance about available follow-up actions.

**Structured Output - MISSING:**
The tool doesn't define an `outputSchema` in its registration, making it harder for downstream agents to understand the response structure programmatically.

### Recommendations

**[HIGH]** Add `next_steps` to success responses to guide LLM behavior.

```typescript
// In server.ts, line 164-178
return {
  content: [
    {
      type: "text" as const,
      text: formatCompanyAsText(companyData) + 
        "\n\nℹ️ Next steps: You can ask follow-up questions about this company's " +
        "financial status, board members, or business activities. For historical data, " +
        "request 'pelny' (full) extract type."
    }
  ],
  structuredContent: companyData as unknown as Record<string, unknown>,
  _meta: {
    viewUUID: crypto.randomUUID(),
  },
};
```

**[MEDIUM]** Define `outputSchema` on tool registration for better agent interoperability.

```typescript
// In server.ts, after line 122
this.server.registerTool(
  "view_company",
  {
    title: "View Polish Company",
    description: "...",
    inputSchema: ViewCompanyInput,
    outputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        krs: { type: "string", pattern: "^\\d{10}$" },
        nip: { type: ["string", "null"] },
        regon: { type: ["string", "null"] },
        legalForm: { type: "string" },
        address: {
          type: "object",
          properties: {
            city: { type: "string" },
            street: { type: "string" },
            postalCode: { type: "string" }
          }
        },
        capital: {
          type: ["object", "null"],
          properties: {
            value: { type: "string" },
            currency: { type: "string" }
          }
        },
        representation: {
          type: "object",
          properties: {
            organName: { type: "string" },
            members: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  function: { type: "string" }
                }
              }
            }
          }
        }
      },
      required: ["name", "krs", "legalForm", "address"]
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    _meta: {
      ui: {
        resourceUri: RESOURCE_URI,
      },
    },
  },
  async (args) => { /* ... */ }
);
```

**[MEDIUM]** Enhance error responses with recovery suggestions.

```typescript
// In server.ts, lines 189-200
return {
  content: [
    {
      type: "text" as const,
      text: `Error looking up KRS ${krs}: ${errorMessage}\n\n` +
        `💡 Suggestions:\n` +
        `- Verify the KRS number is exactly 10 digits\n` +
        `- Check if the company is registered in the 'P' register (businesses)\n` +
        `- Try again in a moment if this is a temporary API issue`
    }
  ],
  isError: true,
};
```

---

## 3. Context Management

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Tool Count | ✅ OK | 1 tool (ideal: <15) |
| Progressive Disclosure | N/A | Not applicable with single tool |
| Filesystem Utilization | N/A | Data size doesn't require file references |

**Analysis:**

Excellent context management with only 1 registered tool. The tool returns ~2-3KB of data (typical company record), which is well within acceptable limits for inline responses. No need for file references or progressive disclosure patterns.

### Recommendations

No improvements needed in this category.

---

## 4. Security & Reliability

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Model Suspicion | ✅ OK | Server-side validation with regex, API-level validation |
| Identity Verification | ✅ OK | OAuth properly implemented via McpAgent + WorkOS |
| Context Rot Resilience | ✅ OK | Tool is self-contained, no conversation state dependency |

**Analysis:**

**Model Suspicion - EXCELLENT:**
- Server validates KRS format with regex: `/^\d{10}$/` (line 28)
- Server-side authentication check: `if (!this.props?.userId)` (lines 131-133)
- KRS API validates on server side (lines 61-69 in krs-client.ts)
- Proper error handling for 404, 400, timeout scenarios

**Identity Verification - EXCELLENT:**
OAuth implementation uses WorkOS AuthKit with proper session management. The McpAgent pattern with Durable Objects provides per-user session isolation.

**Context Rot Resilience - EXCELLENT:**
Tool is fully self-contained:
- Requires explicit `krs` parameter (no conversation history dependency)
- Validates input regardless of previous calls
- Returns complete data (no incremental state building)

### Recommendations

**[LOW]** Add rate limiting for excessive KRS lookups to prevent abuse.

```typescript
// In server.ts, before line 149
// Check rate limit (example: 10 requests per minute per user)
const rateLimitKey = `ratelimit:${this.props.userId}`;
const currentCount = await this.env.CACHE_KV.get(rateLimitKey);
if (currentCount && parseInt(currentCount) >= 10) {
  throw new Error("Rate limit exceeded. Please wait before making more requests.");
}
await this.env.CACHE_KV.put(
  rateLimitKey, 
  String(parseInt(currentCount || "0") + 1),
  { expirationTtl: 60 }
);
```

**[LOW]** Add input sanitization for XSS prevention in widget display.

The server currently passes raw API data to the widget. While the KRS API is trusted, adding sanitization provides defense-in-depth:

```typescript
// Create a helper function in krs-client.ts
function sanitizeString(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Apply in transformResponse (lines 129-171)
return {
  name: sanitizeString(dzial1.danePodmiotu.nazwa),
  legalForm: sanitizeString(dzial1.danePodmiotu.formaPrawna),
  // ... etc
};
```

---

## 5. Cloudflare Capability Opportunities

| Capability | Current | Potential | Effort |
|------------|---------|-----------|--------|
| Durable Objects | ✅ Used | Session state for search history, favorites | Low |
| D1 | ❌ Not Used | Store user search history, company watchlists | Medium |
| Workers AI | ❌ Not Used | Semantic search by company description, risk analysis | Medium |
| Vectorize | ❌ Not Used | Semantic company search, similar companies | High |
| AI Gateway | ⚠️ Configured | Enable caching for repeated AI queries | Low |
| Browser Rendering | ❌ Not Used | Generate PDF reports of company data | Medium |
| R2 | ❌ Not Used | Store generated reports, export historical data | Low |
| Queues | ❌ Not Used | Background company data updates, scheduled checks | Medium |
| Workflows | ❌ Not Used | Multi-step due diligence workflows | High |

### High-Value Opportunities

#### 1. D1 for User History & Watchlists (MEDIUM EFFORT, HIGH VALUE)

**Opportunity:** Store user's search history and company watchlists for quick access.

**Implementation:**

```sql
-- Schema
CREATE TABLE search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  krs TEXT NOT NULL,
  company_name TEXT,
  searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_searches (user_id, searched_at DESC)
);

CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  krs TEXT NOT NULL,
  company_name TEXT,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(user_id, krs)
);
```

```typescript
// New tools to add
this.server.registerTool(
  "get_search_history",
  {
    title: "Get Search History",
    description: "Returns your recent KRS lookups",
    inputSchema: {
      limit: z.number().optional().meta({ 
        description: "Number of results (default 10)" 
      })
    }
  },
  async ({ limit = 10 }) => {
    const results = await this.env.DB.prepare(
      "SELECT krs, company_name, searched_at FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT ?"
    ).bind(this.props.userId, limit).all();
    
    return {
      content: [{ type: "text", text: JSON.stringify(results.results) }],
      structuredContent: results.results
    };
  }
);

// Save to history after successful lookup (in view_company)
await this.env.DB.prepare(
  "INSERT INTO search_history (user_id, krs, company_name) VALUES (?, ?, ?)"
).bind(this.props.userId, krs, companyData.name).run();
```

**Business Value:**
- Improved UX with quick access to previously viewed companies
- Foundation for company monitoring/alerts
- Analytics on user behavior

---

#### 2. Workers AI for Company Risk Analysis (MEDIUM EFFORT, HIGH VALUE)

**Opportunity:** Use Workers AI to analyze company data and provide risk insights.

**Implementation:**

```typescript
// Add new tool
this.server.registerTool(
  "analyze_company_risk",
  {
    title: "Analyze Company Risk",
    description: "Performs AI-powered risk analysis of company data",
    inputSchema: {
      krs: z.string().regex(/^\d{10}$/).meta({ 
        description: "10-digit KRS number" 
      }),
      focus_areas: z.array(z.enum([
        "financial_stability",
        "governance", 
        "legal_compliance",
        "business_continuity"
      ])).optional().meta({
        description: "Specific risk areas to analyze"
      })
    }
  },
  async ({ krs, focus_areas }) => {
    // Fetch company data
    const krsClient = new KrsClient(this.env);
    const companyData = await krsClient.getCompany(krs);
    
    // Prepare analysis prompt
    const prompt = `Analyze this Polish company for business risks:

Company: ${companyData.name}
Legal Form: ${companyData.legalForm}
Capital: ${companyData.capital?.value} ${companyData.capital?.currency}
Board Members: ${companyData.representation.members.length}
Main Activity: ${companyData.mainActivity.map(a => a.description).join(", ")}

${focus_areas ? `Focus on: ${focus_areas.join(", ")}` : "Provide general risk assessment"}

Provide:
1. Risk level (Low/Medium/High)
2. Key risk factors
3. Recommendations for due diligence`;

    // Call Workers AI
    const aiResponse = await this.env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      { 
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000
      }
    );
    
    return {
      content: [{ 
        type: "text", 
        text: aiResponse.response 
      }],
      structuredContent: {
        company: companyData.name,
        krs,
        analysis: aiResponse.response,
        generated_at: new Date().toISOString()
      }
    };
  }
);
```

**Business Value:**
- Adds AI-powered insights to raw registry data
- Differentiates from basic KRS lookup services
- Supports automated due diligence workflows

**Required wrangler.jsonc changes:**

```jsonc
"ai": {
  "binding": "AI"
}
```

---

#### 3. Browser Rendering for PDF Reports (MEDIUM EFFORT, MEDIUM VALUE)

**Opportunity:** Generate professional PDF reports of company data for offline use.

**Implementation:**

```typescript
this.server.registerTool(
  "generate_company_report",
  {
    title: "Generate Company Report",
    description: "Creates a PDF report of company data",
    inputSchema: {
      krs: z.string().regex(/^\d{10}$/).meta({ 
        description: "10-digit KRS number" 
      }),
      format: z.enum(["pdf", "html"]).optional().meta({
        description: "Report format (default: pdf)"
      })
    }
  },
  async ({ krs, format = "pdf" }) => {
    const krsClient = new KrsClient(this.env);
    const companyData = await krsClient.getCompany(krs);
    
    // Generate HTML template
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #2c3e50; }
    .section { margin: 20px 0; }
    .label { font-weight: bold; }
  </style>
</head>
<body>
  <h1>${companyData.name}</h1>
  <div class="section">
    <span class="label">KRS:</span> ${companyData.krs}<br>
    <span class="label">NIP:</span> ${companyData.nip || "N/A"}<br>
    <span class="label">Legal Form:</span> ${companyData.legalForm}
  </div>
  <div class="section">
    <h2>Address</h2>
    ${companyData.address.street} ${companyData.address.building}<br>
    ${companyData.address.postalCode} ${companyData.address.city}
  </div>
  <!-- Add more sections -->
</body>
</html>`;
    
    if (format === "html") {
      return {
        content: [{ type: "text", text: html }],
        structuredContent: { html, company: companyData.name }
      };
    }
    
    // Generate PDF using Browser Rendering
    const browser = await puppeteer.launch(this.env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html);
    const pdfBuffer = await page.pdf({ format: "A4" });
    await browser.close();
    
    // Store in R2
    const fileName = `krs-report-${krs}-${Date.now()}.pdf`;
    await this.env.REPORTS_BUCKET.put(fileName, pdfBuffer);
    
    return {
      content: [{ 
        type: "text", 
        text: `Report generated: ${fileName}` 
      }],
      structuredContent: {
        fileName,
        downloadUrl: `https://your-domain.com/reports/${fileName}`,
        krs,
        company: companyData.name
      }
    };
  }
);
```

**Required wrangler.jsonc changes:**

```jsonc
"browser": {
  "binding": "BROWSER"
},
"r2_buckets": [
  {
    "binding": "REPORTS_BUCKET",
    "bucket_name": "krs-reports"
  }
]
```

**Business Value:**
- Enables offline sharing of company information
- Professional presentation for business use
- Export functionality for record-keeping

---

#### 4. Queues for Background Updates (LOW EFFORT, MEDIUM VALUE)

**Opportunity:** Monitor watchlisted companies for changes using background jobs.

**Implementation:**

```typescript
// Add to watchlist tool with monitoring option
this.server.registerTool(
  "add_to_watchlist",
  {
    title: "Add Company to Watchlist",
    description: "Monitor a company for changes",
    inputSchema: {
      krs: z.string().regex(/^\d{10}$/).meta({ 
        description: "10-digit KRS number" 
      }),
      notify_on_change: z.boolean().optional().meta({
        description: "Send notification when data changes (default: true)"
      })
    }
  },
  async ({ krs, notify_on_change = true }) => {
    // Save to D1
    await this.env.DB.prepare(
      "INSERT INTO watchlists (user_id, krs, company_name) VALUES (?, ?, ?)"
    ).bind(this.props.userId, krs, companyData.name).run();
    
    if (notify_on_change) {
      // Schedule daily check via Queue
      await this.env.COMPANY_MONITOR_QUEUE.send({
        userId: this.props.userId,
        krs,
        lastChecked: new Date().toISOString()
      });
    }
    
    return {
      content: [{ 
        type: "text", 
        text: `Added ${companyData.name} to watchlist. You'll be notified of any changes.` 
      }],
      structuredContent: { krs, monitoring: notify_on_change }
    };
  }
);

// Consumer worker (separate file)
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const { userId, krs, lastChecked } = message.body;
      
      // Fetch current data
      const krsClient = new KrsClient(env);
      const currentData = await krsClient.getCompany(krs);
      
      // Compare with stored snapshot
      const stored = await env.DB.prepare(
        "SELECT company_snapshot FROM watchlists WHERE user_id = ? AND krs = ?"
      ).bind(userId, krs).first();
      
      if (JSON.stringify(currentData) !== stored.company_snapshot) {
        // Data changed - notify user
        await env.NOTIFICATION_QUEUE.send({
          userId,
          message: `Company ${currentData.name} (KRS ${krs}) has been updated.`,
          type: "company_change"
        });
        
        // Update snapshot
        await env.DB.prepare(
          "UPDATE watchlists SET company_snapshot = ? WHERE user_id = ? AND krs = ?"
        ).bind(JSON.stringify(currentData), userId, krs).run();
      }
      
      message.ack();
    }
  }
};
```

**Required wrangler.jsonc changes:**

```jsonc
"queues": {
  "producers": [
    { "binding": "COMPANY_MONITOR_QUEUE", "queue": "company-monitor" }
  ],
  "consumers": [
    { "queue": "company-monitor", "max_batch_size": 10, "max_batch_timeout": 30 }
  ]
}
```

**Business Value:**
- Proactive monitoring of business partners
- Automated compliance tracking
- Early warning system for corporate changes

---

#### 5. Durable Objects for Collaborative Analysis (LOW EFFORT, HIGH VALUE)

**Opportunity:** Enable real-time collaborative company analysis sessions.

**Current State:** Server uses Durable Objects via McpAgent for per-user sessions.

**Enhancement:** Add shared session capability for team collaboration.

```typescript
// New tool
this.server.registerTool(
  "create_analysis_session",
  {
    title: "Create Analysis Session",
    description: "Start a shared company analysis session",
    inputSchema: {
      krs: z.string().regex(/^\d{10}$/).meta({ 
        description: "10-digit KRS number" 
      }),
      collaborators: z.array(z.string()).optional().meta({
        description: "Email addresses of team members"
      })
    }
  },
  async ({ krs, collaborators = [] }) => {
    const sessionId = crypto.randomUUID();
    
    // Store session in Durable Object storage
    await this.state.storage.put(`session:${sessionId}`, {
      krs,
      creator: this.props.userId,
      collaborators,
      notes: [],
      createdAt: new Date().toISOString()
    });
    
    return {
      content: [{ 
        type: "text", 
        text: `Analysis session created. Share ID: ${sessionId}` 
      }],
      structuredContent: {
        sessionId,
        krs,
        shareUrl: `https://krs-viewer.wtyczki.ai/session/${sessionId}`,
        collaborators
      }
    };
  }
);
```

**Business Value:**
- Team collaboration on due diligence
- Shared note-taking and analysis
- Real-time updates for multiple analysts

---

## 6. Agent Design & Protocol

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Results over Redirects | ✅ OK | Returns complete data in-chat, widget provides rich display |
| Server Instructions | ✅ OK | Comprehensive instructions defined |
| Prompts as Workflows | ✅ OK | Single prompt defined for common workflow |

**Analysis:**

**Results over Redirects - EXCELLENT:**
The server returns complete company data (lines 164-178) rather than redirecting to external pages. The widget (company-card.tsx) provides rich in-chat visualization without requiring users to leave the conversation.

**Server Instructions - EXCELLENT:**
Comprehensive instructions defined in server-instructions.ts (lines 8-42):
- Capabilities overview
- Tools description
- Performance characteristics (1-3 second response time)
- Usage guidelines
- Data available
- Example queries

**Prompts - GOOD:**
One prompt registered (`lookup-company`, lines 208-231) for common workflow of looking up a company by KRS number.

### Recommendations

**[LOW]** Add more workflow prompts for common use cases.

```typescript
// In server.ts, after line 231
this.server.registerPrompt(
  "compare-companies",
  {
    title: "Compare Multiple Companies",
    description: "Compare data for multiple companies side-by-side",
    argsSchema: {
      krs_numbers: z.array(z.string()).meta({ 
        description: "Array of KRS numbers to compare (2-5 companies)" 
      })
    }
  },
  async ({ krs_numbers }) => {
    const companies = krs_numbers.slice(0, 5); // Limit to 5
    const instructions = companies.map(krs => 
      `Use 'view_company' to look up KRS ${krs}`
    ).join(", then ");
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${instructions}, then create a comparison table showing: name, legal form, capital, number of board members, and main activity for each company.`
          }
        }
      ]
    };
  }
);

this.server.registerPrompt(
  "due-diligence-checklist",
  {
    title: "Due Diligence Checklist",
    description: "Comprehensive due diligence workflow for a company",
    argsSchema: {
      krs: z.string().meta({ description: "KRS number to investigate" })
    }
  },
  async ({ krs }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Perform due diligence on company KRS ${krs}:
1. Look up basic company information
2. Analyze board member structure and representation method
3. Review share capital and shareholders
4. Examine business activities (PKD codes)
5. Provide a summary of risk factors and red flags`
          }
        }
      ]
    };
  }
);
```

---

## 7. Implementation Quality

### Widget Analysis

**File:** `web/widgets/company-card.tsx`

**Strengths:**
- ✅ Correct `autoResize: false` pattern (line 97)
- ✅ Fixed height container `h-[600px]` (line 252)
- ✅ All handlers registered before `connect()` (lines 101-154)
- ✅ Theme support implemented (lines 142-148)
- ✅ Teardown handler present (lines 151-154)
- ✅ Safe area insets for mobile (lines 72-82, applied at line 253)
- ✅ Error states handled properly (lines 174-190, 212-228)
- ✅ Loading states with spinner (lines 193-209)

**Areas for Improvement:**

**[LOW]** Add fullscreen mode support (v0.4.1 feature).

```tsx
// Add state
const [isFullscreen, setIsFullscreen] = useState(false);

// Update onhostcontextchanged
appInstance.onhostcontextchanged = (ctx) => {
  setHostContext((prev) => ({ ...prev, ...ctx }));
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.classList.toggle("dark", ctx.theme === "dark");
  }
  if (ctx.displayMode) {
    setIsFullscreen(ctx.displayMode === 'fullscreen');
  }
};

// Add toggle button
const toggleFullscreen = async () => {
  if (!app) return;
  const ctx = app.getHostContext();
  if (!ctx?.availableDisplayModes?.includes('fullscreen')) return;
  const targetMode = isFullscreen ? 'inline' : 'fullscreen';
  await app.requestDisplayMode({ mode: targetMode });
};

// Add to header
<CardHeader className="pb-3">
  <div className="flex items-start justify-between">
    <div className="flex-1">
      <CardTitle className="text-xl">{data.name}</CardTitle>
      {/* ... */}
    </div>
    {hostContext?.availableDisplayModes?.includes('fullscreen') && (
      <button onClick={toggleFullscreen} className="text-sm">
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
    )}
  </div>
</CardHeader>
```

### Server Code Quality

**Strengths:**
- ✅ Proper error handling with try/catch (lines 148-201)
- ✅ Structured logging with event types (lines 137-161)
- ✅ Authentication check before operations (lines 131-133)
- ✅ Proper use of McpAgent pattern
- ✅ Clean separation of concerns (krs-client.ts, server-instructions.ts)

**Areas for Improvement:**

**[LOW]** Add TypeScript strict mode checks.

Current tsconfig.json doesn't enforce strict null checks. Add to tsconfig.json:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true
  }
}
```

---

## Action Items (Priority Order)

### CRITICAL
None.

### HIGH

1. **[HIGH]** Add `next_steps` to tool responses for LLM guidance (src/server.ts:164-178)
   - Impact: Improves LLM decision-making in multi-turn conversations
   - Effort: 15 minutes
   - Pattern: See "Response Engineering" section recommendation

2. **[HIGH]** Define `outputSchema` on tool registration (src/server.ts:110-128)
   - Impact: Better agent interoperability, type safety for downstream consumers
   - Effort: 30 minutes
   - Pattern: See "Response Engineering" section recommendation

### MEDIUM

3. **[MEDIUM]** Enhance error responses with recovery suggestions (src/server.ts:189-200)
   - Impact: Better error recovery, improved UX
   - Effort: 15 minutes

4. **[MEDIUM]** Implement D1 for search history and watchlists
   - Impact: Major feature enhancement, user engagement
   - Effort: 2-4 hours
   - See "Cloudflare Capability Opportunities #1"

5. **[MEDIUM]** Add Workers AI for company risk analysis
   - Impact: High-value feature differentiation
   - Effort: 2-3 hours
   - See "Cloudflare Capability Opportunities #2"

### LOW

6. **[LOW]** Add rate limiting for API abuse prevention (src/server.ts:149)
   - Impact: Security improvement
   - Effort: 30 minutes

7. **[LOW]** Add XSS sanitization in data transformation (src/krs-client.ts:85-172)
   - Impact: Defense-in-depth security
   - Effort: 30 minutes

8. **[LOW]** Add usage examples to tool description (src/server.ts:114-115)
   - Impact: Minor LLM guidance improvement
   - Effort: 10 minutes

9. **[LOW]** Add workflow prompts for common scenarios (src/server.ts:231)
   - Impact: Better user experience for complex workflows
   - Effort: 30 minutes

---

## Summary & Next Steps

**KRS Viewer is a well-designed MCP server scoring 8.5/10.** The implementation demonstrates strong adherence to MCP best practices, particularly in tool interface design, noise reduction, and security. The server provides genuine value by consolidating KRS registry data into a clean, visual interface.

**Immediate Actions (Week 1):**
1. Add `next_steps` to responses
2. Define `outputSchema` on tool
3. Enhance error messages

**Short-term Enhancements (Month 1):**
1. Implement D1 for search history
2. Add Workers AI risk analysis
3. Implement rate limiting

**Long-term Opportunities (Quarter 1):**
1. Browser Rendering for PDF reports
2. Queues for company monitoring
3. Collaborative analysis sessions

The server has a solid foundation and clear path for feature expansion using Cloudflare's platform capabilities.
