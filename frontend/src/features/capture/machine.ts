// Capture state machine (Phase 5 §20) — explicit states, never ambiguous UI.
// IDLE → OPEN → EDITING → SUBMITTING → SUCCESS
//                EDITING → OFFLINE_PENDING → (SYNCING → SYNCED via capture-queue)
//                SUBMITTING → SERVER_ERROR (input preserved)
// The idempotency key is generated when the flow OPENS (Phase 5 §22), so any retry
// — double tap, network retry, queue flush — is the same logical operation.

export type CaptureKind = "sale" | "expense";

export type CaptureState =
  | { name: "IDLE" }
  | { name: "OPEN"; kind: CaptureKind; idempotencyKey: string }
  | { name: "EDITING"; kind: CaptureKind; idempotencyKey: string }
  | { name: "SUBMITTING"; kind: CaptureKind; idempotencyKey: string }
  | { name: "SERVER_ERROR"; kind: CaptureKind; idempotencyKey: string; messageId: string }
  | { name: "OFFLINE_PENDING"; kind: CaptureKind; idempotencyKey: string }
  | { name: "SUCCESS"; kind: CaptureKind; idempotencyKey: string };

export function openCapture(kind: CaptureKind): CaptureState {
  return { name: "OPEN", kind, idempotencyKey: crypto.randomUUID() };
}

export function beginEditing(s: CaptureState): CaptureState {
  if (s.name === "OPEN") return { ...s, name: "EDITING" };
  return s;
}

export function beginSubmit(s: CaptureState): CaptureState {
  if (s.name === "EDITING" || s.name === "SERVER_ERROR") return { name: "SUBMITTING", kind: s.kind, idempotencyKey: s.idempotencyKey };
  return s;
}

export function submitSucceeded(s: CaptureState): CaptureState {
  if (s.name === "SUBMITTING") return { name: "SUCCESS", kind: s.kind, idempotencyKey: s.idempotencyKey };
  return s;
}

export function submitFailedServer(s: CaptureState, messageId: string): CaptureState {
  if (s.name === "SUBMITTING") return { name: "SERVER_ERROR", kind: s.kind, idempotencyKey: s.idempotencyKey, messageId };
  return s;
}

export function submitFailedNetwork(s: CaptureState): CaptureState {
  if (s.name === "SUBMITTING") return { name: "OFFLINE_PENDING", kind: s.kind, idempotencyKey: s.idempotencyKey };
  return s;
}

export function closeCapture(): CaptureState {
  return { name: "IDLE" };
}
