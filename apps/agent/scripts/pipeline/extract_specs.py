from __future__ import annotations

from pathlib import Path

import fitz

from .checksums import load_checksums, save_checksums, sha256_file
from .manifest import cache_root, enabled_specs


def _raw_path(board_slug: str, level_subject_slug: str, topic_slug: str) -> Path:
    return cache_root() / "raw" / board_slug / level_subject_slug / f"{topic_slug}.txt"


def _spec_raw_path(board_slug: str, level_subject_slug: str, spec_key: str) -> Path:
    return cache_root() / "raw" / board_slug / level_subject_slug / f"{spec_key}.txt"


def _extract_pages(doc: fitz.Document, page_range: tuple[int, int] | None) -> str:
    if page_range is None:
        start_idx, end_idx = 0, doc.page_count - 1
    else:
        start_idx = max(0, page_range[0] - 1)
        end_idx = min(doc.page_count - 1, page_range[1] - 1)

    blocks: list[str] = []
    for idx in range(start_idx, end_idx + 1):
        page = doc.load_page(idx)
        blocks.append(page.get_text("text"))

    raw = "\n\n".join(blocks)
    lines = [line.strip() for line in raw.splitlines()]
    cleaned = [line for line in lines if line and not line.isdigit()]
    return "\n".join(cleaned)


def main() -> None:
    specs = enabled_specs()
    checksums = load_checksums()
    extracted_count = 0
    skip_count = 0

    for spec in specs:
        pdf_path = spec.resolved_pdf_path()
        if not pdf_path.exists():
            print(f"[skip] {spec.key} missing PDF at {pdf_path}")
            skip_count += 1
            continue

        pdf_sha = sha256_file(pdf_path)
        with fitz.open(pdf_path) as doc:
            if not spec.topics:
                cache_key = f"{spec.key}:__spec__"
                raw_path = _spec_raw_path(spec.board.slug, spec.level_subject_slug, spec.key)
                cached = checksums.get(cache_key, {})
                if cached.get("pdf_sha256") == pdf_sha and raw_path.exists():
                    print(f"[skip] {cache_key} unchanged")
                    skip_count += 1
                    continue

                text = _extract_pages(doc, None)
                raw_path.parent.mkdir(parents=True, exist_ok=True)
                raw_path.write_text(text, encoding="utf-8")
                checksums.setdefault(cache_key, {})["pdf_sha256"] = pdf_sha
                save_checksums(checksums)
                extracted_count += 1
                print(f"[ok] extracted {cache_key} -> {raw_path}")
                continue

            for topic in spec.topics:
                raw_path = _raw_path(spec.board.slug, spec.level_subject_slug, topic.slug)
                cache_key = f"{spec.key}:{topic.slug}"
                cached = checksums.get(cache_key, {})
                if cached.get("pdf_sha256") == pdf_sha and raw_path.exists():
                    print(f"[skip] {cache_key} unchanged")
                    skip_count += 1
                    continue

                text = _extract_pages(doc, topic.pdf_pages)
                raw_path.parent.mkdir(parents=True, exist_ok=True)
                raw_path.write_text(text, encoding="utf-8")

                checksums.setdefault(cache_key, {})["pdf_sha256"] = pdf_sha
                save_checksums(checksums)
                extracted_count += 1
                print(f"[ok] extracted {cache_key} -> {raw_path}")

    print(f"Done. Extracted {extracted_count}; skipped {skip_count}.")


if __name__ == "__main__":
    main()
