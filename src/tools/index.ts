import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { partnerRequest, partnerDownload, publicRequest, formatApiError } from "../services/api-client.js";
import {
  truncateIfNeeded,
  formatCaseMarkdown,
  formatSearchResultMarkdown,
  formatFacetsMarkdown,
  formatCauseListMarkdown,
  formatOrderAiMarkdown,
} from "../services/formatting.js";
import {
  GetCaseSchema,
  SearchCasesSchema,
  GetOrderSchema,
  GetOrderAiSchema,
  GetCourtStructureSchema,
  SearchCauseListSchema,
  GetCauseListDatesSchema,
  RefreshCaseSchema,
  LookupCaseSchema,
} from "../schemas/index.js";
import type {
  GetCaseInput,
  SearchCasesInput,
  GetOrderInput,
  GetOrderAiInput,
  GetCourtStructureInput,
  SearchCauseListInput,
  GetCauseListDatesInput,
  RefreshCaseInput,
  LookupCaseInput,
} from "../schemas/index.js";
import type {
  CaseDetailResponse,
  SearchResponse,
  OrderAiResponse,
  StateEntry,
  DistrictEntry,
  CourtComplexEntry,
  CourtEntry,
  CauseListSearchResponse,
  RefreshResponse,
  AvailableDatesResponse,
} from "../types.js";

// ─── MCP result type aliases ────────────────────────────────────────

type McpTextContent = { type: "text"; text: string };
type McpResourceContent = {
  type: "resource";
  resource: { uri: string; mimeType: string; blob: string };
};
type McpResult = {
  content: Array<McpTextContent | McpResourceContent>;
  isError?: boolean;
};

// =====================================================================
// Helper: wrap handler so every tool gets consistent error handling
// with the MCP-spec `isError` flag set on failures.
// =====================================================================
export function safeHandler<T>(
  fn: (params: T) => Promise<McpResult>
): (params: T) => Promise<McpResult> {
  return async (params: T) => {
    try {
      return await fn(params);
    } catch (error: unknown) {
      return {
        content: [{ type: "text" as const, text: formatApiError(error) }],
        isError: true,
      };
    }
  };
}

