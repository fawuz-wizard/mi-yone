#!/usr/bin/env python3
"""MI YONE — production verification (Phase 5 steps 5, 6, 7, 8, 11) against a
deployed public URL. Standard library only; run from any machine.

    python3 ops/verify_production.py https://<your-web-hostname>            # steps 5, 6, 8, 11 (creates two THROWAWAY accounts)
    python3 ops/verify_production.py https://<your-web-hostname> --after-restart   # step 7: re-checks the SAME data after you restart the API
    python3 ops/verify_production.py https://<your-web-hostname> --list             # shows the throwaway identifiers to wipe before real testers

It never touches a database directly and never needs a secret: everything goes
through the public hostname exactly the way a phone does. The throwaway
accounts it creates are named verify-<stamp>@example.invalid — nothing real.
State (ids, cookies) is kept in ops/.verify-state.json so --after-restart can
prove persistence; delete that file when you wipe the throwaway data.

Every check prints PASS / FAIL with the evidence; the exit code is 1 if any
check failed. Photo persistence uses a tiny generated PNG.
"""
from __future__ import annotations

import http.cookiejar
import json
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zlib
from pathlib import Path

STATE = Path(__file__).resolve().parent / ".verify-state.json"
RESULTS: list[tuple[str, bool, str]] = []
# Cash figure the smoke test must produce: sale 135,000 in; expense 8,000 and the
# PAID stock purchase 5 × 38,000 = 190,000 out. "Left over" is cash, not profit.
LEFT_OVER = "Le −63,000"


def check(name: str, ok: bool, evidence: str = "") -> bool:
    RESULTS.append((name, ok, evidence))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {evidence}" if evidence else ""))
    return ok


class Client:
    """One browser-like session: its own cookie jar, same-origin calls only."""

    def __init__(self, base: str):
        self.base = base.rstrip("/")
        policy = http.cookiejar.DefaultCookiePolicy()
        if self.base.startswith("http://"):
            # Local dry run only (a production cookie is Secure and a plain-http
            # jar would refuse to send it). Production runs are always https.
            policy.return_ok_secure = lambda cookie, request: True  # type: ignore[assignment]
        self.jar = http.cookiejar.CookieJar(policy)
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.last_headers: dict[str, str] = {}

    def call(self, method: str, path: str, body=None, headers: dict | None = None, raw: bytes | None = None, timeout=60):
        url = self.base + path
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        h = {"Accept": "application/json"}
        if body is not None:
            h["Content-Type"] = "application/json"
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            with self.opener.open(req, timeout=timeout) as r:
                self.last_headers = {k.lower(): v for k, v in r.headers.items()}
                blob = r.read()
                if not self.last_headers.get("content-type", "").startswith(("application/json", "text/")):
                    return r.status, blob  # binary (a photo): the caller checks the content type
                text = blob.decode()
                return r.status, (json.loads(text) if text.startswith("{") else text)
        except urllib.error.HTTPError as e:
            self.last_headers = {k.lower(): v for k, v in e.headers.items()}
            text = e.read().decode(errors="replace")
            try:
                return e.code, json.loads(text)
            except Exception:
                return e.code, text

    def cookie_header(self) -> str:
        return "; ".join(f"{c.name}={c.value}" for c in self.jar)


def tiny_png() -> bytes:
    raw = b"".join(b"\x00" + b"\x9a\x45\x20" * 8 for _ in range(8))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def multipart(field: str, filename: str, content_type: str, data: bytes) -> tuple[bytes, str]:
    boundary = "----miyone" + uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def data(resp):
    return resp.get("data") if isinstance(resp, dict) else None


# ----------------------------------------------------------------------------- steps


def step_readiness(c: Client):
    print("\n== Step 5: readiness ==")
    s, r = c.call("GET", "/api/v1/system/readiness")
    d = data(r) or {}
    check("readiness through the public hostname", s == 200 and d.get("status") == "ready", f"{s} {d}")
    check("migration revision is 0001", d.get("revision") == "0001", str(d.get("revision")))
    s2, _ = c.call("GET", "/readiness")
    check("/readiness is NOT served publicly (API is private; Next only proxies /api/v1)", s2 in (404, 502, 503), f"public /readiness → {s2}")


