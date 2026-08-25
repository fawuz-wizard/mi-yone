"""SLE money — integer minor units + server-side display strings (Phase 2 §7.1).
The ONLY place formatting lives. Clients render `display` verbatim."""


def format_money(amount_minor: int) -> dict:
    whole = abs(amount_minor) // 100
    cents = abs(amount_minor) % 100
    grouped = f"{whole:,}"
    sign = "−" if amount_minor < 0 else ""
    display = f"Le {sign}{grouped}" if cents == 0 else f"Le {sign}{grouped}.{cents:02d}"
    return {"amount_minor": amount_minor, "currency": "SLE", "display": display}
