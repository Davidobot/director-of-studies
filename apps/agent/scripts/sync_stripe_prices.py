from __future__ import annotations

import os

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "")

PLAN_PRICE_ENV_MAP: dict[str, str] = {
    "Standard Monthly": "STRIPE_PRICE_STANDARD_MONTHLY",
    "School Monthly": "STRIPE_PRICE_SCHOOL_MONTHLY",
    "Standard Annual": "STRIPE_PRICE_STANDARD_ANNUAL",
    "School Annual": "STRIPE_PRICE_SCHOOL_ANNUAL",
    "Credit Pack 1h": "STRIPE_PRICE_CREDIT_1H",
    "Credit Pack 2h": "STRIPE_PRICE_CREDIT_2H",
    "Credit Pack 10h": "STRIPE_PRICE_CREDIT_10H",
}


def main() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")

    updates = 0
    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        for plan_name, env_name in PLAN_PRICE_ENV_MAP.items():
            value = (os.environ.get(env_name, "") or "").strip()
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