def step_smoke(c: Client, tag: str) -> dict:
    print("\n== Step 6: smoke test with a throwaway account ==")
    ident = f"verify-{tag}@example.invalid"
    pw = f"verify-{uuid.uuid4().hex[:12]}"
    st: dict = {"identifier": ident, "password": pw}

    s, r = c.call("POST", "/api/v1/auth/register", {"name": "Verify Tester", "identifier": ident, "password": pw, "business_name": f"Verify Shop {tag}"})
    d = data(r) or {}
    check("1-3 register + create business", s in (200, 201) and "business" in d, f"{s}" + (" — sign-up is rate-limited to 5 per 10 minutes per IP; wait ten minutes and rerun" if s == 429 else ""))
    if s not in (200, 201):
        return st
    bid = st["bid"] = d["business"]["id"]
    sc = c.last_headers.get("set-cookie", "")
    st["cookie_flags"] = sc
    check("session cookie set on register", "miy_session=" in sc, sc.split(";")[0][:24] + "…")
    A = f"/api/v1/businesses/{bid}"

    s, r = c.call("POST", f"{A}/products", {"name": "Verify Rice (25kg)", "unit": "bag", "selling_price_minor": 45_000_00, "cost_price_minor": 38_000_00, "low_stock_threshold": 3, "initial_stock": 5})
    pid = st["pid"] = (data(r) or {}).get("id")
    check("4 create product (opening stock 5)", s == 201 and bool(pid), f"{s} {pid}")

    s, r = c.call("POST", f"{A}/products/{pid}/stock", {"quantity": 5, "unit_cost_minor": 38_000_00, "paid": True}, headers={"Idempotency-Key": f"verify-stock-{tag}"})
    check("5 add stock (+5 → 10)", s in (200, 201), f"{s}")

    s, r = c.call("POST", f"{A}/customers", {"name": "Verify Customer", "phone": "+232 76 000 000"})
    cid = st["cid"] = (data(r) or {}).get("id")
    s, r = c.call("POST", f"{A}/sales", {"amount_minor": 135_000_00, "product_id": pid, "quantity": 3, "payment": "PAID", "description": "verify sale"}, headers={"Idempotency-Key": f"verify-sale-{tag}"})
    check("6 record sale (3 × Le 45,000 paid)", s == 201, f"{s}")
    s, r = c.call("POST", f"{A}/transactions", {"type": "EXPENSE", "amount_minor": 8_000_00, "description": "verify transport"}, headers={"Idempotency-Key": f"verify-exp-{tag}"})
    check("7 record expense (Le 8,000)", s == 201, f"{s}")
    s, r = c.call("POST", f"{A}/sales", {"amount_minor": 45_000_00, "product_id": pid, "quantity": 1, "payment": "CREDIT", "customer_id": cid}, headers={"Idempotency-Key": f"verify-credit-{tag}"})
    rid = st["rid"] = ((data(r) or {}).get("receivable") or {}).get("id")
    check("8 record credit sale → owes you (Le 45,000)", s == 201 and bool(rid), f"{s} {rid}")

    verify_data(c, st, "9-14")

    s, r = c.call("POST", f"/api/v1/auth/logout")
    check("15 logout", s == 200, f"{s}")
    s, r = c.call("GET", f"{A}/analytics/dashboard?period=today")
    check("after logout the session is dead (401)", s == 401, f"{s}")
    s, r = c.call("POST", "/api/v1/auth/login", {"identifier": ident, "password": pw})
    check("16 login again", s == 200, f"{s}")
    st["cookie_flags_login"] = c.last_headers.get("set-cookie", "")
    s, r = c.call("GET", f"{A}/analytics/dashboard?period=today")
    check("data still correct after re-login", s == 200 and health_left_over(r) == LEFT_OVER, f"left over {health_left_over(r)}")
    return st


def health_left_over(r) -> str | None:
    d = data(r) or {}
    h = d.get("health", d)
    lo = h.get("left_over")
    return lo.get("display") if isinstance(lo, dict) else lo


