from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .manifest import Specification, cache_root


def discovered_topics_path() -> Path:
    return cache_root() / "discovered_topics.yaml"


def load_catalog() -> dict[str, Any]:
    path = discovered_topics_path()
    if not path.exists():
        return {"version": 1, "specs": {}}
    try:
        parsed = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return {"version": 1, "specs": {}}

    if not isinstance(parsed, dict):
        return {"version": 1, "specs": {}}
    parsed.setdefault("version", 1)
    parsed.setdefault("specs", {})
    if not isinstance(parsed["specs"], dict):
        parsed["specs"] = {}
    return parsed


def save_catalog(catalog: dict[str, Any]) -> None:
    path = discovered_topics_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(catalog, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def approved_topics_for_spec(spec: Specification, catalog: dict[str, Any]) -> list[dict[str, str]]:
    if spec.topics:
        return [{"slug": topic.slug, "name": topic.name} for topic in spec.topics]

    spec_entry = (catalog.get("specs") or {}).get(spec.key, {})
    topics = spec_entry.get("topics", []) if isinstance(spec_entry, dict) else []
    if not isinstance(topics, list):
        return []

    approved: list[dict[str, str]] = []
    seen: set[str] = set()
    for topic in topics:
        if not isinstance(topic, dict):
            continue
        if topic.get("approved", True) is False:
            continue
        name = str(topic.get("name", "")).strip()
        slug = str(topic.get("slug", "")).strip()
        if not name or not slug:
            continue
        key = slug.casefold()
        if key in seen:
            continue
        seen.add(key)
        approved.append({"slug": slug, "name": name})
    return approved
