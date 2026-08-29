// Session/business context (Phase 5 §16): auth isolated behind a clean interface.
// The active business is resolved at sign-in/sign-up from the server's response
// (Phase 2 §5 membership) and remembered locally; the DEMO id is only the
// fallback for a browser that has never signed in. The server enforces
// membership on every request regardless of what the client claims.
const KEY = "miy_business_id";

function storedBusinessId(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
  } catch {
    return null;
  }
}

export const BUSINESS_ID = storedBusinessId() ?? "b-demo-1";

export function setActiveBusiness(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable (private mode) — the demo fallback still signs in;
    // a full page load after auth rebinds BUSINESS_ID where storage works.
  }
}
