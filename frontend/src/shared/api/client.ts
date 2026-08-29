// The single API client (Phase 5 §5/§39). Envelope unwrapping, error mapping,
// and the Idempotency-Key header live here and nowhere else.
import type { Envelope } from "./types";
import { DomainError, mapApiError, networkError } from "./errors";

const BASE = "/api/v1";

// A stale/invalid session (e.g. a leftover cookie from another mode or an
// expired sign-in) must never strand the owner on a dead dashboard: send them
// to the door to sign in again. Door pages are exempt so a wrong password on
// the sign-in screen stays an inline message, not a redirect loop.
const DOOR_PATHS = ["/welcome", "/signin", "/signup"];
function redirectToDoorIfSessionInvalid(err: DomainError): void {
  if (err.kind !== "auth" || typeof window === "undefined") return;
  if (DOOR_PATHS.some((p) => window.location.pathname.startsWith(p))) return;
  window.location.assign("/welcome");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
    });
  } catch {
    throw networkError();
  }
  let envelope: Envelope<T> | undefined;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    envelope = undefined;
  }
  if (!res.ok || !envelope?.success) {
    const err = mapApiError(res.status, envelope?.error);
    redirectToDoorIfSessionInvalid(err);
    throw err;
  }
  return envelope.data as T;
}

// Multipart upload (product photos). Same envelope/error discipline as api();
// the browser sets the multipart boundary header itself.
export async function apiUpload<T>(path: string, file: File | Blob, fieldName = "file"): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw networkError();
  }
  let envelope: Envelope<T> | undefined;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    envelope = undefined;
  }
  if (!res.ok || !envelope?.success) {
    const err = mapApiError(res.status, envelope?.error);
    redirectToDoorIfSessionInvalid(err);
    throw err;
  }
  return envelope.data as T;
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
