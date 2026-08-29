"""File storage (Phase 2 architecture slot, first realized here for product
photos). Local-disk implementation behind a tiny interface — object storage
(S3-compatible) later means swapping these four functions, nothing else.

Safety rules: keys are ALWAYS server-generated (uuid + validated extension,
prefixed by business id) — client input never touches a filesystem path; type
and size are validated before a byte is written; reads resolve inside the
upload root only."""
from __future__ import annotations

import uuid
from pathlib import Path

from .config import settings
from .envelope import ApiError

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB — plenty for a product photo


def _root() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_image(business_id: str, data: bytes, content_type: str) -> str:
    ext = ALLOWED_TYPES.get(content_type)
    if ext is None:
        raise ApiError(422, "VALIDATION_ERROR", "That file type isn't supported — use a JPG, PNG, or WebP photo.")
    if len(data) == 0:
        raise ApiError(422, "VALIDATION_ERROR", "The photo file is empty.")
    if len(data) > MAX_BYTES:
        raise ApiError(422, "VALIDATION_ERROR", "That photo is too large — keep it under 5 MB.")
    key = f"{business_id}/{uuid.uuid4().hex}.{ext}"
    path = _root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def read_image(key: str) -> tuple[bytes, str] | None:
    path = (_root() / key).resolve()
    if not str(path).startswith(str(_root().resolve())) or not path.is_file():
        return None
    ext = path.suffix.lstrip(".")
    content_type = next((ct for ct, e in ALLOWED_TYPES.items() if e == ext), "application/octet-stream")
    return path.read_bytes(), content_type


def delete_image(key: str) -> None:
    path = (_root() / key).resolve()
    if str(path).startswith(str(_root().resolve())) and path.is_file():
        path.unlink()
