import { describe, it, expect } from "vitest";
import { serializeParams, formatApiError } from "../src/services/api-client.js";
import {
  truncateIfNeeded,
  formatCaseMarkdown,
  formatSearchResultMarkdown,
  formatFacetsMarkdown,
  formatCauseListMarkdown,
  formatOrderAiMarkdown,
} from "../src/services/formatting.js";
import type { CourtCaseData, SearchResult, CauseListEntry, OrderAiAnalysis } from "../src/types.js";

// ─── serializeParams ────────────────────────────────────────────────

describe("serializeParams", () => {
  it("serializes simple scalar params", () => {
    const result = serializeParams({ page: 1, pageSize: 20 });
    expect(result).toBe("page=1&pageSize=20");
  });

  it("serializes array params as repeated keys (critical for courtCodes etc.)", () => {
    const result = serializeParams({ courtCodes: ["DLHC01", "HCBM01"] });
    expect(result).toBe("courtCodes=DLHC01&courtCodes=HCBM01");
  });

  it("mixes scalar and array params correctly", () => {
    const result = serializeParams({
      advocates: "Sharma",
      courtCodes: ["DLHC01", "HCBM01"],
      page: 1,
    });
    expect(result).toContain("advocates=Sharma");
    expect(result).toContain("courtCodes=DLHC01");
    expect(result).toContain("courtCodes=HCBM01");
    expect(result).toContain("page=1");
  });

  it("skips null and undefined values", () => {
    const result = serializeParams({ a: "yes", b: null, c: undefined, d: "ok" });
    expect(result).toBe("a=yes&d=ok");
  });

  it("encodes special characters in values", () => {
    const result = serializeParams({ q: "hello world" });
    expect(result).toBe("q=hello%20world");
  });

  it("handles empty arrays without producing keys", () => {
    const result = serializeParams({ tags: [], page: 1 });
    expect(result).toBe("page=1");
  });
});

// ─── formatApiError ─────────────────────────────────────────────────

describe("formatApiError", () => {
  it("handles plain Error objects", () => {
    const result = formatApiError(new Error("Something broke"));
    expect(result).toBe("Error: Something broke");
  });

  it("handles non-Error values", () => {
    const result = formatApiError("string error");
    expect(result).toBe("Unexpected error: string error");
  });

  it("returns the missing env var message for the token check", () => {
    const err = new Error(
      "ECOURTS_API_TOKEN environment variable is not set. Set it to your EcourtsIndia Partner API token (e.g. eci_live_...)."
    );
    const result = formatApiError(err);
    expect(result).toContain("ECOURTS_API_TOKEN");
  });
});

// ─── truncateIfNeeded ───────────────────────────────────────────────

