from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class TopicSpec:
    slug: str
    name: str
    pdf_pages: tuple[int, int] | None = None


@dataclass(frozen=True)
class BoardSpec:
    slug: str
    code: str
    name: str
    country: str


@dataclass(frozen=True)
class Specification:
    key: str
    enabled: bool
    board: BoardSpec
    level: str
    subject: str
    category: str
    syllabus_code: str | None
    course_name: str
    pdf_url: str
    topics: list[TopicSpec]
    pdf_file: str | None = None  # manual PDF filename in content/.cache/pdfs/

    @property
    def level_subject_slug(self) -> str:
        return f"{self.level.lower()}-{_slugify(self.subject)}"

    @property
    def content_base_dir(self) -> Path:
        return content_root() / self.board.slug / self.level_subject_slug

    @property
    def is_extras(self) -> bool:
        return self.category != "academic"

    def resolved_pdf_path(self) -> Path:
        """Return the expected PDF path in .cache/pdfs/, respecting pdf_file override."""
        filename = self.pdf_file if self.pdf_file else f"{self.key}.pdf"
        return cache_root() / "pdfs" / filename


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def content_root() -> Path:
    return Path(
        (
            __import__("os").environ.get("CONTENT_DIR")
            or str(repo_root() / "content")
        )
    ).resolve()


def cache_root() -> Path:
    return content_root() / ".cache"


def manifest_path() -> Path:
    return Path(
        (
            __import__("os").environ.get("SPECS_MANIFEST")
            or str(repo_root() / "specs.yaml")
        )
    ).resolve()


def load_manifest() -> tuple[dict[str, BoardSpec], list[Specification]]:
    raw = yaml.safe_load(manifest_path().read_text(encoding="utf-8")) or {}
    raw_boards = raw.get("exam_boards", {})
    boards: dict[str, BoardSpec] = {}
    for slug, board in raw_boards.items():
        boards[slug] = BoardSpec(
            slug=slug,
            code=str(board.get("code", "")).strip(),
            name=str(board.get("name", "")).strip(),
            country=str(board.get("country", "GB")).strip() or "GB",
        )

    specs: list[Specification] = []
    for entry in raw.get("specs", []):
        board_slug = str(entry.get("board", "")).strip()
        if board_slug not in boards:
            raise ValueError(f"Unknown board slug in specs.yaml: {board_slug}")

        topics: list[TopicSpec] = []
        for topic in entry.get("topics", []):
            pages = topic.get("pdf_pages")
            page_tuple: tuple[int, int] | None = None
            if isinstance(pages, list) and len(pages) == 2:
                page_tuple = (int(pages[0]), int(pages[1]))
            topics.append(
                TopicSpec(
                    slug=str(topic.get("slug", "")).strip(),
                    name=str(topic.get("name", "")).strip(),
                    pdf_pages=page_tuple,
                )
            )

        spec = Specification(
            key=str(entry.get("key", "")).strip(),
            enabled=bool(entry.get("enabled", False)),
            board=boards[board_slug],
            level=str(entry.get("level", "")).strip(),
            subject=str(entry.get("subject", "")).strip(),
            category=str(entry.get("category", "academic")).strip() or "academic",
            syllabus_code=(str(entry.get("syllabus_code", "")).strip() or None),
            course_name=str(entry.get("course_name", "")).strip(),
            pdf_url=str(entry.get("pdf_url", "")).strip(),
            topics=topics,
            pdf_file=(str(entry.get("pdf_file", "")).strip() or None),
        )
        _validate_spec(spec)
        specs.append(spec)

    return boards, specs


def enabled_specs() -> list[Specification]:
    _, specs = load_manifest()
    return [spec for spec in specs if spec.enabled]


def _slugify(text: str) -> str:
    return "-".join(
        text.lower()
        .replace("&", " and ")
        .replace("/", " ")
        .replace("\u2014", " ")   # em dash
        .replace("\u2013", " ")   # en dash
        .replace("—", " ")
        .replace("–", " ")
        .split()
    )


def _validate_spec(spec: Specification) -> None:
    if not spec.key:
        raise ValueError("Each spec entry requires a non-empty key")
    if not spec.level or not spec.subject or not spec.course_name:
        raise ValueError(f"Spec {spec.key} is missing level/subject/course_name")
    if spec.enabled and not spec.pdf_url and not spec.is_extras:
        raise ValueError(f"Enabled spec {spec.key} requires pdf_url")
    if spec.enabled and spec.is_extras and not spec.pdf_url and not spec.pdf_file:
        # Extras without pdf_url must have pdf_file, or user places {key}.pdf manually
        pass  # Allow — resolved_pdf_path() falls back to {key}.pdf
    for topic in spec.topics:
        if not topic.slug or not topic.name:
            raise ValueError(f"Spec {spec.key} has topic with missing slug/name")
