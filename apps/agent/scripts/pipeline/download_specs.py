from __future__ import annotations

import json

import httpx

from .checksums import load_checksums, save_checksums, sha256_bytes
from .manifest import cache_root, enabled_specs


def _errors_report_path() -> Path:
    return cache_root() / "download_errors.json"


def main() -> None:
    specs = enabled_specs()
    if not specs:
        print("No enabled specs in manifest.")
        return

    checksums = load_checksums()
    download_count = 0
    skip_count = 0
    error_count = 0
    errors: list[dict[str, str]] = []

    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        for spec in specs:
            if not spec.pdf_url:
                if spec.is_extras:
                    pdf_dest = spec.resolved_pdf_path()
                    if pdf_dest.exists():
                        print(f"[ok] {spec.key} manual PDF present at {pdf_dest}")
                    else:
                        print(
                            f"[info] {spec.key} is an extras spec — place PDF manually at {pdf_dest}"
                        )
                else:
                    print(f"[skip] {spec.key} has no pdf_url")
                skip_count += 1
                continue

            print(f"[download] {spec.key} <- {spec.pdf_url}")
            try:
                response = client.get(spec.pdf_url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                print(f"[error] {spec.key}: {exc}")
                error_count += 1
                errors.append(
                    {
                        "spec_key": spec.key,
                        "pdf_url": spec.pdf_url,
                        "error": str(exc),
                    }
                )
                continue

            content = response.content
            pdf_sha = sha256_bytes(content)
            cached = checksums.get(spec.key, {})
            target = spec.resolved_pdf_path()

            if cached.get("pdf_sha256") == pdf_sha and target.exists():
                print(f"[skip] {spec.key} unchanged")
                skip_count += 1
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)

            checksums.setdefault(spec.key, {})["pdf_sha256"] = pdf_sha
            save_checksums(checksums)
            download_count += 1
            print(f"[ok] {spec.key} saved -> {target}")

    if errors:
        report_path = _errors_report_path()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps({"errors": errors}, indent=2), encoding="utf-8")

        print("\n[warning] Some PDF downloads failed.")
        print(f"[warning] Review and fix URLs in specs.yaml, then rerun make download.")
        print(f"[warning] Error report written to: {report_path}")
        for item in errors:
            print(f"  - {item['spec_key']} -> {item['pdf_url']}")
    else:
        report_path = _errors_report_path()
        if report_path.exists():
            report_path.unlink()

    print(f"Done. Downloaded {download_count}; skipped {skip_count}; errors {error_count}.")


if __name__ == "__main__":
    main()
