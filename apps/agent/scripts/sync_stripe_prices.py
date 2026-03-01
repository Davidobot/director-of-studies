from __future__ import annotations

import os
from typing import Any

import psycopg
import stripe

DATABASE_URL = os.environ.get("DATABASE_URL", "")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

PLAN_PRODUCT_ENV_MAP: dict[str, str] = {
    "Standard Monthly": "STRIPE_PRODUCT_STANDARD_MONTHLY",
    "School Monthly": "STRIPE_PRODUCT_SCHOOL_MONTHLY",
    "Standard Annual": "STRIPE_PRODUCT_STANDARD_ANNUAL",
    "School Annual": "STRIPE_PRODUCT_SCHOOL_ANNUAL",
    "Credit Pack 1h": "STRIPE_PRODUCT_CREDIT_1H",
    "Credit Pack 2h": "STRIPE_PRODUCT_CREDIT_2H",
    "Credit Pack 10h": "STRIPE_PRODUCT_CREDIT_10H",
}

PLAN_INTERVAL_MAP: dict[str, str | None] = {
    "Standard Monthly": "month",
    "School Monthly": "month",
    "Standard Annual": "year",
    "School Annual": "year",
    "Credit Pack 1h": None,
    "Credit Pack 2h": None,
    "Credit Pack 10h": None,
}


def _price_matches_interval(price_obj: dict[str, Any], interval: str | None) -> bool:
    recurring = price_obj.get("recurring")
    if interval is None:
        return recurring is None
    if not isinstance(recurring, dict):
        return False
    return str(recurring.get("interval") or "") == interval


def _resolve_price_id_for_plan(plan_name: str) -> str | None:
    product_env = PLAN_PRODUCT_ENV_MAP.get(plan_name, "")
    product_id = (os.environ.get(product_env, "") or "").strip() if product_env else ""
    if not product_id or not STRIPE_SECRET_KEY:
        return None

    target_interval = PLAN_INTERVAL_MAP.get(plan_name)

    try:
        prices = stripe.Price.list(product=product_id, active=True, limit=100)
        candidates = [
            p
            for p in prices.get("data", [])
            if isinstance(p, dict) and _price_matches_interval(p, target_interval)
        ]
        if candidates:
            candidates.sort(key=lambda p: int(p.get("created") or 0), reverse=True)
            chosen = candidates[0].get("id")
            return str(chosen) if chosen else None

        product = stripe.Product.retrieve(product_id, expand=["default_price"])
        default_price = product.get("default_price")

        if isinstance(default_price, dict):
            if _price_matches_interval(default_price, target_interval):
                chosen = default_price.get("id")
                return str(chosen) if chosen else None
        elif isinstance(default_price, str):
            resolved = stripe.Price.retrieve(default_price)
            if isinstance(resolved, dict) and _price_matches_interval(resolved, target_interval):
                chosen = resolved.get("id")
                return str(chosen) if chosen else None
    except Exception:
        return None

    return None


def main() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")
    if STRIPE_SECRET_KEY:
        stripe.api_key = STRIPE_SECRET_KEY

    updates = 0
    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        for plan_name in PLAN_PRODUCT_ENV_MAP:
            value = _resolve_price_id_for_plan(plan_name)
            if not value:
                continue

            cur.execute(
                """
                UPDATE plans
                SET stripe_price_id = %s
                WHERE name = %s
                  AND stripe_price_id IS DISTINCT FROM %s
                """,
                (value, plan_name, value),
            )
            updates += cur.rowcount
        conn.commit()

    print(f"Stripe price sync complete. Updated rows: {updates}")


if __name__ == "__main__":
    main()
