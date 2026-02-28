from __future__ import annotations

import os
from pathlib import Path

from openai import OpenAI

from .checksums import load_checksums, save_checksums, sha256_bytes, sha256_file
from .discovered_topics import approved_topics_for_spec, load_catalog
from .manifest import cache_root, enabled_specs
from .prompts import beautify_prompt


MODEL = os.environ.get("CONTENT_PIPELINE_OPENAI_MODEL", "gpt-5.2")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def _raw_path(board_slug: str, level_subject_slug: str, topic_slug: str) -> str:
    return str(cache_root() / "raw" / board_slug / level_subject_slug / f"{topic_slug}.txt")


def _spec_raw_path(board_slug: str, level_subject_slug: str, spec_key: str) -> Path:
    return cache_root() / "raw" / board_slug / level_subject_slug / f"{spec_key}.txt"


def _call_model(prompt: str, client: OpenAI) -> str:
    response = client.responses.create(
        model=MODEL,
        input=prompt,
    )
    return (response.output_text or "").strip()


def main() -> None:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required")

    client = OpenAI(api_key=OPENAI_API_KEY)
    specs = enabled_specs()
    checksums = load_checksums()
    topic_catalog = load_catalog()
    write_count = 0
    skip_count = 0

    for spec in specs:
        topic_entries = approved_topics_for_spec(spec, topic_catalog)
        if not topic_entries:
            print(
                f"[skip] no approved topics for {spec.key}; run discover-topics and review content/.cache/discovered_topics.yaml"
            )
            skip_count += 1
            continue

        for topic in topic_entries:
            topic_name = str(topic["name"])
            topic_slug = str(topic["slug"])
            cache_key = f"{spec.key}:{topic_slug}"
            if spec.topics:
                raw_file = Path(_raw_path(spec.board.slug, spec.level_subject_slug, topic_slug))
            else:
                raw_file = _spec_raw_path(spec.board.slug, spec.level_subject_slug, spec.key)

            if not raw_file.exists():
                print(f"[skip] raw text missing for {cache_key}")
                skip_count += 1
                continue

            raw_sha = sha256_file(raw_file)
            cached = checksums.get(cache_key, {})
            target = spec.content_base_dir / topic_slug / f"{topic_slug}.md"

            if cached.get("raw_sha256") == raw_sha and target.exists():
                print(f"[skip] {cache_key} unchanged")
                skip_count += 1
                continue

            prompt = beautify_prompt(
                board_name=spec.board.name,
                level=spec.level,
                subject=spec.subject,
                syllabus_code=spec.syllabus_code,
                topic_name=topic_name,
                raw_text=raw_file.read_text(encoding="utf-8"),
            )
            result = _call_model(prompt, client)
            if not result:
                print(f"[skip] empty model output for {cache_key}")
                skip_count += 1
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(result, encoding="utf-8")

            checksums.setdefault(cache_key, {})["raw_sha256"] = raw_sha
            checksums[cache_key]["md_sha256"] = sha256_bytes(result.encode("utf-8"))
            save_checksums(checksums)
            write_count += 1
            print(f"[ok] wrote {target}")

    print(f"Done. Beautified {write_count}; skipped {skip_count}.")


if __name__ == "__main__":
    main()
