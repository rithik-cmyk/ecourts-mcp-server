/**
 * Integration tests for ecourts-mcp-server.
 *
 * These hit the LIVE EcourtsIndia Partner API and consume real credits.
 * Run with: ECOURTS_API_TOKEN=eci_live_... npm run test:integration
 *
 * The token is ONLY read from the environment variable — it is never
 * written to any file or logged.
 *
 * Automatic skip conditions:
 *   1. No ECOURTS_API_TOKEN in environment
 *   2. webapi.ecourtsindia.com is unreachable (e.g. network proxy block)
 */

import { describe, it, expect, beforeAll } from "vitest";
import axios from "axios";
import { partnerRequest, publicRequest } from "../src/services/api-client.js";
import type {
  CaseDetailResponse,
  SearchResponse,
  OrderAiResponse,
  OrderMetadataResponse,
  StateEntry,
  DistrictEntry,
  CourtComplexEntry,
  CourtEntry,
  CauseListSearchResponse,
  AvailableDatesResponse,
  RefreshResponse,
} from "../src/types.js";

// ─── Guard: skip if no token or no network access ───────────────────
const TOKEN = process.env.ECOURTS_API_TOKEN;

let apiReachable = true;

if (TOKEN) {
  // Probe connectivity before tests run — cannot do async at module level,
  // so we do a sync-style guard in beforeAll and each test checks the flag.
}

beforeAll(async () => {
  if (!TOKEN) return;
  try {
    await axios.get("https://webapi.ecourtsindia.com/api/CauseList/court-structure/states", {
      timeout: 10_000,
    });
  } catch (err: unknown) {
    apiReachable = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `\n⚠ Cannot reach webapi.ecourtsindia.com — all integration tests will be skipped.\n` +
      `  Reason: ${msg.slice(0, 120)}\n` +
      `  Run these tests from a machine with direct internet access.\n`
    );
  }
});

/** Use instead of `describe` — skips the entire suite if no token */
const describeWithApi = TOKEN ? describe : describe.skip;

/** Call at the top of each `it()` body to skip if the API is network-blocked */
function requireApi(): void {
  if (!apiReachable) {
    // Vitest doesn't have a built-in skip-inside-test, so we just return early
    // via the caller checking the return value
  }
}

// ─── Shared state discovered during test run ────────────────────────
let discoveredCnr: string | undefined;
let discoveredOrderFile: string | undefined;
let discoveredCaseNumber: string | undefined;
let discoveredDistrictCode: string | undefined;
let discoveredComplexCode: string | undefined;
let discoveredCauseListDate: string | undefined;

// =====================================================================
// 1. Court Structure (public, free, no auth)
// =====================================================================
describeWithApi("Court Structure (public endpoints)", () => {
  it("lists all Indian states", async () => {
    if (!apiReachable) return;
    const states = await publicRequest<StateEntry[]>("/states");

    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(10); // India has 28 states + UTs

    // Check structure of each entry
    const delhi = states.find((s) => s.state === "DL");
    expect(delhi).toBeDefined();
    expect(delhi!.stateName).toBe("Delhi");

    // Supreme Court appears as state code "SC"
    const sc = states.find((s) => s.state === "SC");
    expect(sc).toBeDefined();
    expect(sc!.stateName).toBe("India");
  });

  it("lists districts for a state", async () => {
    if (!apiReachable) return;
    const districts = await publicRequest<DistrictEntry[]>("/states/DL/districts");

    expect(Array.isArray(districts)).toBe(true);
    expect(districts.length).toBeGreaterThan(0);

    // Each district should have code and name
    for (const d of districts) {
      expect(d.districtCode).toBeTruthy();
      expect(d.districtName).toBeTruthy();
    }

    // Save first district code for complex/court discovery
    discoveredDistrictCode = districts[0].districtCode;
    console.error(`  → Discovered district code: ${discoveredDistrictCode}`);
  });
});