describe("truncateIfNeeded", () => {
  it("returns short strings unchanged", () => {
    expect(truncateIfNeeded("hello")).toBe("hello");
  });

  it("truncates and appends default notice for long strings", () => {
    const long = "x".repeat(30000);
    const result = truncateIfNeeded(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("⚠️ Response truncated");
    expect(result).toContain("Use filters or pagination");
  });

  it("uses custom hint when provided", () => {
    const long = "x".repeat(30000);
    const result = truncateIfNeeded(long, "Try a narrower query.");
    expect(result).toContain("Try a narrower query.");
    expect(result).not.toContain("Use filters or pagination");
  });
});

// ─── formatCaseMarkdown ─────────────────────────────────────────────

function makeMockCase(overrides?: Partial<CourtCaseData>): CourtCaseData {
  return {
    cnr: "DLHC010001232024",
    caseNumber: "CS(OS) 123/2024",
    caseType: "CIVIL",
    caseStatus: "PENDING",
    filingNumber: "CS/123/2024",
    filingDate: "2024-01-15",
    registrationNumber: "CS(OS)/123/2024",
    registrationDate: "2024-01-20",
    firstHearingDate: "2024-02-01",
    nextHearingDate: "2024-03-15",
    decisionDate: null,
    judges: ["Justice A.K. Sharma"],
    petitioners: ["ABC Private Limited"],
    petitionerAdvocates: ["Adv. Rahul Sharma"],
    respondents: ["XYZ Corporation"],
    respondentAdvocates: ["Adv. Amit Patel"],
    actsAndSections: "CPC - Section 9",
    caseCategoryFacetPath: "Civil/Commercial/Contract Disputes",
    courtName: "Delhi High Court",
    courtNo: 12,
    state: "Delhi",
    district: "New Delhi",
    benchName: "Division Bench",
    purpose: "Arguments",
    judicialSection: "CIV",
    caseTypeSub: "Commercial",
    causelistType: "DAILY",
    taggedMatters: [],
    earlierCourtDetails: [],
    interlocutoryApplications: [],
    listingDates: [],
    notices: [],
    judgmentOrders: [],
    interimOrders: [],
    historyOfCaseHearings: [],
    filedDocuments: [],
    linkCases: [],
    subordinateCourt: null,
    firDetails: null,
    caveatDetails: [],
    processes: null,
    ...overrides,
  } as CourtCaseData;
}

describe("formatCaseMarkdown", () => {
  it("generates title from petitioner v. respondent", () => {
    const md = formatCaseMarkdown(makeMockCase());
    expect(md).toContain("# ABC Private Limited v. XYZ Corporation");
  });

  it("falls back to case number when no parties", () => {
    const md = formatCaseMarkdown(makeMockCase({ petitioners: [], respondents: [] }));
    expect(md).toContain("# CS(OS) 123/2024");
  });

  it("includes CNR and key dates", () => {
    const md = formatCaseMarkdown(makeMockCase());
    expect(md).toContain("DLHC010001232024");
    expect(md).toContain("2024-01-15");
    expect(md).toContain("2024-03-15");
  });

  it("includes caseTypeSub", () => {
    const md = formatCaseMarkdown(makeMockCase());
    expect(md).toContain("Commercial");
  });

  it("renders judgment orders with file references", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        judgmentOrders: [
          { orderDate: "2024-02-01", orderType: "INTERIM", orderUrl: "order-2024-02-01.pdf" },
        ],
      })
    );
    expect(md).toContain("## Judgment Orders");
    expect(md).toContain("`order-2024-02-01.pdf`");
  });

  it("renders tagged matters", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        taggedMatters: [
          { type: "CONNECTED", caseNumber: "CS 124/2024", petitioner: "DEF", respondent: "XYZ", status: "PENDING" },
        ],
      })
    );
    expect(md).toContain("## Tagged / Connected Matters");
    expect(md).toContain("[CONNECTED]");
  });

  it("renders notices", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        notices: [
          {
            serialNumber: "1",
            noticeType: "SUMMONS",
            name: "XYZ Corp",
            stateDistrict: "Delhi",
            issueDate: "2024-01-22",
            returnableDate: "2024-02-01",
            dispatchDate: "2024-01-23",
          },
        ],
      })
    );
    expect(md).toContain("## Notices");
    expect(md).toContain("SUMMONS");
  });

  it("renders filed documents", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        filedDocuments: [
          {
            srNo: "1",
            documentNo: "DOC/001",
            dateOfReceiving: "2024-01-15",
            filedBy: "Petitioner",
            advocateName: "Adv. Sharma",
            documentFiled: "Plaint",
          },
        ],
      })
    );
    expect(md).toContain("## Filed Documents");
    expect(md).toContain("Plaint");
  });

  it("renders hearing history (capped at last 10)", () => {
    const hearings = Array.from({ length: 15 }, (_, i) => ({
      causeListType: "DAILY",
      judge: "Justice Sharma",
      businessOnDate: `2024-0${Math.min(i + 1, 9)}-01`,
      hearingDate: `2024-0${Math.min(i + 1, 9)}-01`,
      purposeOfListing: "Arguments",
    }));
    const md = formatCaseMarkdown(makeMockCase({ historyOfCaseHearings: hearings }));
    expect(md).toContain("last 10 of 15");
  });
});

// ─── formatSearchResultMarkdown ─────────────────────────────────────

describe("formatSearchResultMarkdown", () => {
  const mockResult: SearchResult = {
    id: "dlhc_01",
    cnr: "DLHC010001232024",
    caseType: "CIVIL",
    caseStatus: "PENDING",
    filingNumber: "CS/123/2024",
    filingDate: "2024-01-15",
    registrationNumber: "CS(OS)/123/2024",
    registrationDate: "2024-01-20",
    nextHearingDate: "2024-03-15",
    decisionDate: null,
    judges: ["Justice Sharma"],
    petitioners: ["ABC Ltd"],
    petitionerAdvocates: ["Adv. Sharma"],
    respondents: ["XYZ Corp"],
    respondentAdvocates: ["Adv. Patel"],
    actsAndSections: ["CPC - Section 9"],
    courtCode: "DLHC01",
    judicialSection: "CIV",
    caseCategory: "Commercial",
    benchType: "DIVISION",
    aiKeywords: ["contract", "injunction"],
  };

  it("generates party title", () => {
    const md = formatSearchResultMarkdown(mockResult);
    expect(md).toContain("### ABC Ltd v. XYZ Corp");
  });

  it("includes AI keywords", () => {
    const md = formatSearchResultMarkdown(mockResult);
    expect(md).toContain("Keywords: contract, injunction");
  });

  it("includes bench type", () => {
    const md = formatSearchResultMarkdown(mockResult);
    expect(md).toContain("Bench: DIVISION");
  });

  it("includes advocate info", () => {
    const md = formatSearchResultMarkdown(mockResult);
    expect(md).toContain("Petitioner Advs: Adv. Sharma");
    expect(md).toContain("Respondent Advs: Adv. Patel");
  });
});

