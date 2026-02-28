from __future__ import annotations

import os
from pathlib import Path

from openai import OpenAI

from .checksums import load_checksums, save_checksums, sha256_bytes, sha256_file
from .manifest import enabled_specs
from .prompts import keywords_prompt


MODEL = os.environ.get("CONTENT_PIPELINE_OPENAI_MODEL", "gpt-5-mini")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def _call_model(prompt: str, client: OpenAI) -> str:
    response = client.responses.create(
        model=MODEL,
        input=prompt,
    )
    return (response.output_text or "").strip()


def _normalise_keywords(text: str) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for raw_line in text.splitlines():
        term = raw_line.strip().lstrip("-•*0123456789. ").strip()
        if not term:
            continue
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        output.append(term)
    return output


def _slug_to_title(slug: str) -> str:
    return slug.replace("-", " ").strip().title()


def _topic_md_paths(spec) -> list[tuple[str, str, Path]]:
    if spec.topics:
        return [
            (
                topic.slug,
                topic.name,
                spec.content_base_dir / topic.slug / f"{topic.slug}.md",
            )
            for topic in spec.topics
        ]

    if not spec.content_base_dir.exists():
        return []

    discovered: list[tuple[str, str, Path]] = []
    for topic_dir in sorted(spec.content_base_dir.glob("*")):
        if not topic_dir.is_dir():
            continue
        topic_slug = topic_dir.name
        md_path = topic_dir / f"{topic_slug}.md"
        if not md_path.exists():
            continue
        discovered.append((topic_slug, _slug_to_title(topic_slug), md_path))
    return discovered


def main() -> None:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required")

    client = OpenAI(api_key=OPENAI_API_KEY)
    specs = enabled_specs()
    checksums = load_checksums()
    write_count = 0
    skip_count = 0

    for spec in specs:
        for topic_slug, topic_name, md_path in _topic_md_paths(spec):
            cache_key = f"{spec.key}:{topic_slug}"
            kw_path = spec.content_base_dir / topic_slug / "keywords.txt"

            if not md_path.exists():
                print(f"[skip] markdown missing for {cache_key}")
                skip_count += 1
                continue

            md_sha = sha256_file(md_path)
            cached = checksums.get(cache_key, {})
            if cached.get("keywords_source_md_sha256") == md_sha and kw_path.exists():
                print(f"[skip] {cache_key} keywords unchanged")
                skip_count += 1
                continue

            prompt = keywords_prompt(
                topic_name=topic_name,
                subject=spec.subject,
                markdown_text=md_path.read_text(encoding="utf-8"),
            )
            model_text = _call_model(prompt, client)
            keywords = _normalise_keywords(model_text)
            if not keywords:
                print(f"[skip] no keywords generated for {cache_key}")
                skip_count += 1
                continue

            heading = (
                f"# STT vocabulary hints for {topic_name} ({spec.level} {spec.subject} {spec.board.code}).\n"
                "# One term per line. Used to improve speech recognition quality.\n"
            )
            body = "\n".join(keywords) + "\n"
            kw_path.parent.mkdir(parents=True, exist_ok=True)
            kw_path.write_text(heading + "\n" + body, encoding="utf-8")

            checksums.setdefault(cache_key, {})["keywords_source_md_sha256"] = md_sha
            checksums[cache_key]["keywords_sha256"] = sha256_bytes(
                (heading + "\n" + body).encode("utf-8")
            )
            save_checksums(checksums)
            write_count += 1
            print(f"[ok] wrote {kw_path}")

    print(f"Done. Keywords written {write_count}; skipped {skip_count}.")


if __name__ == "__main__":
    main()
