// QR payload codec for Scan-to-Sell. The code carries ONLY an opaque product
// reference — never a price, a name, or any business information; the backend's
// tenant guard decides what (if anything) it resolves to for the signed-in
// business. The version prefix is the batch-system seam: product codes are
// "P1", future batch codes become "B1:<batch-id>" without touching this codec.
// Pure module — unit-tested.

const PREFIX = "MIYONE";
export const PRODUCT_VERSION = "P1";

export function encodeProductQr(productId: string): string {
  return `${PREFIX}:${PRODUCT_VERSION}:${productId}`;
}

export type DecodedQr =
  | { kind: "product"; productId: string }
  | { kind: "future" } // a MI YONE code from a newer scheme (e.g. batches) — honest "update needed"
  | { kind: "foreign" }; // not a MI YONE code at all

export function decodeQr(raw: string): DecodedQr {
  const text = raw.trim();
  const parts = text.split(":");
  if (parts.length < 3 || parts[0] !== PREFIX) return { kind: "foreign" };
  if (parts[1] === PRODUCT_VERSION && parts[2].length > 0 && parts[2].length <= 40) {
    return { kind: "product", productId: parts.slice(2).join(":") };
  }
  return { kind: "future" };
}