// =====================================================================
// Register all tools on the supplied McpServer instance
// =====================================================================
export function registerTools(server: McpServer): void {

  // ────────────────────── 1. Get Case Detail ──────────────────────
  server.registerTool(
    "ecourts_get_case",
    {
      title: "Get Case Details",
      description: `Retrieve comprehensive details for an Indian court case by CNR (Case Number Record).

Returns: case status, parties (petitioners/respondents), advocates, judges, hearing history, listing dates, judgment orders, interim orders, interlocutory applications, notices, filed documents, tagged/connected matters, linked cases, earlier court details, FIR details (criminal), subordinate court, and AI case analysis.

Args:
  - cnr (string): Case Number Record, e.g. "DLHC010001232024"

Use this tool first to discover available order filenames (judgmentOrders[].orderUrl, interimOrders[].orderUrl) before calling ecourts_get_order or ecourts_get_order_ai.`,
      inputSchema: GetCaseSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: GetCaseInput) => {
      const res = await partnerRequest<CaseDetailResponse>("GET", `/case/${params.cnr}`);
      const caseData = res.data.courtCaseData;
      const aiSummary = res.data.caseAiAnalysis;
      const files = res.data.files?.files;

      let md = formatCaseMarkdown(caseData);

      // Surface embedded order files so the LLM knows which have AI analysis ready
      if (files?.length) {
        md += "\n\n## Available Order Files";
        for (const f of files) {
          const aiStatus = f.aiAnalysis ? "✅ AI analysis available" : "❌ No AI analysis yet";
          md += `\n- \`${f.pdfFile}\` — ${aiStatus}`;
          if (f.aiAnalysis?.summary) {
            md += ` — ${f.aiAnalysis.summary}`;
          }
        }
      }

      // Append AI case-level analysis if present
      if (aiSummary) {
        md +=
          "\n\n## AI Case Analysis" +
          `\n**Summary:** ${aiSummary.caseSummary}` +
          `\n**Type:** ${aiSummary.caseType}` +
          `\n**Complexity:** ${aiSummary.complexity}` +
          `\n**Key Issues:** ${aiSummary.keyIssues?.join(", ") || "N/A"}`;
        if (aiSummary.timeline?.length) {
          md += "\n**Timeline:**";
          for (const t of aiSummary.timeline) {
            md += `\n- ${t.date}: ${t.event}`;
          }
        }
      }

      return { content: [{ type: "text", text: truncateIfNeeded(md) }] };
    })
  );

  // ────────────────────── 2. Search Cases ─────────────────────────
  server.registerTool(
    "ecourts_search_cases",
    {
      title: "Search Court Cases",
      description: `Search for Indian court cases with text queries, filters, date ranges, year filters, and faceted aggregations.

Text search args (all optional):
  query, advocates, judges, petitioners, respondents, litigants

Filter args (arrays):
  court_codes, case_types, case_statuses, judicial_sections, case_categories, bench_types

Year filters (integer arrays):
  filing_years, registration_years, first_hearing_years, next_hearing_years, decision_years

Date ranges (YYYY-MM-DD):
  filing_date_from/to, registration_date_from/to, first_hearing_date_from/to,
  next_hearing_date_from/to, decision_date_from/to

Controls:
  include_facet_counts (bool), sort_by, sort_order, page, page_size (max 100)

Returns: matching cases with CNR, parties, dates, facet counts.
Supply at least one search term or filter.`,
      inputSchema: SearchCasesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: SearchCasesInput) => {
      // Map snake_case tool params → API camelCase query params
      const qp: Record<string, unknown> = {
        page: params.page,
        pageSize: params.page_size,
      };

      // Text search
      if (params.query) qp.query = params.query;
      if (params.advocates) qp.advocates = params.advocates;
      if (params.judges) qp.judges = params.judges;
      if (params.petitioners) qp.petitioners = params.petitioners;
      if (params.respondents) qp.respondents = params.respondents;
      if (params.litigants) qp.litigants = params.litigants;

      // Categorical filters (arrays – serialized as repeated keys by our custom serializer)
      if (params.court_codes) qp.courtCodes = params.court_codes;
      if (params.case_types) qp.caseTypes = params.case_types;
      if (params.case_statuses) qp.caseStatuses = params.case_statuses;
      if (params.judicial_sections) qp.judicialSections = params.judicial_sections;
      if (params.case_categories) qp.caseCategories = params.case_categories;
      if (params.bench_types) qp.benchTypes = params.bench_types;

      // Year filters
      if (params.filing_years) qp.filingYears = params.filing_years;
      if (params.registration_years) qp.registrationYears = params.registration_years;
      if (params.first_hearing_years) qp.firstHearingYears = params.first_hearing_years;
      if (params.next_hearing_years) qp.nextHearingYears = params.next_hearing_years;
      if (params.decision_years) qp.decisionYears = params.decision_years;

      // Date ranges
      if (params.filing_date_from) qp.filingDateFrom = params.filing_date_from;
      if (params.filing_date_to) qp.filingDateTo = params.filing_date_to;
      if (params.registration_date_from) qp.registrationDateFrom = params.registration_date_from;
      if (params.registration_date_to) qp.registrationDateTo = params.registration_date_to;
      if (params.first_hearing_date_from) qp.firstHearingDateFrom = params.first_hearing_date_from;
      if (params.first_hearing_date_to) qp.firstHearingDateTo = params.first_hearing_date_to;
      if (params.next_hearing_date_from) qp.nextHearingDateFrom = params.next_hearing_date_from;
      if (params.next_hearing_date_to) qp.nextHearingDateTo = params.next_hearing_date_to;
      if (params.decision_date_from) qp.decisionDateFrom = params.decision_date_from;
      if (params.decision_date_to) qp.decisionDateTo = params.decision_date_to;

      // Facet & sorting controls
      if (params.include_facet_counts !== undefined) qp.includeFacetCounts = params.include_facet_counts;
      if (params.sort_by) qp.sortBy = params.sort_by;
      if (params.sort_order) qp.sortOrder = params.sort_order;

      const res = await partnerRequest<SearchResponse>("GET", "/search", qp);
      const d = res.data;

      if (!d.results?.length) {
        return { content: [{ type: "text", text: "No cases found matching your search criteria." }] };
      }

      const lines: string[] = [
        `# Case Search Results`,
        `Found **${d.totalHits}** cases (page ${d.page}/${d.totalPages}, showing ${d.results.length})`,
        "",
      ];

      for (const r of d.results) {
        lines.push(formatSearchResultMarkdown(r), "");
      }

      // Include facet summaries so the LLM can understand result distribution
      if (d.facets) {
        lines.push(formatFacetsMarkdown(d.facets));
      }

      if (d.hasNextPage) {
        lines.push("", `_More results available – request page ${d.page + 1}._`);
      }

      return { content: [{ type: "text", text: truncateIfNeeded(lines.join("\n")) }] };
    })
  );

  // ────────────────────── 3. Get Order Metadata ───────────────────
  server.registerTool(
    "ecourts_get_order",
    {
      title: "Get Order Metadata",
      description: `Get metadata and download information for a court order PDF (certified true copy).

Args:
  - cnr (string): Case Number Record
  - filename (string): Order filename obtained from judgmentOrders[].orderUrl or interimOrders[].orderUrl in the ecourts_get_case response

Workflow: call ecourts_get_case → find order filename → call this tool.`,
      inputSchema: GetOrderSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: GetOrderInput) => {
      const { data, headers } = await partnerDownload(
        `/case/${params.cnr}/order/${params.filename}`
      );

      // Extract download filename from Content-Disposition header
      const contentDisposition = headers["content-disposition"] || "";
      const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
      const downloadFilename = filenameMatch
        ? filenameMatch[1].trim()
        : `ecourtsindia-truecopy-${params.cnr}-${params.filename}`;
      const fileSize = data.length;

      const md = [
        `# Order: ${params.filename}`,
        `**CNR:** ${params.cnr}`,
        `**Download Filename:** ${downloadFilename}`,
        `**File Size:** ${Math.round(fileSize / 1024)} KB`,
        "",
        "_Use ecourts_get_order_ai to get extracted text and AI analysis of this order._",
      ].join("\n");

      const base64 = Buffer.from(data).toString("base64");

      return {
        content: [
          { type: "text" as const, text: md },
          {
            type: "resource" as const,
            resource: {
              uri: `order://${params.cnr}/${params.filename}`,
              mimeType: "application/pdf",
              blob: base64,
            },
          },
        ],
      };
    })
  );

  // ────────────────────── 4. Get Order with AI Summary ────────────
  server.registerTool(
    "ecourts_get_order_ai",
    {
      title: "Get Order with AI Summary",
      description: `Get extracted text and pre-computed AI analysis for a court order.

AI analysis includes: summary, order type, outcome (PETITIONER_FAVORED, RESPONDENT_FAVORED, MIXED, DISMISSED), key points, relief granted, legal provisions cited, next steps, judge, and date.

Args:
  - cnr (string): Case Number Record
  - filename (string): Order filename from judgmentOrders[].orderUrl or interimOrders[].orderUrl

The AI analysis is pre-computed (fast, no LLM latency). If aiAnalysis is null, analysis is not yet available for this order.`,
      inputSchema: GetOrderAiSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: GetOrderAiInput) => {
      const res = await partnerRequest<OrderAiResponse>(
        "GET",
        `/case/${params.cnr}/order-ai/${params.filename}`
      );
      const d = res.data;
      const md = formatOrderAiMarkdown(d.cnr, d.filename, d.extractedText, d.aiAnalysis);
      return {
        content: [
          {
            type: "text",
            text: truncateIfNeeded(md, "The extracted text was long. Ask for a summary or specific section."),
          },
        ],
      };
    })
  );

  // ────────────────────── 5. Court Structure ──────────────────────
  server.registerTool(
    "ecourts_get_court_structure",
    {
      title: "Get Court Structure",
      description: `Discover the Indian court hierarchy: State → District → Court Complex → Court.

Use this to obtain valid codes for ecourts_search_cases (court_codes), ecourts_search_causelist, and ecourts_get_causelist_dates.

Args:
  - level: "states" | "districts" | "complexes" | "courts"
  - state: required for districts/complexes/courts (e.g. "UP", "DL", "SC" for Supreme Court)
  - district_code: required for complexes/courts
  - court_complex_code: required for courts

This endpoint is public, free, and requires no authentication.`,
      inputSchema: GetCourtStructureSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: GetCourtStructureInput) => {
      let path: string;
      switch (params.level) {
        case "states":
          path = "/states";
          break;
        case "districts":
          if (!params.state) {
            return {
              content: [{ type: "text", text: "Error: 'state' is required for districts. Use level='states' first to get state codes." }],
              isError: true,
            };
          }
          path = `/states/${params.state}/districts`;
          break;
        case "complexes":
          if (!params.state || !params.district_code) {
            return {
              content: [{ type: "text", text: "Error: 'state' and 'district_code' are required for complexes. Use level='districts' first." }],
              isError: true,
            };
          }
          path = `/states/${params.state}/districts/${params.district_code}/complexes`;
          break;
        case "courts":
          if (!params.state || !params.district_code || !params.court_complex_code) {
            return {
              content: [{ type: "text", text: "Error: 'state', 'district_code', and 'court_complex_code' are all required for courts." }],
              isError: true,
            };
          }
          path = `/states/${params.state}/districts/${params.district_code}/complexes/${params.court_complex_code}/courts`;
          break;
      }

      if (params.level === "states") {
        const data = await publicRequest<StateEntry[]>(path);
        const lines = ["# Indian Court States", "", ...data.map((s) => `- **${s.stateName}** (code: ${s.state})`)];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
      if (params.level === "districts") {
        const data = await publicRequest<DistrictEntry[]>(path);
        const lines = [
          `# Districts in ${params.state}`,
          "",
          ...data.map((d) => `- **${d.districtName}** (code: ${d.districtCode})`),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
      if (params.level === "complexes") {
        const data = await publicRequest<CourtComplexEntry[]>(path);
        const lines = [
          `# Court Complexes in ${params.state} / district ${params.district_code}`,
          "",
          ...data.map((c) => `- **${c.courtComplexName}** (code: ${c.courtComplexCode})`),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
      // courts
      const data = await publicRequest<CourtEntry[]>(path);
      const lines = [
        `# Courts in complex ${params.court_complex_code}`,
        "",
        ...data.map((c) => `- **${c.courtName}** | Court No: ${c.courtNo} | Judge: ${c.judgeName}`),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    })
  );

  // ────────────────────── 6. Cause List Search ────────────────────
  server.registerTool(
    "ecourts_search_causelist",
    {
      title: "Search Cause List",
      description: `Search cause list entries across Indian courts.

Args (at least one required):
  - q: full-text search (case numbers, parties, advocates)
  - date / start_date / end_date: date filters (YYYY-MM-DD)
  - bench: bench code filter
  - judge / advocate / litigant: name-based search
  - state / district_code / court_complex_code / court_no: location filters
  - list_type: CIVIL, CRIMINAL, etc.
  - limit / offset: pagination (limit max 100)

Billing: ₹1.00 per request.

Use ecourts_get_court_structure to discover valid state/district/complex codes.
Use ecourts_get_causelist_dates (free) to find dates with available data before searching.`,
      inputSchema: SearchCauseListSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: SearchCauseListInput) => {
      const qp: Record<string, unknown> = {
        limit: params.limit,
        offset: params.offset,
      };
      if (params.q) qp.q = params.q;
      if (params.date) qp.date = params.date;
      if (params.start_date) qp.startDate = params.start_date;
      if (params.end_date) qp.endDate = params.end_date;
      if (params.bench) qp.bench = params.bench;
      if (params.judge) qp.judge = params.judge;
      if (params.advocate) qp.advocate = params.advocate;
      if (params.litigant) qp.litigant = params.litigant;
      if (params.state) qp.state = params.state;
      if (params.district_code) qp.districtCode = params.district_code;
      if (params.court_complex_code) qp.courtComplexCode = params.court_complex_code;
      if (params.court_no) qp.courtno = params.court_no;
      if (params.list_type) qp.listType = params.list_type;

      const res = await partnerRequest<CauseListSearchResponse>("GET", "/causelist/search", qp);
      const d = res.data;

      if (!d.results?.length) {
        return { content: [{ type: "text", text: "No cause list entries found matching your criteria." }] };
      }

      const hasMore = d.returnedCount >= d.limit;
      const lines: string[] = [
        `# Cause List Search Results`,
        `Returned **${d.returnedCount}** entries (offset ${d.offset})`,
        "",
      ];
      for (const e of d.results) {
        lines.push(formatCauseListMarkdown(e), "");
      }
      if (hasMore) {
        lines.push(`_More results may exist – increase offset to ${d.offset + d.limit}._`);
      }

      return { content: [{ type: "text", text: truncateIfNeeded(lines.join("\n")) }] };
    })
  );

  // ────────────────────── 7. Cause List Available Dates ───────────
  server.registerTool(
    "ecourts_get_causelist_dates",
    {
      title: "Get Cause List Available Dates",
      description: `Get dates for which cause list data is available, filtered by location.

At least one parameter is required: state, district_code, court_complex_code, or court_no.

Free endpoint (no credit charge, authentication required). Use the returned dates with ecourts_search_causelist to avoid empty searches.`,
      inputSchema: GetCauseListDatesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: GetCauseListDatesInput) => {
      const qp: Record<string, unknown> = {};
      if (params.state) qp.state = params.state;
      if (params.district_code) qp.districtCode = params.district_code;
      if (params.court_complex_code) qp.courtComplexCode = params.court_complex_code;
      if (params.court_no) qp.courtNo = params.court_no;

      const res = await partnerRequest<AvailableDatesResponse>(
        "GET",
        "/causelist/available-dates",
        qp
      );

      const dates = res.data;
      if (!dates?.length) {
        return { content: [{ type: "text", text: "No cause list dates found for the given filters." }] };
      }

      const lines = [
        `# Available Cause List Dates`,
        `Found **${dates.length}** dates (most recent first):`,
        "",
        ...dates.map((d: string) => `- ${d}`),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    })
  );

  // ────────────────────── 8. Refresh Case ─────────────────────────
  server.registerTool(
    "ecourts_refresh_case",
    {
      title: "Refresh Case Data",
      description: `Request a fresh scrape of case data from the eCourts source. This is an asynchronous operation — the update takes 5-10 minutes.

After refreshing, call ecourts_get_case to retrieve updated data.

Duplicate requests within 15 minutes are idempotent (no double charge).

Args:
  - cnr (string): Case Number Record`,
      inputSchema: RefreshCaseSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: RefreshCaseInput) => {
      const res = await partnerRequest<RefreshResponse>("POST", `/case/${params.cnr}/refresh`);
      const d = res.data;
      const md = [
        `# Case Refresh: ${d.cnr}`,
        `**Status:** ${d.status}`,
        `**Message:** ${d.message}`,
        `**Estimated Time:** ${d.estimatedTime}`,
        "",
        "Call `ecourts_get_case` after the estimated time to see updated data.",
      ].join("\n");
      return { content: [{ type: "text", text: md }] };
    })
  );

  // ────────────────────── 9. Lookup Case by Case Number ───────────
  server.registerTool(
    "ecourts_lookup_case",
    {
      title: "Lookup Case by Case Number",
      description: `Find a case using a human-readable case number (e.g. "CS(OS) 123/2024") instead of CNR.

This is a convenience workflow: it searches for the case number, finds the matching CNR, and returns full case details in one step.

Args:
  - case_number (string): Human-readable case number, e.g. "CS(OS) 123/2024", "WP(C)/456/2024"
  - court_code (string, optional): Court code to narrow the search (e.g. "DLHC01"). Recommended when the same case number might exist across courts.

Returns: Full case details (same as ecourts_get_case) if a match is found.`,
      inputSchema: LookupCaseSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safeHandler(async (params: LookupCaseInput) => {
      // Step 1: Search for the case number
      const qp: Record<string, unknown> = {
        query: params.case_number,
        page: 1,
        pageSize: 5,
      };
      if (params.court_code) {
        qp.courtCodes = [params.court_code];
      }

      const searchRes = await partnerRequest<SearchResponse>("GET", "/search", qp);
      const results = searchRes.data.results;

      if (!results?.length) {
        return {
          content: [{
            type: "text",
            text: `No case found matching "${params.case_number}".${params.court_code ? "" : " Try providing a court_code to narrow the search."}`,
          }],
        };
      }

      // Step 2: Pick the best match — prefer exact filing/registration number match
      const exactMatch = results.find(
        (r) =>
          r.filingNumber === params.case_number ||
          r.registrationNumber === params.case_number
      );
      const chosen = exactMatch ?? results[0];

      // Step 3: Fetch full case details using the CNR
      const caseRes = await partnerRequest<CaseDetailResponse>("GET", `/case/${chosen.cnr}`);
      const caseData = caseRes.data.courtCaseData;
      const aiSummary = caseRes.data.caseAiAnalysis;
      const files = caseRes.data.files?.files;

      let md = formatCaseMarkdown(caseData);

      if (files?.length) {
        md += "\n\n## Available Order Files";
        for (const f of files) {
          const aiStatus = f.aiAnalysis ? "✅ AI analysis available" : "❌ No AI analysis yet";
          md += `\n- \`${f.pdfFile}\` — ${aiStatus}`;
          if (f.aiAnalysis?.summary) {
            md += ` — ${f.aiAnalysis.summary}`;
          }
        }
      }

      if (aiSummary) {
        md +=
          "\n\n## AI Case Analysis" +
          `\n**Summary:** ${aiSummary.caseSummary}` +
          `\n**Type:** ${aiSummary.caseType}` +
          `\n**Complexity:** ${aiSummary.complexity}` +
          `\n**Key Issues:** ${aiSummary.keyIssues?.join(", ") || "N/A"}`;
        if (aiSummary.timeline?.length) {
          md += "\n**Timeline:**";
          for (const t of aiSummary.timeline) {
            md += `\n- ${t.date}: ${t.event}`;
          }
        }
      }

      // Note if we chose a non-exact match
      if (!exactMatch) {
        md = `_Note: No exact match for "${params.case_number}". Showing closest result (CNR: ${chosen.cnr})._\n\n` + md;
      }

      return { content: [{ type: "text", text: truncateIfNeeded(md) }] };
    })
  );
}
