# ecourts-mcp-server v1.2.0

An MCP (Model Context Protocol) server that connects LLMs to the **EcourtsIndia Partner API v1.3**, enabling AI agents to search Indian court cases, retrieve orders, read cause lists, and access AI-generated summaries.

## Tools (9 total)

| Tool | Description | Billing |
|------|-------------|---------|
| `ecourts_get_case` | Full case detail by CNR — parties, orders, IAs, notices, documents, hearings, FIR, linked cases, file AI status, case AI analysis | Per-request |
| `ecourts_lookup_case` | **Workflow tool** — find a case by human-readable number (e.g. "CS(OS) 123/2024") instead of CNR, returns full details | Per-request |
| `ecourts_search_cases` | Rich search with 30+ filter params, year filters, date ranges, faceted aggregations | Per-request |
| `ecourts_get_order` | Download order PDF with metadata (certified true copies) | Per-request |
| `ecourts_get_order_ai` | Extracted order text + pre-computed AI analysis (summary, outcome, key points) | Per-request |
| `ecourts_get_court_structure` | Browse state → district → complex → court hierarchy | Free |
| `ecourts_search_causelist` | Search cause list entries across all courts | ₹1/request |
| `ecourts_get_causelist_dates` | Available cause list dates | Free |
| `ecourts_refresh_case` | Queue a fresh scrape of case data | Per-request |

## Quick Start

```bash
npm install
npm run build
export ECOURTS_API_TOKEN="eci_live_your_token_here"
npm start
```

## Deployment

### Docker

```bash
# Build
docker build -t ecourts-mcp-server .

# Run
docker run -d \
  -e ECOURTS_API_TOKEN=eci_live_your_token_here \
  -p 3000:3000 \
  ecourts-mcp-server

# Health check
curl http://localhost:3000/health
```

### Docker Compose

```bash
# Set your token
export ECOURTS_API_TOKEN=eci_live_your_token_here

# Start
docker compose up -d

# Verify
curl http://localhost:3000/health
```

### Cloud Deployment

The Docker image works with any container platform:

- **AWS ECS / Fargate** — Use the health check endpoint at `/health`
- **Google Cloud Run** — Set `PORT=8080` (Cloud Run default), server auto-adapts
- **Azure Container Apps** — Standard HTTP container deployment
- **Railway / Render / Fly.io** — Push the Dockerfile, set `ECOURTS_API_TOKEN` in secrets

The image runs as a non-root user, includes a `HEALTHCHECK`, and defaults to HTTP transport on port 3000.

### Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "ecourts": {
      "command": "node",
      "args": ["/path/to/ecourts-mcp-server/dist/index.js"],
      "env": {
        "ECOURTS_API_TOKEN": "eci_live_your_token_here"
      }
    }
  }
}
```

### Claude Code (stdio)

```bash
claude mcp add ecourts -- node /path/to/ecourts-mcp-server/dist/index.js
```

## Running Tests

```bash
npm test                # 110 unit tests via vitest
npm run test:integration  # 24 integration tests (requires ECOURTS_API_TOKEN)
npm run test:all          # both
```

Tests cover: query parameter serialization, all formatting functions, facet rendering, all 14 API error code branches, schema boundary validation, `safeHandler` wrapper, truncation, date validation, and typed fields. Integration tests cover court structure hierarchy, case search with filters/sort/years, case detail, order metadata, cause list search by date, case refresh, and error scenarios.

## CI/CD

The `.github/workflows/ci.yml` pipeline:
1. **Build & test** on Node 20 and 22 (on push/PR to main)
2. **Docker build + health check** on push to main

## Architecture

```
src/
├── index.ts              # Entry point, transport (stdio/HTTP), health endpoint
├── constants.ts          # Base URLs, character limits
├── types.ts              # Full TypeScript interfaces for all API responses
├── schemas/index.ts      # Zod input validation with date regex enforcement
├── services/
│   ├── api-client.ts     # HTTP client, binary download, repeated-key array serializer, error handling
│   └── formatting.ts     # Markdown formatters for case, search, causelist, order
└── tools/index.ts        # 9 tool registrations with MCP annotations
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ECOURTS_API_TOKEN` | Yes | EcourtsIndia Partner API bearer token |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default `3000`, only for `http` transport) |

## Changelog

### v1.2.0 (current)
**Code Quality:**
- Eliminated all unsafe type casts — `linkCases`, `subordinateCourt`, and `firDetails` are now proper typed fields on `CourtCaseData`
- `CauseListEntry` expanded with `petitionerAdvocates`, `respondentAdvocates`, `internalCaseNo`, `dateCreated`, `dateModified`
- Proper `AvailableDatesResponse` and `CaseFileSummary` types replace inline anonymous types
- All date parameters validated with `YYYY-MM-DD` regex at schema level

**New Features:**
- **`ecourts_lookup_case`** — workflow tool that finds cases by human-readable number (e.g. "CS(OS) 123/2024") instead of CNR
- **Order file status in case detail** — `ecourts_get_case` now shows which orders have AI analysis available with summary previews
- **Health check endpoint** — `GET /health` for load balancers and container orchestrators
- **Error-safe HTTP transport** — Express handler now catches errors instead of hanging
- **`ecourts_get_order` PDF download** — returns order PDF as embedded resource with metadata (filename, file size) extracted from HTTP headers

**Deployment:**
- Multi-stage Dockerfile (22MB Alpine image, non-root user, HEALTHCHECK)
- docker-compose.yml with health check and token validation
- GitHub Actions CI (Node 20/22 matrix, Docker build verification)
- Test suite expanded to 110 unit tests + 24 integration tests

### v1.1.0
- Fixed array parameter serialization (courtCodes, caseTypes, etc.)
- Added `isError` flag on MCP error responses
- Complete error code handling (11 API error codes)
- 15+ new search parameters (year filters, date ranges, categories, bench types)
- Facet counts in search output
- Comprehensive case detail formatting (all sections)

### v1.0.0
- Initial release with 8 tools covering all EcourtsIndia Partner API endpoints