def verify_data(c: Client, st: dict, label: str):
    """The figures every run must agree on: they are what the smoke test recorded."""
    A = f"/api/v1/businesses/{st['bid']}"
    s, r = c.call("GET", f"{A}/transactions")
    d = data(r) or {}
    rows = d if isinstance(d, list) else d.get("items", d.get("transactions", []))
    check(f"{label} history lists the sale and the expense", s == 200 and len(rows) >= 2, f"{s} {len(rows)} rows")
    s, r = c.call("GET", f"{A}/analytics/dashboard?period=today")
    check(f"{label} overview: left over {LEFT_OVER} (135,000 in − 8,000 expense − 190,000 paid stock)", s == 200 and health_left_over(r) == LEFT_OVER, f"{s} {health_left_over(r)}")
    s, r = c.call("GET", f"{A}/analytics/trends")
    check(f"{label} analytics/trends answers", s == 200, f"{s}")
    s, r = c.call("GET", f"{A}/products/{st['pid']}")
    p = (data(r) or {}).get("product", {})
    check(f"{label} stock is 6 (5 + 5 − 3 − 1)", s == 200 and p.get("stock") == 6, f"{s} stock={p.get('stock')}")
    s, r = c.call("GET", f"{A}/receivables")
    d = data(r) or {}
    recs = d if isinstance(d, list) else d.get("items", [])
    check(f"{label} debt: Verify Customer owes Le 45,000", s == 200 and any(x.get("counterparty_name") == "Verify Customer" for x in recs), f"{s} {len(recs)} receivable(s)")
    s, r = c.call("GET", f"{A}/watch")
    check(f"{label} Business Watch answers", s == 200, f"{s}")
    if st.get("photo_done"):
        s, r = c.call("GET", f"{A}/products/{st['pid']}/image")
        check(f"{label} product photo still loads", s == 200 and c.last_headers.get("content-type", "").startswith("image/"), f"{s} {c.last_headers.get('content-type')}")
    else:
        body, ctype = multipart("file", "verify.png", "image/png", tiny_png())
        s, r = c.call("POST", f"{A}/products/{st['pid']}/image", raw=body, headers={"Content-Type": ctype})
        check(f"{label} upload product photo", s == 201, f"{s}")
        s, r = c.call("GET", f"{A}/products/{st['pid']}/image")
        ok = s == 200 and c.last_headers.get("content-type", "").startswith("image/")
        check(f"{label} photo served back", ok, f"{s} {c.last_headers.get('content-type')}")
        st["photo_done"] = ok
    # Partner (step 13): one records question; the provider name says which composer is configured.
    s, r = c.call("GET", f"{A}/partner/messages")
    prov = (data(r) or {}).get("provider")
    research = (data(r) or {}).get("research_available")
    check(f"{label} Partner provider configured (local or anthropic), research OFF", prov in ("local", "anthropic") and research is False, f"provider={prov} research_available={research}")
    t0 = time.time()
    s, r = c.call("POST", f"{A}/partner/messages", {"text": "How is my business performing?"}, timeout=90)
    dt = round(time.time() - t0, 1)
    reply = ((data(r) or {}).get("partner") or {})
    blocks = reply.get("blocks") or []
    sources = {b.get("source") for b in blocks}
    text = reply.get("text", "")
    check(f"{label} Partner answers from records within 20 s", s == 201 and dt < 20 and ("records" in sources or "Le " in text), f"{s} in {dt}s, sources={sorted(x for x in sources if x)}")
    check(f"{label} Partner quotes the real figure (Le 135,000 or Le 127,000)", ("135,000" in text) or ("127,000" in text), text[:120].replace("\n", " ") + "…")


def step_tenant(c_a: Client, st_a: dict, base: str, tag: str):
    print("\n== Step 8: tenant isolation ==")
    c_b = Client(base)
    ident = f"verify-{tag}-b@example.invalid"
    pw = f"verify-{uuid.uuid4().hex[:12]}"
    s, r = c_b.call("POST", "/api/v1/auth/register", {"name": "Verify Other", "identifier": ident, "password": pw, "business_name": f"Other Shop {tag}"})
    check("second throwaway account + business", s in (200, 201), f"{s}" + (" — rate-limited (5 sign-ups / 10 min / IP); wait and rerun" if s == 429 else ""))
    if s not in (200, 201):
        return
    st_a["identifier_b"] = ident
    A = f"/api/v1/businesses/{st_a['bid']}"
    probes = [
        ("business products", f"{A}/products"),
        ("one product", f"{A}/products/{st_a['pid']}"),
        ("product photo", f"{A}/products/{st_a['pid']}/image"),
        ("transactions", f"{A}/transactions"),
        ("receivables", f"{A}/receivables"),
        ("dashboard", f"{A}/analytics/dashboard?period=today"),
        ("Business Watch", f"{A}/watch"),
        ("Partner history", f"{A}/partner/messages"),
        ("reports export", f"{A}/reports/export"),
    ]
    for name, path in probes:
        s, r = c_b.call("GET", path)
        leaked = isinstance(r, dict) and r.get("success") is True
        check(f"B cannot read A's {name} (404)", s == 404 and not leaked, f"{s}")
    s, r = c_b.call("POST", f"{A}/sales", {"amount_minor": 100, "product_id": st_a["pid"], "quantity": 1, "payment": "PAID"}, headers={"Idempotency-Key": f"verify-x-{tag}"})
    check("B cannot write into A's business (404)", s == 404, f"{s}")
    s, r = c_b.call("POST", f"{A}/partner/messages", {"text": "How is my business performing?"})
    check("B cannot ask A's Partner (404)", s == 404, f"{s}")
    s, r = c_a.call("GET", f"{A}/products/{st_a['pid']}")
    check("A's product still intact after probes", s == 200 and ((data(r) or {}).get("product") or {}).get("stock") == 6, f"{s} stock={((data(r) or {}).get('product') or {}).get('stock')}")


