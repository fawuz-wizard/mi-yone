import { describe, expect, it } from "vitest";
import { decodeQr, encodeProductQr } from "./qr";

describe("QR payload codec", () => {
  it("round-trips a product id", () => {
    const raw = encodeProductQr("p-abc123");
    expect(raw).toBe("MIYONE:P1:p-abc123");
    expect(decodeQr(raw)).toEqual({ kind: "product", productId: "p-abc123" });
  });

  it("carries no business information — only the opaque reference", () => {
    expect(encodeProductQr("p-1")).not.toMatch(/price|Le|name/i);
  });

  it("rejects foreign codes (URLs, random text, payment codes)", () => {
    expect(decodeQr("https://example.com/x").kind).toBe("foreign");
    expect(decodeQr("hello world").kind).toBe("foreign");
    expect(decodeQr("00020101021126...").kind).toBe("foreign");
    expect(decodeQr("").kind).toBe("foreign");
  });

  it("recognizes newer MI YONE schemes as 'future' (the batch seam), not errors", () => {
    expect(decodeQr("MIYONE:B1:batch-9").kind).toBe("future");
    expect(decodeQr("MIYONE:P2:whatever").kind).toBe("future");
  });

  it("tolerates surrounding whitespace from scanners", () => {
    expect(decodeQr("  MIYONE:P1:p-9\n")).toEqual({ kind: "product", productId: "p-9" });
  });
});
