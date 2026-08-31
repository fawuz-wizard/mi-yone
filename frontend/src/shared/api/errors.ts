// Central API-error mapping (Phase 5 §39): API response → domain error → designed UI state.
// Components never see HTTP; they see DomainError.kind and a catalog message id.
import type { ApiErrorBody } from "./types";

export type DomainErrorKind = "network" | "auth" | "forbidden" | "validation" | "not_found" | "conflict" | "server";

export class DomainError extends Error {
  kind: DomainErrorKind;
  messageId: string;
  requestId?: string;
  // The server's own user-facing sentence (already shop-floor language) —
  // screens that need the specific reason (e.g. "only 3 left") can show it.
  serverMessage?: string;
  constructor(kind: DomainErrorKind, messageId: string, requestId?: string, serverMessage?: string) {
    super(messageId);
    this.kind = kind;
    this.messageId = messageId;
    this.requestId = requestId;
    this.serverMessage = serverMessage;
  }
}

export function mapApiError(status: number, body: ApiErrorBody | undefined): DomainError {
  const rid = body?.request_id;
  const msg = body?.message;
  switch (body?.code) {
    case "AUTH_REQUIRED":
    case "AUTH_INVALID":
      return new DomainError("auth", "error.auth", rid);
    case "PERMISSION_DENIED":
      return new DomainError("forbidden", "error.permission", rid);
    case "RATE_LIMITED":
      return new DomainError("server", "error.rateLimited", rid);
    case "VALIDATION_ERROR":
      return new DomainError("validation", "capture.saveFailed", rid, msg);
    case "TENANT_NOT_FOUND":
    case "NOT_FOUND":
      return new DomainError("not_found", "error.generic", rid);
    case "CONFLICT":
      return new DomainError("conflict", "error.generic", rid);
    default:
      if (status === 401 || status === 403) return new DomainError("auth", "error.auth", rid);
      // 502/503/504 with no envelope is what a weak link actually looks like:
      // a gateway answered, the app did not. Treating it as a server rejection
      // meant the record was not held for retry and the owner was told
      // "something went wrong" when the truth was "no connection".
      if (status === 502 || status === 503 || status === 504 || status === 0) {
        return new DomainError("network", "error.network", rid);
      }
      return new DomainError("server", "error.generic", rid);
  }
}

export function networkError(): DomainError {
  return new DomainError("network", "error.network");
}