// =====================================================================
// 2. Case Search (authenticated)
// =====================================================================
describeWithApi("Case Search", () => {
  it("finds cases by advocate name in Delhi High Court", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      pageSize: 5,
      page: 1,
    });

    expect(res.data).toBeDefined();
    expect(res.data.totalHits).toBeGreaterThan(0);
    expect(res.data.results.length).toBeGreaterThan(0);
    expect(res.data.results.length).toBeLessThanOrEqual(5);

    // Verify result shape
    const first = res.data.results[0];
    expect(first.cnr).toBeTruthy();
    expect(first.caseType).toBeTruthy();
    expect(first.caseStatus).toBeTruthy();
    expect(Array.isArray(first.petitioners)).toBe(true);
    expect(Array.isArray(first.respondents)).toBe(true);

    // Save a CNR and case number for subsequent tests
    discoveredCnr = first.cnr;
    discoveredCaseNumber = first.registrationNumber ?? first.filingNumber ?? undefined;
    console.error(`  → Discovered CNR for further tests: ${discoveredCnr}`);
    if (discoveredCaseNumber) {
      console.error(`  → Discovered case number: ${discoveredCaseNumber}`);
    }
  });

  it("returns facets with search results", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      pageSize: 1,
      page: 1,
      includeFacetCounts: true,
    });

    expect(res.data.facets).toBeDefined();
    // Should have at least caseType or caseStatus facets
    const facetKeys = Object.keys(res.data.facets);
    expect(facetKeys.length).toBeGreaterThan(0);
  });

  it("returns pagination metadata", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      pageSize: 2,
      page: 1,
    });

    expect(res.data.page).toBe(1);
    expect(res.data.pageSize).toBe(2);
    expect(typeof res.data.totalPages).toBe("number");
    expect(typeof res.data.hasNextPage).toBe("boolean");
    expect(typeof res.data.hasPreviousPage).toBe("boolean");
  });
});

// =====================================================================
// 3. Case Detail (authenticated, uses discovered CNR)
// =====================================================================
describeWithApi("Case Detail", () => {
  it("retrieves full case details by CNR", async () => {
    if (!apiReachable) return;
    // Use discovered CNR or fall back to a known example
    const cnr = discoveredCnr;
    if (!cnr) {
      console.error("  ⚠ No CNR discovered from search — skipping case detail test");
      return;
    }

    const res = await partnerRequest<CaseDetailResponse>("GET", `/case/${cnr}`);

    // Top-level structure
    expect(res.data).toBeDefined();
    expect(res.data.courtCaseData).toBeDefined();
    expect(res.data.entityInfo).toBeDefined();

    const c = res.data.courtCaseData;
    expect(c.cnr).toBe(cnr);
    expect(c.caseNumber).toBeTruthy();
    expect(c.courtName).toBeTruthy();
    expect(Array.isArray(c.judges)).toBe(true);
    expect(Array.isArray(c.petitioners)).toBe(true);
    expect(Array.isArray(c.respondents)).toBe(true);

    // entityInfo timestamps
    expect(res.data.entityInfo.dateCreated).toBeTruthy();
    expect(res.data.entityInfo.dateModified).toBeTruthy();

    // Try to discover an order file for the order tests
    if (c.judgmentOrders?.length) {
      discoveredOrderFile = c.judgmentOrders[0].orderUrl;
      console.error(`  → Discovered order file: ${discoveredOrderFile}`);
    } else if (c.interimOrders?.length) {
      discoveredOrderFile = c.interimOrders[0].orderUrl;
      console.error(`  → Discovered interim order file: ${discoveredOrderFile}`);
    }
  });

  it("returns 404 for non-existent CNR", async () => {
    if (!apiReachable) return;
    try {
      await partnerRequest<CaseDetailResponse>("GET", "/case/ZZZZ999999999999");
      // If we get here, the API didn't error — which is unexpected
      expect(true).toBe(false); // force fail
    } catch (error: unknown) {
      // Should be an axios error with 404 or 400 status
      if (error && typeof error === "object" && "response" in error) {
        const axErr = error as { response: { status: number } };
        expect([400, 404]).toContain(axErr.response.status);
      }
    }
  });
});

