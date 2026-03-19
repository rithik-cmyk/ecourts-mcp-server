import axios, { AxiosError, AxiosInstance } from "axios";
import { API_BASE_URL, COURT_STRUCTURE_BASE_URL } from "../constants.js";
import type { ApiErrorBody } from "../types.js";

/**
 * Shared HTTP client for the EcourtsIndia Partner API.
 * Reads the bearer token from the ECOURTS_API_TOKEN environment variable.
 */

let _token: string | undefined;

function getToken(): string {
  if (!_token) {
    _token = process.env.ECOURTS_API_TOKEN;
    if (!_token) {
      throw new Error(
        "ECOURTS_API_TOKEN environment variable is not set. " +
        "Set it to your EcourtsIndia Partner API token (e.g. eci_live_...)."
      );
    }
  }
  return _token;
}

/**
 * Serialize query params so that arrays produce repeated keys
 * (e.g. courtCodes=DLHC01&courtCodes=HCBM01) rather than the
 * bracket notation axios uses by default.
 */
export function serializeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

// Authenticated client for partner endpoints
function createPartnerClient(): AxiosInstance {
  return axios.create({
    baseURL: API_BASE_URL,
    timeout: 30_000,
    paramsSerializer: { serialize: serializeParams },
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
  });
}

// Public client for court structure endpoints (no auth required)
function createPublicClient(): AxiosInstance {
  return axios.create({
    baseURL: COURT_STRUCTURE_BASE_URL,
    timeout: 15_000,
    headers: { Accept: "application/json" },
  });
}

/**
 * Make an authenticated request against the partner API.
 */
export async function partnerRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  const client = createPartnerClient();
  const response = await client.request<T>({
    method,
    url: path,
    ...(method === "GET" ? { params } : {}),
  });
  return response.data;
}

/**
 * Download a binary file from the partner API (e.g. order PDFs).
 * Returns both the raw data buffer and response headers.
 */
export async function partnerDownload(
  path: string
): Promise<{ data: Buffer; headers: Record<string, string> }> {
  const client = createPartnerClient();
  const response = await client.request<Buffer>({
    method: "GET",
    url: path,
    responseType: "arraybuffer",
  });
  return {
    data: response.data,
    headers: response.headers as Record<string, string>,
  };
}

/**
 * Make a public (unauthenticated) request against the court-structure API.
 */
export async function publicRequest<T>(path: string): Promise<T> {
  const client = createPublicClient();
  const response = await client.get<T>(path);
  return response.data;
}

/**
 * Format an Axios error (or generic error) into a human-readable,
 * actionable message suitable for LLM consumption.
 *
 * Covers every documented error code from the EcourtsIndia API v1.3:
 * 401: INVALID_TOKEN, TOKEN_INACTIVE
 * 402: INSUFFICIENT_CREDITS, SUBSCRIPTION_REQUIRED
 * 403: ACCOUNT_INACTIVE
 * 429: RATE_LIMIT_EXCEEDED
 * 400: INVALID_CNR, INVALID_PARAMETER, MISSING_PARAMETER, PAGE_SIZE_EXCEEDED, MISSING_FILTER
 * 404: CASE_NOT_FOUND, ORDER_NOT_FOUND
 * 500: INTERNAL_ERROR
 */
export function formatApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<ApiErrorBody>;
    const status = axiosErr.response?.status;
    const body = axiosErr.response?.data;

    // Structured error from the EcourtsIndia API
    if (body?.error) {
      const code = body.error.code;
      const msg = body.error.message;
      const reqId = body.meta?.requestId ?? "unknown";

      switch (code) {
        // 401 Authentication
        case "INVALID_TOKEN":
          return `Authentication error: ${msg}. Check that ECOURTS_API_TOKEN is correct. (request_id: ${reqId})`;
        case "TOKEN_INACTIVE":
          return `Token deactivated: ${msg}. Contact your account manager for a new token. (request_id: ${reqId})`;

        // 402 Billing
        case "INSUFFICIENT_CREDITS":
          return `Insufficient credits: ${msg}. Top up your account or contact your account manager. (request_id: ${reqId})`;
        case "SUBSCRIPTION_REQUIRED":
          return `Active subscription required: ${msg}. Enable a subscription to continue using this endpoint. (request_id: ${reqId})`;

        // 403 Authorization
        case "ACCOUNT_INACTIVE":
          return `Account suspended: ${msg}. Contact your account manager. (request_id: ${reqId})`;

        // 429 Rate Limiting
        case "RATE_LIMIT_EXCEEDED":
          return `Rate limit exceeded: ${msg}. Wait a moment and retry with exponential backoff. (request_id: ${reqId})`;

        // 400 Validation
        case "INVALID_CNR":
          return `Invalid CNR format: ${msg}. CNR should look like DLHC010001232024. (request_id: ${reqId})`;
        case "INVALID_PARAMETER":
          return `Invalid parameter: ${msg}. Check parameter names and types. (request_id: ${reqId})`;
        case "MISSING_PARAMETER":
          return `Missing required parameter: ${msg}. (request_id: ${reqId})`;
        case "PAGE_SIZE_EXCEEDED":
          return `Page size too large (max 100). Reduce your page_size parameter. (request_id: ${reqId})`;
        case "MISSING_FILTER":
          return `At least one filter parameter is required. Provide state, district_code, court_complex_code, or court_no. (request_id: ${reqId})`;

        // 404 Resources
        case "CASE_NOT_FOUND":
          return `Case not found. Verify the CNR is correct and try again. (request_id: ${reqId})`;
        case "ORDER_NOT_FOUND":
          return `Order not found. Use ecourts_get_case first to list available orders, then use the orderUrl value as 'filename'. (request_id: ${reqId})`;

        // 500 Server
        case "INTERNAL_ERROR":
          return `Internal server error (not charged). Retry shortly. (request_id: ${reqId})`;

        default:
          return `API error [${code}]: ${msg} (request_id: ${reqId})`;
      }
    }

    // Generic HTTP errors without structured body
    if (status === 429) {
      return "Rate limited (429). Wait a moment and retry with exponential backoff.";
    }
    if (status && status >= 500) {
      return `Server error (${status}). The EcourtsIndia service may be temporarily unavailable – retry shortly.`;
    }
    if (axiosErr.code === "ECONNABORTED") {
      return "Request timed out. The server may be under heavy load – try again.";
    }

    return `HTTP error ${status ?? "unknown"}: ${axiosErr.message}`;
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Unexpected error: ${String(error)}`;
}
