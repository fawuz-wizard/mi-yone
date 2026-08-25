// Central API-error mapping (Phase 5 §39): API response → domain error → designed UI state.
// Components never see HTTP; they see DomainError.kind and a catalog message id.
import type { ApiErrorBody } from "./types";

export type DomainErrorKind = "network" | "auth" | "forbidden" | "validation" | "not_found" | "conflict" | "server";

export class DomainError extends Error {
  kind: DomainErrorKind;
  messageId: string;
  requestId?: string;
  constructor(kind: DomainErrorKind, messageId: string, requestId?: string) {
    super(messageId);
    this.kind = kind;
    this.messageId = messageId;
    this.requestId = requestId;
  }
}

export function mapApiError(status: number, body: ApiErrorBody | undefined): DomainError {
  const rid = body?.request_id;
  switch (body?.code) {
    case "AUTH_REQUIRED":
    case "AUTH_INVALID":
      return new DomainError("auth", "error.auth", rid);
    case "PERMISSION_DENIED":
      return new DomainError("forbidden", "error.permission", rid);
    case "RATE_LIMITED":
      return new DomainError("server", "error.rateLimited", rid);
    case "VALIDATION_ERROR":
      return new DomainError("validation", "capture.saveFailed", rid);
    case "TENANT_NOT_FOUND":
    case "NOT_FOUND":
      return new DomainError("not_found", "error.generic", rid);
    case "CONFLICT":
      return new DomainError("conflict", "error.generic", rid);
    default:
      if (status === 401 || status === 403) return new DomainError("auth", "error.auth", rid);
      return new DomainError("server", "error.generic", rid);
  }
}

export function networkError(): DomainError {
  return new DomainError("network", "error.network");
}