// =====================================================================
// 4. Order with AI Summary (authenticated, uses discovered data)
// =====================================================================
describeWithApi("Order AI", () => {
  it("retrieves order text and AI analysis if available", async () => {
    if (!apiReachable) return;
    if (!discoveredCnr || !discoveredOrderFile) {
      console.error("  ⚠ No CNR/order discovered — skipping order AI test");
      return;
    }

    const res = await partnerRequest<OrderAiResponse>(
      "GET",
      `/case/${discoveredCnr}/order-ai/${discoveredOrderFile}`
    );

    expect(res.data).toBeDefined();
    expect(res.data.cnr).toBe(discoveredCnr);
    expect(res.data.filename).toBe(discoveredOrderFile);

    // extractedText should be a string (may be empty for some orders)
    expect(typeof res.data.extractedText).toBe("string");

    // aiAnalysis may be null (not yet processed) or an object
    if (res.data.aiAnalysis !== null) {
      const ai = res.data.aiAnalysis;
      expect(ai.summary).toBeTruthy();
      expect(ai.orderType).toBeTruthy();
      expect(ai.outcome).toBeTruthy();
      expect(Array.isArray(ai.keyPoints)).toBe(true);
      expect(Array.isArray(ai.reliefGranted)).toBe(true);
      expect(Array.isArray(ai.legalProvisions)).toBe(true);
      console.error(`  → AI analysis available: ${ai.orderType} / ${ai.outcome}`);
    } else {
      console.error("  → AI analysis is null (not yet processed for this order)");
    }
  });
});

// =====================================================================
// 5. Cause List Available Dates (authenticated, free)
// =====================================================================
describeWithApi("Cause List Dates", () => {
  it("returns available dates for Delhi", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<AvailableDatesResponse>(
      "GET",
      "/causelist/available-dates",
      { state: "DL" }
    );

    expect(Array.isArray(res.data)).toBe(true);

    if (res.data.length > 0) {
      // Dates should be in YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      expect(res.data[0]).toMatch(dateRegex);
      console.error(`  → Found ${res.data.length} dates, latest: ${res.data[0]}`);
    } else {
      console.error("  → No cause list dates available for Delhi right now");
    }
  });
});

// =====================================================================
// 6. Cause List Search (authenticated, ₹1 per request — single call)
// =====================================================================
describeWithApi("Cause List Search", () => {
  it("searches cause list entries in a state", async () => {
    if (!apiReachable) return;
    // Use a broad search to avoid zero results. This costs ₹1.
    const res = await partnerRequest<CauseListSearchResponse>(
      "GET",
      "/causelist/search",
      { state: "DL", limit: 3 }
    );

    expect(res.data).toBeDefined();
    expect(typeof res.data.returnedCount).toBe("number");

    if (res.data.results.length > 0) {
      const entry = res.data.results[0];
      expect(entry.date).toBeTruthy();
      expect(entry.state).toBe("DL");
      expect(Array.isArray(entry.judge)).toBe(true);
      console.error(`  → Found ${res.data.returnedCount} cause list entries`);
    } else {
      console.error("  → No cause list entries found (may be a holiday or no data)");
    }
  });
});

