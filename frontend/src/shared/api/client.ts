// The single API client (Phase 5 §5/§39). Envelope unwrapping, error mapping,
// and the Idempotency-Key header live here and nowhere else.
import type { Envelope } from "./types";
import { DomainError, mapApiError, networkError } from "./errors";

const BASE = "/api/v1";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
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
    throw mapApiError(res.status, envelope?.error);
  }
  return envelope.data as T;
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
