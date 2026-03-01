from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

from .checksums import load_checksums, save_checksums, sha256_file
from .discovered_topics import load_catalog, save_catalog
from .manifest import cache_root, enabled_specs
from .prompts import topic_discovery_prompt


MODEL = os.environ.get("CONTENT_PIPELINE_OPENAI_MODEL", "gpt-5-mini")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def _spec_raw_path(board_slug: str, level_subject_slug: str, spec_key: str) -> Path:
    return cache_root() / "raw" / board_slug / level_subject_slug / f"{spec_key}.txt"


def _slugify(text: str) -> str:
    return "-".join(text.lower().replace("&", " and ").replace("/", " ").split())


def _discover_topics(
    *,
    client: OpenAI,
    board_name: str,
    level: str,
    subject: str,
    syllabus_code: str | None,
    raw_text: str,
    category: str = "academic",
) -> list[dict[str, str]]:
    prompt = topic_discovery_prompt(
        board_name=board_name,
        level=level,
        subject=subject,
        syllabus_code=syllabus_code,
        raw_text=raw_text[:120000],
        category=category,
    )
    response = client.responses.create(model=MODEL, input=prompt)
    text = (response.output_text or "").strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []

    rows = parsed.get("topics") if isinstance(parsed, dict) else None
    if not isinstance(rows, list):
        return []

    output: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name", "")).strip()
        slug = str(row.get("slug", "")).strip() or _slugify(name)
        if not name or not slug:
            continue
        key = slug.casefold()
        if key in seen:
            continue
        seen.add(key)
        output.append({"name": name, "slug": slug})
    return output


def main() -> None:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required")

    client = OpenAI(api_key=OPENAI_API_KEY)
    specs = enabled_specs()
    checksums = load_checksums()
    catalog = load_catalog()
    catalog_specs = catalog.setdefault("specs", {})

    discovered_count = 0
    skipped_count = 0

    for spec in specs:
        if spec.topics:
            catalog_specs[spec.key] = {
                "source": "manifest",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "topics": [
                    {"name": topic.name, "slug": topic.slug, "approved": True}
                    for topic in spec.topics
                ],
            }
            continue

        cache_key = f"{spec.key}:__spec__"
        raw_file = _spec_raw_path(spec.board.slug, spec.level_subject_slug, spec.key)
        if not raw_file.exists():
            print(f"[skip] raw text missing for {cache_key}")
            skipped_count += 1
            continue

        raw_sha = sha256_file(raw_file)
        current_entry = catalog_specs.get(spec.key, {}) if isinstance(catalog_specs, dict) else {}
        current_topics = current_entry.get("topics", []) if isinstance(current_entry, dict) else []
        if (
            checksums.get(cache_key, {}).get("discovery_raw_sha256") == raw_sha
            and isinstance(current_topics, list)
            and current_topics
        ):
            print(f"[skip] {spec.key} topic discovery unchanged")
            skipped_count += 1
            continue

        topics = _discover_topics(
            client=client,
            board_name=spec.board.name,
            level=spec.level,
            subject=spec.subject,
            syllabus_code=spec.syllabus_code,
            raw_text=raw_file.read_text(encoding="utf-8"),
            category=spec.category,
        )
        if not topics:
            print(f"[skip] no topics discovered for {spec.key}")
            skipped_count += 1
            continue

        catalog_specs[spec.key] = {
            "source": "model",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "topics": [
                {"name": topic["name"], "slug": topic["slug"], "approved": True}
                for topic in topics
            ],
        }

        checksums.setdefault(cache_key, {})["discovery_raw_sha256"] = raw_sha
        save_checksums(checksums)
        discovered_count += 1
        print(f"[ok] discovered {len(topics)} topics for {spec.key}")

    catalog["generated_at"] = datetime.now(timezone.utc).isoformat()
    save_catalog(catalog)
    print("[info] review and edit topic approvals in content/.cache/discovered_topics.yaml")
    print(f"Done. Discovered {discovered_count}; skipped {skipped_count}.")


if __name__ == "__main__":
    main()
