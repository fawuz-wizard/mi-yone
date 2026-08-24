// Capture-queue BOUNDARY (Phase 5 §37 / Phase 3 §8).
// v1 default implementation: in-memory pending list with automatic retry.
// The durable offline queue (IndexedDB, restarts, auth expiry, multi-device) is
// GATED on the approved Offline Capture Technical Design — do not upgrade this
// module silently. The interface is the seam that design will implement.

export interface PendingCapture {
  idempotencyKey: string;
  label: string; // user-facing, e.g. "Sale · Le 45,000"
  submittedAt: number;
  state: "pending" | "saving" | "failed";
  retry: () => Promise<void>;
}

type Listener = (items: PendingCapture[]) => void;

const items = new Map<string, PendingCapture>();
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...items.values()];
  listeners.forEach((l) => l(snapshot));
}

export const captureQueue = {
  enqueue(item: PendingCapture) {
    items.set(item.idempotencyKey, item);
    emit();
  },
  setState(key: string, state: PendingCapture["state"]) {
    const item = items.get(key);
    if (item) {
      item.state = state;
      emit();
    }
  },
  resolve(key: string) {
    items.delete(key);
    emit();
  },
  async flush() {
    for (const item of [...items.values()]) {
      if (item.state !== "saving") await item.retry().catch(() => undefined);
    }
  },
  observe(listener: Listener): () => void {
    listeners.add(listener);
    listener([...items.values()]);
    return () => listeners.delete(listener);
  },
};