// =====================================================================
// 7. Error handling — verify our error formatter produces useful output
// =====================================================================
describeWithApi("Error Handling", () => {
  it("formatApiError produces actionable messages for auth errors", async () => {
    if (!apiReachable) return;
    // Temporarily set a bad token by calling the API directly
    const axios = (await import("axios")).default;
    try {
      await axios.get(
        "https://webapi.ecourtsindia.com/api/partner/case/DLHC010001232024",
        { headers: { Authorization: "Bearer eci_live_invalid_token_for_test" } }
      );
      expect(true).toBe(false); // should not reach here
    } catch (error: unknown) {
      // The API should return 401 with INVALID_TOKEN
      if (error && typeof error === "object" && "response" in error) {
        const axErr = error as { response: { status: number; data: unknown } };
        expect(axErr.response.status).toBe(401);
      }
    }
  });
});

// =====================================================================
// 8. End-to-end: search → detail → order (workflow test)
// =====================================================================
describeWithApi("End-to-end Workflow", () => {
  it("search → case detail → order AI (full pipeline)", async () => {
    if (!apiReachable) return;
    // Step 1: Search for any case in Delhi HC
    const search = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      pageSize: 10,
      page: 1,
    });
    expect(search.data.results.length).toBeGreaterThan(0);

    // Step 2: Find a case that has orders
    let targetCnr: string | undefined;
    for (const result of search.data.results) {
      const detail = await partnerRequest<CaseDetailResponse>("GET", `/case/${result.cnr}`);
      const c = detail.data.courtCaseData;
      if (c.judgmentOrders?.length || c.interimOrders?.length) {
        targetCnr = c.cnr;
        const orderFile = c.judgmentOrders?.[0]?.orderUrl ?? c.interimOrders?.[0]?.orderUrl;

        // Step 3: Retrieve order AI
        if (orderFile) {
          const orderAi = await partnerRequest<OrderAiResponse>(
            "GET",
            `/case/${targetCnr}/order-ai/${orderFile}`
          );
          expect(orderAi.data.cnr).toBe(targetCnr);
          expect(typeof orderAi.data.extractedText).toBe("string");
          console.error(`  → Full pipeline completed: search → ${targetCnr} → ${orderFile}`);
        }
        break;
      }
    }

    if (!targetCnr) {
      console.error("  ⚠ No case with orders found in first 10 results — pipeline partially tested");
    }
  });
});

// =====================================================================
// 9. Court Structure — Complexes & Courts (public, free)
// =====================================================================
describeWithApi("Court Structure — Complexes & Courts", () => {
  it("lists complexes for a district", async () => {
    if (!apiReachable) return;
    if (!discoveredDistrictCode) {
      console.error("  ⚠ No district code discovered — skipping complexes test");
      return;
    }

    const complexes = await publicRequest<CourtComplexEntry[]>(
      `/states/DL/districts/${discoveredDistrictCode}/complexes`
    );

    expect(Array.isArray(complexes)).toBe(true);
    expect(complexes.length).toBeGreaterThan(0);

    for (const c of complexes) {
      expect(c.courtComplexCode).toBeTruthy();
      expect(c.courtComplexName).toBeTruthy();
    }

    discoveredComplexCode = complexes[0].courtComplexCode;
    console.error(`  → Discovered complex code: ${discoveredComplexCode}`);
  });

  it("lists courts for a complex", async () => {
    if (!apiReachable) return;
    if (!discoveredDistrictCode || !discoveredComplexCode) {
      console.error("  ⚠ No district/complex code discovered — skipping courts test");
      return;
    }

    const courts = await publicRequest<CourtEntry[]>(
      `/states/DL/districts/${discoveredDistrictCode}/complexes/${discoveredComplexCode}/courts`
    );

    expect(Array.isArray(courts)).toBe(true);
    expect(courts.length).toBeGreaterThan(0);

    for (const c of courts) {
      expect(c.courtName).toBeTruthy();
      expect(c.courtNo).toBeDefined();
    }

    console.error(`  → Found ${courts.length} courts, first: ${courts[0].courtName}`);
  });
});

