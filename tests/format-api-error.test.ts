/**
 * Tests for formatApiError — all error code branches.
 * Uses mock AxiosError objects to trigger each branch without real API calls.
 */

import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import { formatApiError } from "../src/services/api-client.js";

// ─── Helper to construct mock AxiosErrors ───────────────────────────

function makeStructuredError(
  status: number,
  code: string,
  message: string,
  requestId?: string
): AxiosError {
  const error = new AxiosError(`Request failed with status ${status}`);
  error.response = {
    status,
    data: {
      error: { code, message },
      meta: requestId ? { requestId } : undefined,
    },
    headers: {},
    config: { headers: {} } as any,
    statusText: "",
  };
  return error;
}

function makeGenericHttpError(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status ${status}`);
  error.response = {
    status,
    data: {},
    headers: {},
    config: { headers: {} } as any,
    statusText: "",
  };
  return error;
}

// ─── Structured API error codes ─────────────────────────────────────

describe("formatApiError — structured API error codes", () => {
  it("handles INVALID_TOKEN", () => {
    const result = formatApiError(makeStructuredError(401, "INVALID_TOKEN", "Invalid token", "req_001"));
    expect(result).toContain("Authentication error");
    expect(result).toContain("ECOURTS_API_TOKEN");
    expect(result).toContain("request_id: req_001");
  });

  it("handles TOKEN_INACTIVE", () => {
    const result = formatApiError(makeStructuredError(401, "TOKEN_INACTIVE", "Token inactive", "req_002"));
    expect(result).toContain("Token deactivated");
    expect(result).toContain("account manager");
    expect(result).toContain("request_id: req_002");
  });

  it("handles INSUFFICIENT_CREDITS", () => {
    const result = formatApiError(makeStructuredError(402, "INSUFFICIENT_CREDITS", "No credits", "req_003"));
    expect(result).toContain("Insufficient credits");
    expect(result).toContain("Top up");
  });

  it("handles SUBSCRIPTION_REQUIRED", () => {
    const result = formatApiError(makeStructuredError(402, "SUBSCRIPTION_REQUIRED", "Need subscription", "req_004"));
    expect(result).toContain("Active subscription required");
  });

  it("handles ACCOUNT_INACTIVE", () => {
    const result = formatApiError(makeStructuredError(403, "ACCOUNT_INACTIVE", "Account suspended", "req_005"));
    expect(result).toContain("Account suspended");
  });

  it("handles RATE_LIMIT_EXCEEDED", () => {
    const result = formatApiError(makeStructuredError(429, "RATE_LIMIT_EXCEEDED", "Too many requests", "req_006"));
    expect(result).toContain("Rate limit exceeded");
    expect(result).toContain("exponential backoff");
  });

  it("handles INVALID_CNR", () => {
    const result = formatApiError(makeStructuredError(400, "INVALID_CNR", "Bad CNR", "req_007"));
    expect(result).toContain("Invalid CNR format");
    expect(result).toContain("DLHC010001232024");
  });

  it("handles INVALID_PARAMETER", () => {
    const result = formatApiError(makeStructuredError(400, "INVALID_PARAMETER", "Bad param", "req_008"));
    expect(result).toContain("Invalid parameter");
  });

  it("handles MISSING_PARAMETER", () => {
    const result = formatApiError(makeStructuredError(400, "MISSING_PARAMETER", "Param missing", "req_009"));
    expect(result).toContain("Missing required parameter");
  });

  it("handles PAGE_SIZE_EXCEEDED", () => {
    const result = formatApiError(makeStructuredError(400, "PAGE_SIZE_EXCEEDED", "Too large", "req_010"));
    expect(result).toContain("Page size too large");
    expect(result).toContain("max 100");
  });

  it("handles MISSING_FILTER", () => {
    const result = formatApiError(makeStructuredError(400, "MISSING_FILTER", "Need filter", "req_011"));
    expect(result).toContain("At least one filter");
  });

  it("handles CASE_NOT_FOUND", () => {
    const result = formatApiError(makeStructuredError(404, "CASE_NOT_FOUND", "Not found", "req_012"));
    expect(result).toContain("Case not found");
    expect(result).toContain("Verify the CNR");
  });

  it("handles ORDER_NOT_FOUND", () => {
    const result = formatApiError(makeStructuredError(404, "ORDER_NOT_FOUND", "Not found", "req_013"));
    expect(result).toContain("Order not found");
    expect(result).toContain("ecourts_get_case");
  });

  it("handles INTERNAL_ERROR", () => {
    const result = formatApiError(makeStructuredError(500, "INTERNAL_ERROR", "Server error", "req_014"));
    expect(result).toContain("Internal server error");
    expect(result).toContain("not charged");
  });

  it("handles unknown error code via default", () => {
    const result = formatApiError(makeStructuredError(400, "FUTURE_ERROR_CODE", "Something new", "req_015"));
    expect(result).toContain("API error [FUTURE_ERROR_CODE]");
    expect(result).toContain("Something new");
  });
});

// ─── requestId handling ─────────────────────────────────────────────

describe("formatApiError — requestId handling", () => {
  it("includes requestId when present", () => {
    const result = formatApiError(makeStructuredError(401, "INVALID_TOKEN", "Bad", "req_abc123"));
    expect(result).toContain("request_id: req_abc123");
  });

  it("uses 'unknown' when requestId is missing", () => {
    const result = formatApiError(makeStructuredError(401, "INVALID_TOKEN", "Bad"));
    expect(result).toContain("request_id: unknown");
  });
});

// ─── Generic HTTP errors (no structured body) ───────────────────────

describe("formatApiError — generic HTTP errors", () => {
  it("handles generic 429 without body", () => {
    const result = formatApiError(makeGenericHttpError(429));
    expect(result).toContain("Rate limited (429)");
    expect(result).toContain("exponential backoff");
  });

  it("handles 500 server error without body", () => {
    const result = formatApiError(makeGenericHttpError(500));
    expect(result).toContain("Server error (500)");
    expect(result).toContain("temporarily unavailable");
  });

  it("handles 502 server error without body", () => {
    const result = formatApiError(makeGenericHttpError(502));
    expect(result).toContain("Server error (502)");
  });

  it("handles 503 server error without body", () => {
    const result = formatApiError(makeGenericHttpError(503));
    expect(result).toContain("Server error (503)");
  });

  it("handles ECONNABORTED timeout", () => {
    const error = new AxiosError("timeout", "ECONNABORTED");
    const result = formatApiError(error);
    expect(result).toContain("Request timed out");
    expect(result).toContain("heavy load");
  });

  it("handles unknown HTTP status", () => {
    const result = formatApiError(makeGenericHttpError(418));
    expect(result).toContain("HTTP error 418");
  });

  it("handles AxiosError with no response (network error)", () => {
    const error = new AxiosError("Network Error");
    // No response object set
    const result = formatApiError(error);
    expect(result).toContain("HTTP error unknown");
  });
});

// ─── Non-Axios errors ───────────────────────────────────────────────

describe("formatApiError — non-Axios errors", () => {
  it("handles null error", () => {
    const result = formatApiError(null);
    expect(result).toContain("Unexpected error: null");
  });

  it("handles undefined error", () => {
    const result = formatApiError(undefined);
    expect(result).toContain("Unexpected error: undefined");
  });

  it("handles numeric error", () => {
    const result = formatApiError(42);
    expect(result).toContain("Unexpected error: 42");
  });
});
