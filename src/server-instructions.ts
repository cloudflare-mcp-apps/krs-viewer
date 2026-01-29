/**
 * Server Instructions for KRS Company Viewer
 *
 * These instructions are injected into the LLM's system prompt to guide
 * tool selection and usage.
 */

export const SERVER_INSTRUCTIONS = `
# KRS Company Viewer MCP Server

## Capabilities
- Lookup Polish companies by KRS number in the official Krajowy Rejestr Sądowy
- Display company details in a rich visual card format
- Data includes: name, legal form, address, capital, board members, PKD codes

## Tools Overview
- **view_company**: Displays company data from Polish KRS registry. Returns company card with all official details.

## Performance Characteristics
- Typical response time: 1-3 seconds
- Data freshness: Cached for 1 hour, then refreshed from KRS API
- API availability: Public API (no rate limits documented, fair use assumed)

## Usage Guidelines
- Use view_company when: user asks about a Polish company, wants to verify a business partner, or needs KRS data
- Constraint: Requires 10-digit KRS number (e.g., "0000821672")
- Note: KRS API doesn't support search by company name, only by KRS number

## Data Available
- Company name and legal form
- NIP and REGON identifiers
- Registered address (city, street, postal code)
- Share capital and shareholders (for sp. z o.o.)
- Management board members and representation method
- PKD activity codes (main and secondary)
- Registration and last update dates

## Example Queries
"Show me company KRS 0000821672" → Use view_company with krs="0000821672"
"What are the details for KRS 0001234567?" → Use view_company with krs="0001234567"
"Verify company 0000821672 in KRS" → Use view_company with krs="0000821672"
`;
