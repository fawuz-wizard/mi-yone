import { describe, expect, it } from "vitest";
import {
  beginSubmit,
  openCapture,
  submitFailedNetwork,
  submitFailedServer,
  submitSucceeded,
} from "./machine";

describe("capture state machine (Phase 5 §20–22)", () => {
  it("generates the idempotency key at OPEN, before any submit", () => {
    const s = openCapture("sale");
    expect(s.name).toBe("OPEN");
    if (s.name === "OPEN") expect(s.idempotencyKey).toMatch(/[0-9a-f-]{36}/);
  });

  it("keeps the same idempotency key across submit, server error, and retry", () => {
    const open = openCapture("sale");
    const key = open.name === "OPEN" ? open.idempotencyKey : "";
    const editing = { name: "EDITING" as const, kind: "sale" as const, idempotencyKey: key };
    const submitting = beginSubmit(editing);
    expect(submitting.name).toBe("SUBMITTING");
    const errored = submitFailedServer(submitting, "capture.saveFailed");
    expect(errored.name).toBe("SERVER_ERROR");
    const retried = beginSubmit(errored);
    expect(retried.name).toBe("SUBMITTING");
    if (retried.name === "SUBMITTING") expect(retried.idempotencyKey).toBe(key);
  });

  it("routes a network failure to OFFLINE_PENDING with the same key", () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const submitting = { name: "SUBMITTING" as const, kind: "expense" as const, idempotencyKey: key };
    const pending = submitFailedNetwork(submitting);
    expect(pending.name).toBe("OFFLINE_PENDING");
    if (pending.name === "OFFLINE_PENDING") expect(pending.idempotencyKey).toBe(key);
  });

  it("reaches SUCCESS only from SUBMITTING", () => {
    const key = "22222222-2222-4222-8222-222222222222";
    const editing = { name: "EDITING" as const, kind: "sale" as const, idempotencyKey: key };
    expect(submitSucceeded(editing).name).toBe("EDITING");
    expect(submitSucceeded(beginSubmit(editing)).name).toBe("SUCCESS");
  });
});
