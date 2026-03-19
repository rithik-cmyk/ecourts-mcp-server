/**
 * Tests for the safeHandler wrapper function.
 * Verifies error catching, isError flag, and param pass-through.
 */

import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import { safeHandler } from "../src/tools/index.js";

type McpResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

describe("safeHandler", () => {
  it("passes through successful result unchanged", async () => {
    const expected: McpResult = {
      content: [{ type: "text", text: "success" }],
    };
    const handler = safeHandler(async () => expected);
    const result = await handler({});
    expect(result).toEqual(expected);
    expect(result.isError).toBeUndefined();
  });

  it("catches thrown Error and returns isError: true", async () => {
    const handler = safeHandler(async () => {
      throw new Error("boom");
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Error: boom");
  });

  it("catches thrown string and returns isError: true", async () => {
    const handler = safeHandler(async () => {
      throw "string error";
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unexpected error: string error");
  });

  it("catches AxiosError and returns formatted API error", async () => {
    const handler = safeHandler(async () => {
      const error = new AxiosError("Request failed");
      error.response = {
        status: 401,
        data: {
          error: { code: "INVALID_TOKEN", message: "Bad token" },
          meta: { requestId: "req_test" },
        },
        headers: {},
        config: { headers: {} } as any,
        statusText: "",
      };
      throw error;
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Authentication error");
  });

  it("passes params through to inner function", async () => {
    let received: unknown;
    const handler = safeHandler(async (params: { foo: string }) => {
      received = params;
      return { content: [{ type: "text" as const, text: "ok" }] };
    });
    await handler({ foo: "bar" });
    expect(received).toEqual({ foo: "bar" });
  });
});
