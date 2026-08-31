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
  timeoutMs?: number;
}

// On a weak connection a request can hang indefinitely. That used to leave the
// Save button spinning with no way out, and when the owner closed the sheet and
// tried again they got a NEW idempotency key — so a late-landing request could
// still create a second record. A request that has not answered by now is
// treated as a failure the owner can retry with the SAME key.
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000; // photos are large and connections are slow

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE}${path}`,
      {
        method: opts.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: "same-origin",
      },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  } catch {
    // A timeout and a dead connection are the same thing to the owner: it did
    // not go through, and the record is still theirs to retry.
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
    res = await fetchWithTimeout(
      `${BASE}${path}`,
      { method: "POST", body: form, credentials: "same-origin" },
      UPLOAD_TIMEOUT_MS,
    );
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
