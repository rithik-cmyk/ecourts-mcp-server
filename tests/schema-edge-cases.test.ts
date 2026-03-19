/**
 * Schema edge-case tests — boundary conditions on Zod schemas.
 * No source changes needed; all schemas already exported.
 */

import { describe, it, expect } from "vitest";
import {
  SearchCasesSchema,
  GetCourtStructureSchema,
  SearchCauseListSchema,
  GetCaseSchema,
  GetOrderSchema,
  RefreshCaseSchema,
  LookupCaseSchema,
  GetCauseListDatesSchema,
  CnrSchema,
} from "../src/schemas/index.js";

// ─── SearchCasesSchema ──────────────────────────────────────────────

describe("SearchCasesSchema boundaries", () => {
  it("rejects page_size of 0", () => {
    const r = SearchCasesSchema.safeParse({ page_size: 0 });
    expect(r.success).toBe(false);
  });

  it("accepts page_size of 1", () => {
    const r = SearchCasesSchema.safeParse({ page_size: 1 });
    expect(r.success).toBe(true);
  });

  it("accepts page_size of 100", () => {
    const r = SearchCasesSchema.safeParse({ page_size: 100 });
    expect(r.success).toBe(true);
  });

  it("rejects page_size of 101", () => {
    const r = SearchCasesSchema.safeParse({ page_size: 101 });
    expect(r.success).toBe(false);
  });

  it("rejects page of 0", () => {
    const r = SearchCasesSchema.safeParse({ page: 0 });
    expect(r.success).toBe(false);
  });

  it("accepts all valid sort_by values", () => {
    for (const val of ["filingDate", "registrationDate", "nextHearingDate", "decisionDate"]) {
      const r = SearchCasesSchema.safeParse({ sort_by: val });
      expect(r.success).toBe(true);
    }
  });

  it("rejects invalid sort_by value", () => {
    const r = SearchCasesSchema.safeParse({ sort_by: "invalidField" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid sort_order value", () => {
    const r = SearchCasesSchema.safeParse({ sort_order: "ascending" });
    expect(r.success).toBe(false);
  });

  it("rejects court_codes as string instead of array", () => {
    const r = SearchCasesSchema.safeParse({ court_codes: "DLHC01" });
    expect(r.success).toBe(false);
  });

  it("rejects non-integer filing_years", () => {
    const r = SearchCasesSchema.safeParse({ filing_years: [2024.5] });
    expect(r.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const r = SearchCasesSchema.safeParse({ unknownField: "value" });
    expect(r.success).toBe(false);
  });
});

// ─── GetCourtStructureSchema ────────────────────────────────────────

describe("GetCourtStructureSchema", () => {
  it("accepts all valid level values", () => {
    for (const level of ["states", "districts", "complexes", "courts"]) {
      const r = GetCourtStructureSchema.safeParse({ level });
      expect(r.success).toBe(true);
    }
  });

  it("rejects invalid level value", () => {
    const r = GetCourtStructureSchema.safeParse({ level: "invalid" });
    expect(r.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const r = GetCourtStructureSchema.safeParse({ level: "states", extra: true });
    expect(r.success).toBe(false);
  });
});

// ─── SearchCauseListSchema ──────────────────────────────────────────

describe("SearchCauseListSchema boundaries", () => {
  it("rejects limit over 100", () => {
    const r = SearchCauseListSchema.safeParse({ limit: 101 });
    expect(r.success).toBe(false);
  });

  it("rejects negative offset", () => {
    const r = SearchCauseListSchema.safeParse({ offset: -1 });
    expect(r.success).toBe(false);
  });

  it("accepts limit of 100", () => {
    const r = SearchCauseListSchema.safeParse({ limit: 100 });
    expect(r.success).toBe(true);
  });
});

// ─── Strict mode across schemas ─────────────────────────────────────

describe("Strict mode rejects extra fields", () => {
  it("GetCaseSchema rejects extra fields", () => {
    const r = GetCaseSchema.safeParse({ cnr: "DLHC010001232024", extra: true });
    expect(r.success).toBe(false);
  });

  it("GetOrderSchema rejects extra fields", () => {
    const r = GetOrderSchema.safeParse({ cnr: "DLHC010001232024", filename: "order.pdf", extra: true });
    expect(r.success).toBe(false);
  });

  it("RefreshCaseSchema rejects extra fields", () => {
    const r = RefreshCaseSchema.safeParse({ cnr: "DLHC010001232024", extra: true });
    expect(r.success).toBe(false);
  });

  it("LookupCaseSchema rejects extra fields", () => {
    const r = LookupCaseSchema.safeParse({ case_number: "CS(OS) 123/2024", extra: true });
    expect(r.success).toBe(false);
  });

  it("GetCauseListDatesSchema rejects extra fields", () => {
    const r = GetCauseListDatesSchema.safeParse({ state: "DL", extra: true });
    expect(r.success).toBe(false);
  });
});

// ─── CnrSchema boundaries ──────────────────────────────────────────

describe("CnrSchema boundaries", () => {
  it("rejects CNR with 31 characters", () => {
    const r = CnrSchema.safeParse("A".repeat(31));
    expect(r.success).toBe(false);
  });

  it("accepts CNR with 10 characters", () => {
    const r = CnrSchema.safeParse("A".repeat(10));
    expect(r.success).toBe(true);
  });

  it("accepts CNR with 30 characters", () => {
    const r = CnrSchema.safeParse("A".repeat(30));
    expect(r.success).toBe(true);
  });
});
