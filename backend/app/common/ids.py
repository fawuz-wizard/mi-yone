import uuid


def gen_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"
