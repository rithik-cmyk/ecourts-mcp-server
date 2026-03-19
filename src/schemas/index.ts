import { z } from "zod";

// ─── Shared ─────────────────────────────────────────────────────────

export const CnrSchema = z
  .string()
  .min(10, "CNR must be at least 10 characters")
  .max(30, "CNR must not exceed 30 characters")
  .describe("Case Number Record, e.g. DLHC010001232024");

/** Validates YYYY-MM-DD date strings */
const dateString = (desc: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional().describe(desc);

// ─── Case Detail ────────────────────────────────────────────────────

export const GetCaseSchema = z
  .object({
    cnr: CnrSchema,
  })
  .strict();

export type GetCaseInput = z.infer<typeof GetCaseSchema>;

// ─── Case Search ────────────────────────────────────────────────────

export const SearchCasesSchema = z
  .object({
    // ── Text search ──
    query: z.string().optional().describe("General full-text search across all fields"),
    advocates: z.string().optional().describe("Search by advocate name (both petitioner and respondent advocates)"),
    judges: z.string().optional().describe("Search by judge name"),
    petitioners: z.string().optional().describe("Search by petitioner name"),
    respondents: z.string().optional().describe("Search by respondent name"),
    litigants: z.string().optional().describe("Search petitioners AND respondents simultaneously"),

    // ── Categorical filters (arrays – pass multiple values) ──
    court_codes: z
      .array(z.string())
      .optional()
      .describe("Filter by court codes, e.g. ['DLHC01','HCBM01']. Use ecourts_get_court_structure or the enum reference."),
    case_types: z
      .array(z.string())
      .optional()
      .describe("Filter by case types: CIVIL, CRIMINAL, WRIT, APPEAL, REVISION, EXECUTION, ARBITRATION, MATRIMONIAL, MOTOR_ACCIDENT, LABOR"),
    case_statuses: z
      .array(z.string())
      .optional()
      .describe("Filter by statuses: PENDING, DISPOSED, TRANSFERRED, WITHDRAWN, UNKNOWN"),
    judicial_sections: z
      .array(z.string())
      .optional()
      .describe("Filter by judicial sections: CIV, CRIM, WRIT, REV, APP, MISC, PIL, BAIL, URG, ADM"),
    case_categories: z
      .array(z.string())
      .optional()
      .describe("Filter by case categories, e.g. ['COMMERCIAL']"),
    bench_types: z
      .array(z.string())
      .optional()
      .describe("Filter by bench type, e.g. ['SINGLE','DIVISION']"),

    // ── Year filters (arrays of integers) ──
    filing_years: z.array(z.number().int()).optional().describe("Filter by filing year(s), e.g. [2024, 2023]"),
    registration_years: z.array(z.number().int()).optional().describe("Filter by registration year(s)"),
    first_hearing_years: z.array(z.number().int()).optional().describe("Filter by first hearing year(s)"),
    next_hearing_years: z.array(z.number().int()).optional().describe("Filter by next hearing year(s)"),
    decision_years: z.array(z.number().int()).optional().describe("Filter by decision year(s)"),

    // ── Date range filters (YYYY-MM-DD) ──
    filing_date_from: dateString("Filing date range start (YYYY-MM-DD)"),
    filing_date_to: dateString("Filing date range end (YYYY-MM-DD)"),
    registration_date_from: dateString("Registration date range start (YYYY-MM-DD)"),
    registration_date_to: dateString("Registration date range end (YYYY-MM-DD)"),
    first_hearing_date_from: dateString("First hearing date range start (YYYY-MM-DD)"),
    first_hearing_date_to: dateString("First hearing date range end (YYYY-MM-DD)"),
    next_hearing_date_from: dateString("Next hearing date range start (YYYY-MM-DD)"),
    next_hearing_date_to: dateString("Next hearing date range end (YYYY-MM-DD)"),
    decision_date_from: dateString("Decision date range start (YYYY-MM-DD)"),
    decision_date_to: dateString("Decision date range end (YYYY-MM-DD)"),

    // ── Facet controls ──
    include_facet_counts: z.boolean().optional().describe("Include facet (aggregation) counts in response. Default true."),

    // ── Sorting ──
    sort_by: z
      .enum(["filingDate", "registrationDate", "nextHearingDate", "decisionDate"])
      .optional()
      .describe("Field to sort by"),
    sort_order: z.enum(["asc", "desc"]).optional().describe("Sort direction"),

    // ── Pagination ──
    page: z.number().int().min(1).default(1).describe("Page number (1-based)"),
    page_size: z.number().int().min(1).max(100).default(20).describe("Results per page (max 100)"),
  })
  .strict();

export type SearchCasesInput = z.infer<typeof SearchCasesSchema>;

// ─── Order Metadata ─────────────────────────────────────────────────

export const GetOrderSchema = z
  .object({
    cnr: CnrSchema,
    filename: z
      .string()
      .min(1)
      .describe("Order filename from judgmentOrders[].orderUrl or interimOrders[].orderUrl"),
  })
  .strict();

export type GetOrderInput = z.infer<typeof GetOrderSchema>;

// ─── Order with AI ──────────────────────────────────────────────────

export const GetOrderAiSchema = z
  .object({
    cnr: CnrSchema,
    filename: z
      .string()
      .min(1)
      .describe("Order filename from judgmentOrders[].orderUrl or interimOrders[].orderUrl"),
  })
  .strict();

export type GetOrderAiInput = z.infer<typeof GetOrderAiSchema>;

// ─── Court Structure ────────────────────────────────────────────────

export const GetCourtStructureSchema = z
  .object({
    level: z
      .enum(["states", "districts", "complexes", "courts"])
      .describe("Which level of the court hierarchy to retrieve"),
    state: z.string().optional().describe("State code (required for districts, complexes, courts)"),
    district_code: z.string().optional().describe("District code (required for complexes, courts)"),
    court_complex_code: z.string().optional().describe("Court complex code (required for courts)"),
  })
  .strict();

export type GetCourtStructureInput = z.infer<typeof GetCourtStructureSchema>;

// ─── Cause List Search ──────────────────────────────────────────────

export const SearchCauseListSchema = z
  .object({
    q: z.string().optional().describe("Full-text search across case numbers, parties, advocates"),
    date: dateString("Exact date filter (YYYY-MM-DD)"),
    start_date: dateString("Date range start inclusive (YYYY-MM-DD)"),
    end_date: dateString("Date range end inclusive (YYYY-MM-DD)"),
    bench: z.string().optional().describe("Filter by bench code"),
    judge: z.string().optional().describe("Search by judge name"),
    advocate: z.string().optional().describe("Search by advocate name"),
    litigant: z.string().optional().describe("Search by litigant/party name"),
    state: z.string().optional().describe("State code, e.g. DL, JH"),
    district_code: z.string().optional().describe("District code"),
    court_complex_code: z.string().optional().describe("Court complex code"),
    court_no: z.string().optional().describe("Court room number"),
    list_type: z.string().optional().describe("List type, e.g. CIVIL, CRIMINAL"),
    limit: z.number().int().min(1).max(100).default(50).describe("Max results (max 100)"),
    offset: z.number().int().min(0).default(0).describe("Number of results to skip for pagination"),
  })
  .strict();

export type SearchCauseListInput = z.infer<typeof SearchCauseListSchema>;

// ─── Cause List Available Dates ─────────────────────────────────────

export const GetCauseListDatesSchema = z
  .object({
    state: z.string().optional().describe("State code, e.g. DL"),
    district_code: z.string().optional().describe("District code"),
    court_complex_code: z.string().optional().describe("Court complex code"),
    court_no: z.string().optional().describe("Court room number"),
  })
  .strict();

export type GetCauseListDatesInput = z.infer<typeof GetCauseListDatesSchema>;

// ─── Case Refresh ───────────────────────────────────────────────────

export const RefreshCaseSchema = z
  .object({
    cnr: CnrSchema,
  })
  .strict();

export type RefreshCaseInput = z.infer<typeof RefreshCaseSchema>;

// ─── Case Lookup (workflow tool) ────────────────────────────────────

export const LookupCaseSchema = z
  .object({
    case_number: z
      .string()
      .min(1)
      .describe("Human-readable case number, e.g. 'CS(OS) 123/2024' or 'WP(C)/456/2024'"),
    court_code: z
      .string()
      .optional()
      .describe("Court code to narrow search, e.g. 'DLHC01'. Improves accuracy when multiple courts might have the same case number."),
  })
  .strict();

export type LookupCaseInput = z.infer<typeof LookupCaseSchema>;
