from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .manifest import cache_root


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def checksums_path() -> Path:
    return cache_root() / "checksums.json"


def load_checksums() -> dict[str, Any]:
    path = checksums_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_checksums(data: dict[str, Any]) -> None:
    path = checksums_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