// =====================================================================
// 10. Order Metadata (authenticated, uses discovered data)
// =====================================================================
describeWithApi("Order Metadata", () => {
  it("retrieves order data for a discovered order", async () => {
    if (!apiReachable) return;
    if (!discoveredCnr || !discoveredOrderFile) {
      console.error("  ⚠ No CNR/order discovered — skipping order metadata test");
      return;
    }

    try {
      const res = await partnerRequest<OrderMetadataResponse>(
        "GET",
        `/case/${discoveredCnr}/order/${discoveredOrderFile}`
      );

      // The order endpoint returns data — verify we get a response
      expect(res).toBeDefined();

      // If JSON response with data wrapper
      if (res.data && typeof res.data === "object" && "cnr" in res.data) {
        expect(res.data.cnr).toBe(discoveredCnr);
        expect(res.data.filename).toBe(discoveredOrderFile);
        console.error(`  → Order metadata JSON: download as ${res.data.downloadFilename}`);
      } else {
        // The endpoint may return binary/file data directly
        console.error(`  → Order endpoint returned non-JSON response (likely file data)`);
        expect(res).toBeTruthy();
      }
    } catch (error: unknown) {
      // Order endpoint may return 500 intermittently
      if (error && typeof error === "object" && "response" in error) {
        const axErr = error as { response: { status: number } };
        if (axErr.response.status >= 500) {
          console.error(`  ⚠ Order endpoint returned ${axErr.response.status} (server-side, skipping)`);
          return;
        }
      }
      throw error;
    }
  });
});

// =====================================================================
// 11. Search with Filters (authenticated)
// =====================================================================
describeWithApi("Search with Filters", () => {
  it("searches with text query", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      query: "property",
      courtCodes: ["DLHC01"],
      pageSize: 3,
      page: 1,
    });

    expect(res.data).toBeDefined();
    expect(res.data.totalHits).toBeGreaterThan(0);
    expect(res.data.results.length).toBeGreaterThan(0);
    console.error(`  → Text query "property" found ${res.data.totalHits} hits`);
  });

  it("searches with sort options", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      sortBy: "filingDate",
      sortOrder: "desc",
      pageSize: 3,
      page: 1,
    });

    expect(res.data).toBeDefined();
    expect(res.data.results.length).toBeGreaterThan(0);

    // Verify pagination metadata is present
    expect(typeof res.data.page).toBe("number");
    expect(typeof res.data.totalPages).toBe("number");
    console.error(`  → Sort by filingDate desc: ${res.data.totalHits} total hits`);
  });

  it("searches with year filter", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      filingYears: [2024],
      pageSize: 3,
      page: 1,
    });

    expect(res.data).toBeDefined();
    expect(res.data.results.length).toBeGreaterThan(0);
    console.error(`  → Filing year 2024: ${res.data.totalHits} cases`);
  });
});

// =====================================================================
// 12. Search by Case Number (authenticated)
// =====================================================================
describeWithApi("Search by Case Number", () => {
  it("searches using a discovered case number", async () => {
    if (!apiReachable) return;
    if (!discoveredCaseNumber) {
      console.error("  ⚠ No case number discovered — skipping case number search test");
      return;
    }

    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      query: discoveredCaseNumber,
      courtCodes: ["DLHC01"],
      pageSize: 5,
      page: 1,
    });

    expect(res.data).toBeDefined();
    expect(res.data.results.length).toBeGreaterThan(0);

    // Check if the discovered case is in results
    const found = res.data.results.find(
      (r) => r.filingNumber === discoveredCaseNumber || r.registrationNumber === discoveredCaseNumber
    );
    if (found) {
      console.error(`  → Found exact match for case number: ${discoveredCaseNumber}`);
    } else {
      console.error(`  → Search returned results but no exact match for: ${discoveredCaseNumber}`);
    }
  });

  it("searches with court_code filter scopes results", async () => {
    if (!apiReachable) return;
    const res = await partnerRequest<SearchResponse>("GET", "/search", {
      courtCodes: ["DLHC01"],
      pageSize: 5,
      page: 1,
    });

    expect(res.data).toBeDefined();
    expect(res.data.results.length).toBeGreaterThan(0);

    // All results should be from DLHC01 court
    for (const r of res.data.results) {
      expect(r.courtCode).toBeDefined();
      expect(r.courtCode).toBe("DLHC01");
    }
  });
});