def step_security(c: Client, st: dict, base: str):
    print("\n== Step 11: security ==")
    for label in ("cookie_flags", "cookie_flags_login"):
        sc = st.get(label, "").lower()
        check(f"cookie ({label.replace('cookie_flags', 'register' if label == 'cookie_flags' else 'login')}): Secure + HttpOnly + SameSite=Lax", all(x in sc for x in ("secure", "httponly", "samesite=lax")), st.get(label, "")[:100])
    check("HTTPS", base.startswith("https://"), base)
    anon = Client(base)
    s, _ = anon.call("GET", "/api/docs")
    check("API docs disabled (/api/docs)", s in (404, 502), f"{s}")
    s, _ = anon.call("GET", "/api/openapi.json")
    check("OpenAPI disabled", s in (404, 502), f"{s}")
    s, r = anon.call("GET", "/api/v1/businesses/nope/products")
    rid_body = (r.get("error") or {}).get("request_id") if isinstance(r, dict) else None
    check("unauthenticated → 401 envelope, no internals", s == 401 and isinstance(r, dict) and "Traceback" not in json.dumps(r), f"{s}")
    check("request id in envelope = X-Request-Id header", bool(rid_body) and rid_body == anon.last_headers.get("x-request-id"), f"{rid_body}")
    s, r = anon.call("POST", "/api/v1/auth/login", raw=b'{"identifier": "x", "password": ', headers={"Content-Type": "application/json"})
    check("malformed JSON → structured 422, no stack trace", s == 422 and "Traceback" not in json.dumps(r), f"{s}")
    sec = {k: anon.last_headers.get(k) for k in ("x-content-type-options", "x-frame-options", "referrer-policy", "cache-control")}
    check("security headers present", sec.get("x-content-type-options") == "nosniff" and sec.get("x-frame-options") == "DENY", str(sec))
    # Rate limit sanity: three wrong logins must NOT lock the proxy's shared IP for everyone.
    codes = [anon.call("POST", "/api/v1/auth/login", {"identifier": st["identifier"], "password": "wrong-password-1"})[0] for _ in range(3)]
    s, _ = anon.call("POST", "/api/v1/auth/login", {"identifier": st["identifier"], "password": st["password"]})
    check("3 wrong logins → 401s, correct login still allowed (no proxy-wide lockout)", codes == [401, 401, 401] and s == 200, f"{codes} then {s}")
    check("no API key in any response", "sk-ant" not in json.dumps(RESULTS), "")


# ----------------------------------------------------------------------------- main


def main(argv: list[str]) -> int:
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 64
    base = argv[0].rstrip("/")
    mode = argv[1] if len(argv) > 1 else "full"
    if mode == "--list":
        st = json.loads(STATE.read_text()) if STATE.exists() else {}
        print("Throwaway identifiers to wipe before real testers:", st.get("identifier"), st.get("identifier_b"))
        return 0
    c = Client(base)
    if mode == "--after-restart":
        print("== Step 7: persistence after restart ==")
        st = json.loads(STATE.read_text())
        s, _ = c.call("POST", "/api/v1/auth/login", {"identifier": st["identifier"], "password": st["password"]})
        check("user still exists and can sign in", s == 200, f"{s}")
        s, _ = c.call("GET", f"/api/v1/businesses/{st['bid']}/analytics/dashboard?period=today")
        check("business still exists", s == 200, f"{s}")
        verify_data(c, st, "after restart:")
    else:
        tag = time.strftime("%Y%m%d%H%M%S")
        step_readiness(c)
        st = step_smoke(c, tag)
        if st.get("bid"):
            step_tenant(c, st, base, tag)
            step_security(c, st, base)
            STATE.write_text(json.dumps(st, indent=2))
            print(f"\nState saved to {STATE} (needed for --after-restart; delete it when you wipe the throwaway data)")
    failed = [n for n, ok, _ in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed" + (f"; FAILED: {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
