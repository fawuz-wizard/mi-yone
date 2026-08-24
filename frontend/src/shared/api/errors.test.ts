import { describe, expect, it } from "vitest";
import { mapApiError, networkError } from "./errors";

describe("central error mapper (Phase 5 §39–40)", () => {
  it("maps auth codes to the auth domain error", () => {
    expect(mapApiError(401, { code: "AUTH_REQUIRED", message: "x" }).kind).toBe("auth");
    expect(mapApiError(401, { code: "AUTH_INVALID", message: "x" }).kind).toBe("auth");
  });

  it("maps validation to a message that preserves user input framing", () => {
    const e = mapApiError(422, { code: "VALIDATION_ERROR", message: "x" });
    expect(e.kind).toBe("validation");
    expect(e.messageId).toBe("capture.saveFailed");
  });

  it("maps unknown failures to a calm generic error, never raw HTTP", () => {
    const e = mapApiError(500, { code: "INTERNAL_ERROR", message: "x", request_id: "req-1" });
    expect(e.kind).toBe("server");
    expect(e.messageId).toBe("error.generic");
    expect(e.requestId).toBe("req-1");
  });

  it("distinguishes network failure (offline path) from server failure", () => {
    expect(networkError().kind).toBe("network");
  });
});