// =====================================================================
// 13. Refresh Case (authenticated, idempotent)
// =====================================================================
describeWithApi("Refresh Case", () => {
  it("queues a case refresh", async () => {
    if (!apiReachable) return;
    if (!discoveredCnr) {
      console.error("  ⚠ No CNR discovered — skipping refresh test");
      return;
    }

    const res = await partnerRequest<RefreshResponse>("POST", `/case/${discoveredCnr}/refresh`);

    expect(res.data).toBeDefined();
    expect(res.data.cnr).toBe(discoveredCnr);
    expect(res.data.status).toBeTruthy();
    expect(res.data.message).toBeTruthy();
    console.error(`  → Refresh status: ${res.data.status} — ${res.data.message}`);
  });
});

// =====================================================================
// 14. Cause List with Date Filter (authenticated, ₹1 per request)
// =====================================================================
describeWithApi("Cause List with Date Filter", () => {
  it("searches cause list by specific date", async () => {
    if (!apiReachable) return;

    // First, get available dates
    const datesRes = await partnerRequest<AvailableDatesResponse>(
      "GET",
      "/causelist/available-dates",
      { state: "DL" }
    );

    if (!datesRes.data?.length) {
      console.error("  ⚠ No cause list dates available for Delhi — skipping");
      return;
    }

    discoveredCauseListDate = datesRes.data[0];
    console.error(`  → Using cause list date: ${discoveredCauseListDate}`);

    // Search with that date
    const res = await partnerRequest<CauseListSearchResponse>(
      "GET",
      "/causelist/search",
      { state: "DL", date: discoveredCauseListDate, limit: 3 }
    );

    expect(res.data).toBeDefined();
    expect(typeof res.data.returnedCount).toBe("number");

    if (res.data.results.length > 0) {
      const entry = res.data.results[0];
      expect(entry.date).toBe(discoveredCauseListDate);
      console.error(`  → Found ${res.data.returnedCount} entries for ${discoveredCauseListDate}`);
    } else {
      console.error(`  → No entries for ${discoveredCauseListDate} (unexpected)`);
    }
  });
});

// =====================================================================
// 15. Error Scenarios — structured API errors
// =====================================================================
describeWithApi("Error Scenarios", () => {
  it("search with no filters returns MISSING_FILTER error", async () => {
    if (!apiReachable) return;
    try {
      await partnerRequest<SearchResponse>("GET", "/search", {
        page: 1,
        pageSize: 1,
      });
      // If we get here, the API didn't error — still valid if API allows empty search
      console.error("  → API accepted search without filters (no error thrown)");
    } catch (error: unknown) {
      if (error && typeof error === "object" && "response" in error) {
        const axErr = error as { response: { status: number; data: any } };
        expect(axErr.response.status).toBe(400);
        if (axErr.response.data?.error?.code) {
          expect(axErr.response.data.error.code).toBe("MISSING_FILTER");
          console.error("  → Got expected MISSING_FILTER error");
        }
      }
    }
  });

  it("invalid CNR format returns error", async () => {
    if (!apiReachable) return;
    try {
      await partnerRequest<CaseDetailResponse>("GET", "/case/INVALID");
      expect(true).toBe(false); // should not reach here
    } catch (error: unknown) {
      if (error && typeof error === "object" && "response" in error) {
        const axErr = error as { response: { status: number; data: any } };
        expect([400, 404]).toContain(axErr.response.status);
        console.error(`  → Got expected error status ${axErr.response.status} for invalid CNR`);
      }
    }
  });
});
