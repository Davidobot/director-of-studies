from __future__ import annotations

import argparse
import csv
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_INPUT = Path("content/.cache/schools-uk-june2025.csv")
DEFAULT_OUTPUT = Path("content/schools_domain.csv")


def _normalize_domain(value: str) -> str | None:
    text = (value or "").strip().lower()
    if not text:
        return None

    if "@" in text and " " not in text:
        _, domain = text.rsplit("@", 1)
    else:
        candidate = text if "://" in text else f"https://{text}"
        parsed = urlparse(candidate)
        domain = parsed.netloc or parsed.path

    domain = domain.strip().strip("/")
    if domain.startswith("www."):
        domain = domain[4:]

    if not domain or "." not in domain:
        return None

    return domain


def _build_institution_number(establishment_number: str, postcode: str) -> str:
    normalized_postcode = "".join((postcode or "").upper().split())
    if not normalized_postcode:
        return establishment_number
    return f"{establishment_number}-{normalized_postcode}"


def build_domain_rows(input_csv: Path) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    rows: list[tuple[str, str]] = []

    with input_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            establishment_number = (row.get("EstablishmentNumber") or "").strip()
            if not establishment_number:
                continue

            institution_number = _build_institution_number(
                establishment_number,
                row.get("Postcode") or "",
            )
            email_domain = _normalize_domain(row.get("MainEmail") or "")
            website_domain = _normalize_domain(row.get("SchoolWebsite") or "")

            for domain in (email_domain, website_domain):
                if domain:
                    pair = (institution_number, domain)
                    if pair not in seen:
                        seen.add(pair)
                        rows.append(pair)

    return rows


def write_output(rows: list[tuple[str, str]], output_csv: Path) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["institution_number", "domain"])
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Extract school email/website domains from the June 2025 schools CSV and "
            "write institutional number mappings."
        )
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"Input file not found: {args.input}")

    rows = build_domain_rows(args.input)
    write_output(rows, args.output)
    print(f"Wrote {len(rows)} rows to {args.output}")


if __name__ == "__main__":
    main()