// ─── formatFacetsMarkdown ───────────────────────────────────────────

describe("formatFacetsMarkdown", () => {
  it("returns empty string for null/empty facets", () => {
    expect(formatFacetsMarkdown({})).toBe("");
  });

  it("formats facets sorted by count descending", () => {
    const md = formatFacetsMarkdown({
      caseType: {
        values: { CIVIL: 85, WRIT: 42, CRIMINAL: 18 },
        totalValues: 3,
        hasMore: false,
      },
    });
    expect(md).toContain("## Facet Counts");
    expect(md).toContain("**caseType:**");
    // CIVIL should come first (highest count)
    const civilIdx = md.indexOf("CIVIL: 85");
    const writIdx = md.indexOf("WRIT: 42");
    expect(civilIdx).toBeLessThan(writIdx);
  });

  it("shows 'more available' indicator", () => {
    const md = formatFacetsMarkdown({
      courtCode: {
        values: { DLHC01: 150 },
        totalValues: 5,
        hasMore: true,
      },
    });
    expect(md).toContain("(more available)");
  });
});

// ─── formatCauseListMarkdown ────────────────────────────────────────

describe("formatCauseListMarkdown", () => {
  const mockEntry: CauseListEntry = {
    id: 123,
    court: "UNKNOWN",
    courtDescription: "UNKNOWN",
    courtType: "DISTRICT_COURT",
    listType: "CRIMINAL",
    bench: "9",
    benchDescription: "Bench 9",
    courtNo: "1",
    date: "2026-02-16",
    caseNumber: ["G.R.case/533/2023"],
    party: "State v. Dilip Ram",
    petitioners: ["The State"],
    respondents: ["Dilip Ram"],
    advocates: ["Adv. Shankar Thakur"],
    judge: ["Manoj Kumar"],
    district: "Bokaro",
    state: "JH",
    cnr: "JHHC0100123",
    listingNo: 19,
    courtComplexCode: "1070001-9",
    status: "APPEARANCE",
    districtCode: "1",
    courtName: "Manoj Kumar-Acjm",
  };

  it("renders party name as heading", () => {
    const md = formatCauseListMarkdown(mockEntry);
    expect(md).toContain("### State v. Dilip Ram");
  });

  it("includes advocates", () => {
    const md = formatCauseListMarkdown(mockEntry);
    expect(md).toContain("Advocates: Adv. Shankar Thakur");
  });

  it("includes CNR when present", () => {
    const md = formatCauseListMarkdown(mockEntry);
    expect(md).toContain("CNR: JHHC0100123");
  });

  it("includes listing number", () => {
    const md = formatCauseListMarkdown(mockEntry);
    expect(md).toContain("Listing No: 19");
  });

  it("omits CNR line when null", () => {
    const entry = { ...mockEntry, cnr: null };
    const md = formatCauseListMarkdown(entry);
    expect(md).not.toContain("CNR:");
  });
});

// ─── formatOrderAiMarkdown ──────────────────────────────────────────

describe("formatOrderAiMarkdown", () => {
  const mockAi: OrderAiAnalysis = {
    summary: "Court granted interim injunction.",
    orderType: "INTERIM_INJUNCTION",
    outcome: "PETITIONER_FAVORED",
    keyPoints: ["Prima facie case", "Injunction granted"],
    reliefGranted: ["Interim injunction"],
    parties: { petitioner: "ABC Ltd", respondent: "XYZ Corp" },
    legalProvisions: ["CPC Order XXXIX"],
    nextSteps: "Listed for 15.03.2024",
    judge: "Justice Sharma",
    orderDate: "2024-02-01",
  };

  it("renders AI analysis when present", () => {
    const md = formatOrderAiMarkdown("CNR123", "order.pdf", "full text...", mockAi);
    expect(md).toContain("## AI Analysis");
    expect(md).toContain("PETITIONER_FAVORED");
    expect(md).toContain("Prima facie case");
    expect(md).toContain("CPC Order XXXIX");
  });

  it("shows fallback message when AI is null", () => {
    const md = formatOrderAiMarkdown("CNR123", "order.pdf", "full text...", null);
    expect(md).toContain("AI analysis not yet available");
    expect(md).not.toContain("## AI Analysis");
  });

  it("always includes extracted text", () => {
    const md = formatOrderAiMarkdown("CNR123", "order.pdf", "ORDER TEXT HERE", null);
    expect(md).toContain("## Extracted Text");
    expect(md).toContain("ORDER TEXT HERE");
  });
});

