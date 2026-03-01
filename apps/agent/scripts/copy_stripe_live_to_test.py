from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import stripe


SOURCE_PRODUCT_METADATA_KEY = "copied_from_live_product_id"
SOURCE_PRICE_METADATA_KEY = "copied_from_live_price_id"


@dataclass
class CopyStats:
    products_created: int = 0
    products_updated: int = 0
    products_skipped: int = 0
    prices_created: int = 0
    prices_skipped: int = 0
    prices_unsupported: int = 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy Stripe products and prices from live account to test account.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually create/update resources in test account. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--product-id",
        action="append",
        default=[],
        help="Specific live product ID to copy. Repeat flag to pass multiple products.",
    )
    parser.add_argument(
        "--include-inactive-products",
        action="store_true",
        help="Include inactive live products.",
    )
    parser.add_argument(
        "--include-inactive-prices",
        action="store_true",
        help="Include inactive prices for selected products.",
    )
    parser.add_argument(
        "--output",
        default="stripe-live-to-test-map.json",
        help="Path to write copy mapping JSON.",
    )
    return parser.parse_args()


def _require_env(name: str) -> str:
    value = (os.environ.get(name, "") or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def _resolve_live_secret_key() -> str:
    preferred = (os.environ.get("STRIPE_LIVE_SECRET_KEY", "") or "").strip()
    if preferred:
        return preferred
    return _require_env("STRIPE_SECRET_KEY")


def _as_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return dict(obj)


def _list_live_products(
    live_client: stripe.StripeClient,
    product_ids: list[str],
    include_inactive: bool,
) -> list[dict[str, Any]]:
    if product_ids:
        products: list[dict[str, Any]] = []
        for product_id in product_ids:
            product = live_client.products.retrieve(product_id)
            products.append(_as_dict(product))
        return products

    products: list[dict[str, Any]] = []
    params: dict[str, Any] = {"limit": 100}
    if not include_inactive:
        params["active"] = True

    for product in live_client.products.list(params=params).auto_paging_iter():
        products.append(_as_dict(product))
    return products


def _build_test_product_index(test_client: stripe.StripeClient) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for product in test_client.products.list(params={"limit": 100}).auto_paging_iter():
        product_obj = _as_dict(product)
        metadata = product_obj.get("metadata") or {}
        source_product_id = str(metadata.get(SOURCE_PRODUCT_METADATA_KEY) or "").strip()
        if source_product_id:
            index[source_product_id] = product_obj
    return index


def _build_test_price_index(test_client: stripe.StripeClient) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for price in test_client.prices.list(params={"limit": 100}).auto_paging_iter():
        price_obj = _as_dict(price)
        metadata = price_obj.get("metadata") or {}
        source_price_id = str(metadata.get(SOURCE_PRICE_METADATA_KEY) or "").strip()
        if source_price_id:
            index[source_price_id] = price_obj
    return index


def _copy_product(
    live_product: dict[str, Any],
    existing_test_product: dict[str, Any] | None,
    test_client: stripe.StripeClient,
    apply: bool,
    stats: CopyStats,
) -> tuple[str, bool]:
    live_product_id = str(live_product.get("id"))
    metadata = dict(live_product.get("metadata") or {})
    metadata[SOURCE_PRODUCT_METADATA_KEY] = live_product_id

    create_or_update_payload: dict[str, Any] = {
        "name": live_product.get("name"),
        "description": live_product.get("description"),
        "active": bool(live_product.get("active", True)),
        "metadata": metadata,
        "images": list(live_product.get("images") or []),
    }

    if live_product.get("statement_descriptor"):
        create_or_update_payload["statement_descriptor"] = live_product.get("statement_descriptor")
    if live_product.get("tax_code"):
        create_or_update_payload["tax_code"] = live_product.get("tax_code")
    if live_product.get("unit_label"):
        create_or_update_payload["unit_label"] = live_product.get("unit_label")
    if live_product.get("url"):
        create_or_update_payload["url"] = live_product.get("url")

    if existing_test_product:
        test_product_id = str(existing_test_product.get("id"))
        if apply:
            test_client.products.update(test_product_id, params=create_or_update_payload)
        stats.products_updated += 1
        return test_product_id, False

    if not apply:
        stats.products_created += 1
        return f"dryrun_{live_product_id}", True

    created = test_client.products.create(params=create_or_update_payload)
    created_obj = _as_dict(created)
    stats.products_created += 1
    return str(created_obj.get("id")), True


def _list_live_prices(
    live_client: stripe.StripeClient,
    live_product_id: str,
    include_inactive_prices: bool,
) -> list[dict[str, Any]]:
    prices: list[dict[str, Any]] = []

    for price in live_client.prices.list(
        params={"product": live_product_id, "active": True, "limit": 100}
    ).auto_paging_iter():
        prices.append(_as_dict(price))

    if include_inactive_prices:
        for price in live_client.prices.list(
            params={"product": live_product_id, "active": False, "limit": 100}
        ).auto_paging_iter():
            prices.append(_as_dict(price))

    return prices


def _build_price_create_payload(
    live_price: dict[str, Any],
    test_product_id: str,
) -> dict[str, Any] | None:
    if str(live_price.get("type") or "") == "custom_unit_amount":
        return None

    payload: dict[str, Any] = {
        "product": test_product_id,
        "currency": str(live_price.get("currency") or "").lower(),
        "active": bool(live_price.get("active", True)),
        "metadata": {
            **dict(live_price.get("metadata") or {}),
            SOURCE_PRICE_METADATA_KEY: str(live_price.get("id")),
        },
    }

    nickname = live_price.get("nickname")
    if nickname:
        payload["nickname"] = nickname

    tax_behavior = live_price.get("tax_behavior")
    if tax_behavior and tax_behavior != "unspecified":
        payload["tax_behavior"] = tax_behavior

    billing_scheme = str(live_price.get("billing_scheme") or "per_unit")
    payload["billing_scheme"] = billing_scheme

    if billing_scheme != "per_unit":
        return None

    if live_price.get("unit_amount") is not None:
        payload["unit_amount"] = int(live_price["unit_amount"])
    elif live_price.get("unit_amount_decimal") is not None:
        payload["unit_amount_decimal"] = str(live_price["unit_amount_decimal"])
    else:
        return None

    recurring = live_price.get("recurring")
    if isinstance(recurring, dict):
        recurring_payload: dict[str, Any] = {
            "interval": recurring.get("interval"),
            "interval_count": int(recurring.get("interval_count") or 1),
        }
        if recurring.get("usage_type"):
            recurring_payload["usage_type"] = recurring.get("usage_type")
        if recurring.get("trial_period_days") is not None:
            recurring_payload["trial_period_days"] = int(recurring.get("trial_period_days"))
        payload["recurring"] = recurring_payload

    transform_quantity = live_price.get("transform_quantity")
    if isinstance(transform_quantity, dict):
        payload["transform_quantity"] = {
            "divide_by": int(transform_quantity.get("divide_by") or 1),
            "round": transform_quantity.get("round") or "up",
        }

    return payload


def main() -> None:
    args = _parse_args()
    live_key = _resolve_live_secret_key()
    test_key = _require_env("STRIPE_TEST_SECRET_KEY")

    live_client = stripe.StripeClient(live_key)
    test_client = stripe.StripeClient(test_key)

    stats = CopyStats()

    live_products = _list_live_products(
        live_client=live_client,
        product_ids=[p.strip() for p in args.product_id if p.strip()],
        include_inactive=args.include_inactive_products,
    )

    if not live_products:
        print("No live products found to copy.")
        return

    test_product_index = _build_test_product_index(test_client)
    test_price_index = _build_test_price_index(test_client)

    mapping: dict[str, Any] = {
        "mode": "apply" if args.apply else "dry-run",
        "liveProductCount": len(live_products),
        "products": [],
    }

    for live_product in live_products:
        live_product_id = str(live_product.get("id"))
        existing_test_product = test_product_index.get(live_product_id)

        test_product_id, created = _copy_product(
            live_product=live_product,
            existing_test_product=existing_test_product,
            test_client=test_client,
            apply=args.apply,
            stats=stats,
        )

        if created and not args.apply:
            test_product_index[live_product_id] = {"id": test_product_id, "metadata": {SOURCE_PRODUCT_METADATA_KEY: live_product_id}}

        live_prices = _list_live_prices(
            live_client=live_client,
            live_product_id=live_product_id,
            include_inactive_prices=args.include_inactive_prices,
        )

        product_map: dict[str, Any] = {
            "liveProductId": live_product_id,
            "liveProductName": live_product.get("name"),
            "testProductId": test_product_id,
            "prices": [],
        }

        if not live_prices:
            stats.products_skipped += 1
            mapping["products"].append(product_map)
            continue

        for live_price in live_prices:
            live_price_id = str(live_price.get("id"))
            existing_test_price = test_price_index.get(live_price_id)

            if existing_test_price:
                stats.prices_skipped += 1
                product_map["prices"].append(
                    {
                        "livePriceId": live_price_id,
                        "testPriceId": str(existing_test_price.get("id")),
                        "status": "skipped_existing",
                    }
                )
                continue

            payload = _build_price_create_payload(live_price=live_price, test_product_id=test_product_id)
            if payload is None:
                stats.prices_unsupported += 1
                product_map["prices"].append(
                    {
                        "livePriceId": live_price_id,
                        "status": "unsupported",
                    }
                )
                continue

            if not args.apply:
                stats.prices_created += 1
                product_map["prices"].append(
                    {
                        "livePriceId": live_price_id,
                        "testPriceId": f"dryrun_{live_price_id}",
                        "status": "would_create",
                    }
                )
                continue

            created_price = test_client.prices.create(params=payload)
            created_price_obj = _as_dict(created_price)
            created_test_price_id = str(created_price_obj.get("id"))
            test_price_index[live_price_id] = created_price_obj
            stats.prices_created += 1
            product_map["prices"].append(
                {
                    "livePriceId": live_price_id,
                    "testPriceId": created_test_price_id,
                    "status": "created",
                }
            )

        mapping["products"].append(product_map)

    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")

    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"Products created: {stats.products_created}")
    print(f"Products updated: {stats.products_updated}")
    print(f"Products skipped: {stats.products_skipped}")
    print(f"Prices created: {stats.prices_created}")
    print(f"Prices skipped (existing): {stats.prices_skipped}")
    print(f"Prices unsupported: {stats.prices_unsupported}")
    print(f"Mapping written to: {output_path}")


if __name__ == "__main__":
    main()
