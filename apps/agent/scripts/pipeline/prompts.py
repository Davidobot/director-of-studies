from __future__ import annotations


def topic_discovery_prompt(
    *,
    board_name: str,
    level: str,
    subject: str,
    syllabus_code: str | None,
    raw_text: str,
) -> str:
    syllabus = syllabus_code or "Unknown"
    return (
        "From this UK exam specification text, identify the core teachable topics suitable for tutoring sessions.\n"
        "Return strict JSON only with this schema:\n"
        '{"topics":[{"name":"...","slug":"..."}]}\n'
        "Rules:\n"
        "- 4 to 12 topics.\n"
        "- Topic names must be concise and learner-facing.\n"
        "- Slugs must be lowercase kebab-case.\n"
        "- Avoid duplicates and generic labels like 'introduction' or 'assessment'.\n"
        "- Use board-specific terminology when useful.\n\n"
        f"Board: {board_name}\n"
        f"Level: {level}\n"
        f"Subject: {subject}\n"
        f"Syllabus code: {syllabus}\n\n"
        "Specification text:\n"
        "-----\n"
        f"{raw_text}\n"
        "-----"
    )


def beautify_prompt(
    *,
    board_name: str,
    level: str,
    subject: str,
    syllabus_code: str | None,
    topic_name: str,
    raw_text: str,
) -> str:
    syllabus = syllabus_code or "Unknown"
    return (
        "You are rewriting UK exam-board specification text into high-quality revision content.\n"
        "Output must be plain markdown and must follow this exact structure:\n"
        f"# {topic_name} ({level} {subject} {board_name})\n"
        "Then 5-9 sections with `##` headings and paragraph prose.\n"
        "Final section title must be exactly `## Exam technique`.\n\n"
        "Requirements:\n"
        "- Use flowing prose, not bullet lists.\n"
        "- Keep facts historically/literarily accurate.\n"
        "- Clean formatting artefacts from OCR/PDF extraction.\n"
        "- Supplement the material with relevant context, examples, and clarification useful for teaching.\n"
        "- Keep language suitable for a student revision guide.\n"
        "- Do not use citations, links, YAML frontmatter, or code blocks.\n"
        "- Target 1000-2500 words.\n\n"
        f"Board: {board_name}\n"
        f"Level: {level}\n"
        f"Subject: {subject}\n"
        f"Syllabus code: {syllabus}\n"
        f"Topic: {topic_name}\n\n"
        "Raw source text follows:\n"
        "-----\n"
        f"{raw_text}\n"
        "-----"
    )


def keywords_prompt(*, topic_name: str, subject: str, markdown_text: str) -> str:
    return (
        "Extract speech-to-text keyword hints from this revision text.\n"
        "Return only newline-separated terms (one per line), no numbering or bullets.\n"
        "Prioritise: proper nouns, specialist vocabulary, named events, places, technical terms.\n"
        "Avoid generic everyday words.\n"
        "Target 20-60 terms.\n\n"
        f"Topic: {topic_name}\n"
        f"Subject: {subject}\n\n"
        "Text:\n"
        "-----\n"
        f"{markdown_text}\n"
        "-----"
    )