// ─── Typed field rendering (linkCases, subordinateCourt, firDetails) ─

describe("formatCaseMarkdown typed fields", () => {
  it("renders linked cases using proper typed field", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        linkCases: [
          { filingNumber: "CS/124/2024", caseNumber: "CS(OS) 124/2024" },
        ],
      })
    );
    expect(md).toContain("## Linked Cases");
    expect(md).toContain("CS(OS) 124/2024");
    expect(md).toContain("filing: CS/124/2024");
  });

  it("renders subordinate court using proper typed field", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        subordinateCourt: {
          filingDate: "2023-06-15",
          caseNumber: "CS/456/2023",
          courtName: "District Court, South Delhi",
        },
      })
    );
    expect(md).toContain("## Subordinate Court");
    expect(md).toContain("District Court, South Delhi");
    expect(md).toContain("CS/456/2023");
  });

  it("omits subordinate court when null", () => {
    const md = formatCaseMarkdown(makeMockCase({ subordinateCourt: null }));
    expect(md).not.toContain("## Subordinate Court");
  });

  it("renders FIR details using proper typed field", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        firDetails: {
          caseNumber: "FIR/100/2024",
          policeStation: "Saket PS",
          year: "2024",
        },
      })
    );
    expect(md).toContain("## FIR Details");
    expect(md).toContain("FIR/100/2024");
    expect(md).toContain("Saket PS");
  });

  it("omits FIR section when firDetails has null caseNumber", () => {
    const md = formatCaseMarkdown(
      makeMockCase({
        firDetails: { caseNumber: null, policeStation: null, year: null },
      })
    );
    expect(md).not.toContain("## FIR Details");
  });

  it("omits linked cases section when empty array", () => {
    const md = formatCaseMarkdown(makeMockCase({ linkCases: [] }));
    expect(md).not.toContain("## Linked Cases");
  });
});

// ─── Zod Schema Validation ──────────────────────────────────────────

import {
  SearchCasesSchema,
  SearchCauseListSchema,
  LookupCaseSchema,
  CnrSchema,
} from "../src/schemas/index.js";

describe("Date validation in schemas", () => {
  it("accepts valid YYYY-MM-DD dates", () => {
    const result = SearchCasesSchema.safeParse({
      filing_date_from: "2024-01-15",
      filing_date_to: "2024-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date strings", () => {
    const result = SearchCasesSchema.safeParse({
      filing_date_from: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  it("rejects partial dates", () => {
    const result = SearchCasesSchema.safeParse({
      filing_date_from: "2024-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects dates in wrong format", () => {
    const result = SearchCasesSchema.safeParse({
      next_hearing_date_from: "15/01/2024",
    });
    expect(result.success).toBe(false);
  });

  it("validates cause list search dates too", () => {
    const good = SearchCauseListSchema.safeParse({ date: "2024-02-16", state: "JH" });
    expect(good.success).toBe(true);

    const bad = SearchCauseListSchema.safeParse({ date: "Feb 16", state: "JH" });
    expect(bad.success).toBe(false);
  });
});

describe("LookupCaseSchema", () => {
  it("accepts case_number only", () => {
    const result = LookupCaseSchema.safeParse({ case_number: "CS(OS) 123/2024" });
    expect(result.success).toBe(true);
  });

  it("accepts case_number with court_code", () => {
    const result = LookupCaseSchema.safeParse({
      case_number: "WP(C)/456/2024",
      court_code: "DLHC01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty case_number", () => {
    const result = LookupCaseSchema.safeParse({ case_number: "" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = LookupCaseSchema.safeParse({
      case_number: "CS 123",
      random_field: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("CnrSchema", () => {
  it("accepts valid CNRs", () => {
    expect(CnrSchema.safeParse("DLHC010001232024").success).toBe(true);
  });

  it("rejects too-short CNRs", () => {
    expect(CnrSchema.safeParse("DL01").success).toBe(false);
  });
});
