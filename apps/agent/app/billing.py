from __future__ import annotations

import csv
import datetime
import json
import os
import random
import string
from functools import lru_cache
from pathlib import Path
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

import stripe
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from .db import get_conn

router = APIRouter(prefix="/billing", tags=["billing"])

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
AGENT_INTERNAL_API_KEY = os.environ.get("AGENT_INTERNAL_API_KEY", "")
SCHOOL_DOMAINS_CSV_PATH = os.environ.get("SCHOOL_DOMAINS_CSV_PATH", "")

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

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _resolve_school_domains_csv_path() -> Path:
    if SCHOOL_DOMAINS_CSV_PATH.strip():
        return Path(SCHOOL_DOMAINS_CSV_PATH).expanduser()
    return Path(__file__).resolve().parents[3] / "content" / "schools_domain.csv"


@lru_cache(maxsize=1)
def _load_school_domains_from_csv() -> frozenset[str]:
    csv_path = _resolve_school_domains_csv_path()
    if not csv_path.exists() or not csv_path.is_file():
        return frozenset()

    domains: set[str] = set()
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            domain = str((row or {}).get("domain") or "").strip().lower().lstrip("@")
            if domain:
                domains.add(domain)
    return frozenset(domains)


def _domain_in_school_csv(domain: str) -> bool:
    school_domains = _load_school_domains_from_csv()
    if not school_domains:
        return False
    if domain in school_domains:
        return True
    return any(domain.endswith(f".{allowed}") for allowed in school_domains)


class CheckoutSessionRequest(BaseModel):
    planId: int
    successUrl: str
    cancelUrl: str


class PortalSessionRequest(BaseModel):
    returnUrl: str | None = None


class ApplyReferralRequest(BaseModel):
    referralCode: str


class CustomReferralCodeRequest(BaseModel):
    customCode: str


@dataclass
class QuotaResult:
    allowed: bool
    reason: str | None
    remaining_minutes: int
    free_minutes_remaining: int
    subscription_minutes_remaining: int
    credits_minutes_remaining: int
    billing_profile_id: str | None = None


def _get_user_id_from_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Supabase auth config missing")

    token = authorization.replace("Bearer ", "", 1).strip()
    req = urllib_request.Request(
        f"{SUPABASE_URL}/auth/v1/user",
        method="GET",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
            user_id = payload.get("id")
            if not user_id:
                raise HTTPException(status_code=401, detail="Unauthorized")
            return str(user_id)
    except urllib_error.HTTPError as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc


def _require_stripe() -> None:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")


def _require_internal_api_key(x_internal_api_key: str | None) -> None:
    if not AGENT_INTERNAL_API_KEY:
        raise HTTPException(status_code=500, detail="AGENT_INTERNAL_API_KEY is not configured")
    if x_internal_api_key != AGENT_INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal API key")


def _sync_plan_price_ids_from_env() -> list[str]:
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

    updated_plan_names: list[str] = []
    with get_conn() as conn, conn.cursor() as cur:
        for plan_name in PLAN_PRODUCT_ENV_MAP:
            resolved_price_id = _resolve_price_id_for_plan(plan_name)
            if not resolved_price_id:
                continue
            cur.execute(
                """
                UPDATE plans
                SET stripe_price_id = %s
                WHERE name = %s
                  AND stripe_price_id IS DISTINCT FROM %s
                """,
                (resolved_price_id, plan_name, resolved_price_id),
            )
            if cur.rowcount > 0:
                updated_plan_names.append(plan_name)
        conn.commit()
    return updated_plan_names


def _pence_to_gbp_string(price_pence: int) -> str:
    value = Decimal(price_pence) / Decimal(100)
    return f"{value:.2f}"


def _price_per_hour(price_pence: int, minutes: int | None) -> str | None:
    if not minutes or minutes <= 0:
        return None
    hourly = (Decimal(price_pence) / Decimal(100)) / (Decimal(minutes) / Decimal(60))
    return f"{hourly:.2f}"


def _minutes_used_for_students(
    student_ids: list[str],
    period_start: datetime.datetime | None = None,
    period_end: datetime.datetime | None = None,
) -> int:
    if not student_ids:
        return 0

    query = """
        SELECT COALESCE(SUM(COALESCE(duration_seconds, 0)), 0)
        FROM sessions
        WHERE student_id = ANY(%s)
    """
    args: list[Any] = [student_ids]

    if period_start is not None:
        query += " AND started_at >= %s"
        args.append(period_start)
    if period_end is not None:
        query += " AND started_at < %s"
        args.append(period_end)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(query, tuple(args))
        row = cur.fetchone()

    seconds = int(row[0] or 0)
    return max(0, seconds // 60)


def _profile_student_ids(profile_id: str) -> list[str]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT account_type FROM profiles WHERE id = %s",
            (profile_id,),
        )
        account_row = cur.fetchone()

        if not account_row:
            return []

        account_type = str(account_row[0])
        if account_type == "student":
            cur.execute("SELECT id FROM students WHERE id = %s", (profile_id,))
            student_row = cur.fetchone()
            return [str(student_row[0])] if student_row else []

        cur.execute(
            "SELECT student_id FROM parent_student_links WHERE parent_id = %s",
            (profile_id,),
        )
        return [str(row[0]) for row in cur.fetchall()]


def _parent_profile_ids_for_student(student_id: str) -> list[str]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT parent_id FROM parent_student_links WHERE student_id = %s",
            (student_id,),
        )
        return [str(row[0]) for row in cur.fetchall()]


def is_school_email(email: str) -> bool:
    value = (email or "").strip().lower()
    if "@" not in value:
        return False

    domain = value.split("@", 1)[1].strip().lstrip("@")
    if not domain:
        return False

    if _domain_in_school_csv(domain):
        return True

    if domain.endswith(".sch.uk") or domain.endswith(".school.uk"):
        return True

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM school_email_domains WHERE domain = %s LIMIT 1", (domain,))
        return cur.fetchone() is not None


def _get_or_create_billing_customer(profile_id: str) -> str:
    _require_stripe()

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT stripe_customer_id FROM billing_customers WHERE profile_id = %s",
            (profile_id,),
        )
        row = cur.fetchone()
        if row:
            return str(row[0])

        cur.execute("SELECT email FROM profiles WHERE id = %s", (profile_id,))
        profile_row = cur.fetchone()
        if not profile_row:
            raise HTTPException(status_code=404, detail="Profile not found")
        email = str(profile_row[0])

    customer = stripe.Customer.create(
        email=email,
        metadata={"profileId": profile_id},
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO billing_customers (profile_id, stripe_customer_id)
            VALUES (%s, %s)
            ON CONFLICT (profile_id)
            DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id
            """,
            (profile_id, customer["id"]),
        )
        conn.commit()

    return str(customer["id"])


def _active_subscription_for_profile(profile_id: str) -> tuple[Any, ...] | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.id, s.plan_id, s.status, s.current_period_start, s.current_period_end, p.monthly_minutes
            FROM subscriptions s
            LEFT JOIN plans p ON p.id = s.plan_id
            WHERE s.profile_id = %s
              AND s.status IN ('active','trialing','past_due')
            ORDER BY s.updated_at DESC
            LIMIT 1
            """,
            (profile_id,),
        )
        return cur.fetchone()


def _credits_remaining_for_profile(profile_id: str) -> int:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(minutes_remaining), 0)
            FROM usage_credits
            WHERE profile_id = %s
              AND minutes_remaining > 0
              AND (expires_at IS NULL OR expires_at > NOW())
            """,
            (profile_id,),
        )
        row = cur.fetchone()
    return int(row[0] or 0)


def _consume_credits(profile_id: str, minutes_to_consume: int) -> None:
    if minutes_to_consume <= 0:
        return

    remaining = minutes_to_consume
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, minutes_remaining
            FROM usage_credits
            WHERE profile_id = %s
              AND minutes_remaining > 0
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at ASC
            """,
            (profile_id,),
        )
        rows = cur.fetchall()

        for row in rows:
            credit_id = int(row[0])
            available = int(row[1])
            if remaining <= 0:
                break
            deduction = min(remaining, available)
            cur.execute(
                """
                UPDATE usage_credits
                SET minutes_remaining = minutes_remaining - %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (deduction, credit_id),
            )
            remaining -= deduction

        conn.commit()


def _quota_for_profile(profile_id: str, include_free_tier: bool) -> QuotaResult:
    student_ids = _profile_student_ids(profile_id)

    free_remaining = 0
    if include_free_tier:
        lifetime_used = _minutes_used_for_students(student_ids)
        free_remaining = max(0, 60 - lifetime_used)

    subscription_remaining = 0
    subscription_row = _active_subscription_for_profile(profile_id)
    if subscription_row:
        period_start = subscription_row[3]
        period_end = subscription_row[4]
        monthly_minutes = int(subscription_row[5] or 0)
        if monthly_minutes > 0:
            used_period = _minutes_used_for_students(student_ids, period_start, period_end)
            subscription_remaining = max(0, monthly_minutes - used_period)

    credits_remaining = _credits_remaining_for_profile(profile_id)
    remaining = free_remaining + subscription_remaining + credits_remaining
    if remaining > 0:
        return QuotaResult(
            True,
            None,
            remaining,
            free_remaining,
            subscription_remaining,
            credits_remaining,
            billing_profile_id=profile_id,
        )

    return QuotaResult(
        False,
        "quota_exceeded",
        0,
        free_remaining,
        subscription_remaining,
        credits_remaining,
        billing_profile_id=profile_id,
    )


def check_subscription_quota(student_id: str) -> QuotaResult:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM profiles WHERE id = %s",
            (student_id,),
        )
        profile_row = cur.fetchone()
        if not profile_row:
            return QuotaResult(False, "profile_not_found", 0, 0, 0, 0, billing_profile_id=None)

    student_profile_id = str(profile_row[0])
    candidate_profile_ids = [student_profile_id, *_parent_profile_ids_for_student(student_id)]

    candidates: list[QuotaResult] = []
    for profile_id in candidate_profile_ids:
        candidates.append(_quota_for_profile(profile_id, include_free_tier=(profile_id == student_profile_id)))

    allowed_candidates = [candidate for candidate in candidates if candidate.allowed]
    if allowed_candidates:
        return max(allowed_candidates, key=lambda candidate: candidate.remaining_minutes)

    if candidates:
        return max(candidates, key=lambda candidate: candidate.remaining_minutes)

    return QuotaResult(False, "quota_exceeded", 0, 0, 0, 0, billing_profile_id=None)


def consume_quota_minutes(student_id: str, minutes_consumed: int) -> None:
    if minutes_consumed <= 0:
        return

    candidate_profile_ids = [student_id, *_parent_profile_ids_for_student(student_id)]

    for profile_id in candidate_profile_ids:
        if _active_subscription_for_profile(profile_id):
            return

    best_credit_profile: str | None = None
    best_credit_minutes = 0
    for profile_id in candidate_profile_ids:
        remaining = _credits_remaining_for_profile(profile_id)
        if remaining > best_credit_minutes:
            best_credit_minutes = remaining
            best_credit_profile = profile_id

    if best_credit_profile and best_credit_minutes > 0:
        _consume_credits(best_credit_profile, minutes_consumed)


def _upsert_subscription_from_stripe(
    profile_id: str,
    stripe_subscription_id: str,
    stripe_price_id: str,
    status: str,
    current_period_start: datetime.datetime | None,
    current_period_end: datetime.datetime | None,
    cancel_at_period_end: bool,
) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM plans WHERE stripe_price_id = %s LIMIT 1", (stripe_price_id,))
        plan_row = cur.fetchone()
        plan_id = int(plan_row[0]) if plan_row else None

        cur.execute(
            """
            INSERT INTO subscriptions (
              profile_id,
              plan_id,
              stripe_subscription_id,
              stripe_price_id,
              status,
              current_period_start,
              current_period_end,
              cancel_at_period_end,
              created_at,
              updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (stripe_subscription_id)
            DO UPDATE SET
              plan_id = EXCLUDED.plan_id,
              stripe_price_id = EXCLUDED.stripe_price_id,
              status = EXCLUDED.status,
              current_period_start = EXCLUDED.current_period_start,
              current_period_end = EXCLUDED.current_period_end,
              cancel_at_period_end = EXCLUDED.cancel_at_period_end,
              updated_at = NOW()
            """,
            (
                profile_id,
                plan_id,
                stripe_subscription_id,
                stripe_price_id,
                status,
                current_period_start,
                current_period_end,
                cancel_at_period_end,
            ),
        )
        conn.commit()


def _add_credit(profile_id: str, source: str, minutes: int, metadata: dict[str, Any]) -> None:
    if minutes <= 0:
        return

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO usage_credits (profile_id, source, minutes_total, minutes_remaining, metadata)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            """,
            (profile_id, source, minutes, minutes, json.dumps(metadata)),
        )
        conn.commit()


def _generate_referral_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def _ensure_referral_code(profile_id: str) -> str:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT referral_code FROM referrals WHERE referrer_profile_id = %s ORDER BY created_at DESC LIMIT 1",
            (profile_id,),
        )
        row = cur.fetchone()
        if row:
            return str(row[0])

        for _ in range(5):
            code = _generate_referral_code()
            cur.execute("SELECT 1 FROM referrals WHERE referral_code = %s", (code,))
            if cur.fetchone() is None:
                cur.execute(
                    """
                    INSERT INTO referrals (referrer_profile_id, referral_code)
                    VALUES (%s, %s)
                    """,
                    (profile_id, code),
                )
                conn.commit()
                return code

    raise HTTPException(status_code=500, detail="Could not generate referral code")


def _apply_referral_reward_if_eligible(profile_id: str) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, referrer_profile_id, reward_granted_at
            FROM referrals
            WHERE referee_profile_id = %s
            LIMIT 1
            """,
            (profile_id,),
        )
        row = cur.fetchone()

        if not row:
            return

        referral_id = int(row[0])
        referrer_profile_id = str(row[1])
        reward_granted_at = row[2]

        if reward_granted_at is not None:
            return

    _add_credit(profile_id, "referral_bonus", 300, {"kind": "referee"})
    _add_credit(referrer_profile_id, "referral_bonus", 300, {"kind": "referrer", "refereeProfileId": profile_id})

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE referrals SET reward_granted_at = NOW() WHERE id = %s",
            (referral_id,),
        )
        conn.commit()


@router.get("/plans")
async def get_plans() -> dict[str, Any]:
    _sync_plan_price_ids_from_env()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, plan_type, stripe_price_id, monthly_minutes, credit_minutes,
                   price_pence, interval, is_school_plan
            FROM plans
            WHERE is_active = true
            ORDER BY price_pence ASC, id ASC
            """
        )
        rows = cur.fetchall()

    plans_payload = []
    for row in rows:
        minutes = int(row[4]) if row[4] is not None else int(row[5] or 0)
        plans_payload.append(
            {
                "id": int(row[0]),
                "name": str(row[1]),
                "planType": str(row[2]),
                "stripePriceId": str(row[3]) if row[3] else None,
                "monthlyMinutes": int(row[4]) if row[4] is not None else None,
                "creditMinutes": int(row[5]) if row[5] is not None else None,
                "pricePence": int(row[6]),
                "priceGbp": _pence_to_gbp_string(int(row[6])),
                "interval": str(row[7]) if row[7] else None,
                "isSchoolPlan": bool(row[8]),
                "pricePerHourGbp": _price_per_hour(int(row[6]), minutes),
            }
        )

    return {"plans": plans_payload}


@router.get("/subscription")
async def get_subscription(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    profile_id = _get_user_id_from_bearer(authorization)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT email FROM profiles WHERE id = %s", (profile_id,))
        profile_row = cur.fetchone()
        if not profile_row:
            raise HTTPException(status_code=404, detail="Profile not found")
        email = str(profile_row[0])

        cur.execute(
            """
            SELECT s.id, s.status, s.current_period_start, s.current_period_end, s.cancel_at_period_end,
                   p.id, p.name, p.monthly_minutes, p.price_pence, p.interval, p.is_school_plan
            FROM subscriptions s
            LEFT JOIN plans p ON p.id = s.plan_id
            WHERE s.profile_id = %s
            ORDER BY s.updated_at DESC
            LIMIT 1
            """,
            (profile_id,),
        )
        sub_row = cur.fetchone()

    student_ids = _profile_student_ids(profile_id)

    used_minutes = 0
    subscription_minutes = 0
    if sub_row and sub_row[2] and sub_row[3]:
        used_minutes = _minutes_used_for_students(student_ids, sub_row[2], sub_row[3])
        subscription_minutes = int(sub_row[7] or 0)

    credits_remaining = _credits_remaining_for_profile(profile_id)
    free_used_minutes = _minutes_used_for_students(student_ids)
    free_remaining = max(0, 60 - free_used_minutes)
    school_eligible = is_school_email(email)

    subscription_payload = None
    if sub_row:
        subscription_payload = {
            "id": int(sub_row[0]),
            "status": str(sub_row[1]),
            "currentPeriodStart": sub_row[2],
            "currentPeriodEnd": sub_row[3],
            "cancelAtPeriodEnd": bool(sub_row[4]),
            "plan": {
                "id": int(sub_row[5]) if sub_row[5] is not None else None,
                "name": str(sub_row[6]) if sub_row[6] is not None else None,
                "monthlyMinutes": int(sub_row[7]) if sub_row[7] is not None else None,
                "pricePence": int(sub_row[8]) if sub_row[8] is not None else None,
                "interval": str(sub_row[9]) if sub_row[9] is not None else None,
                "isSchoolPlan": bool(sub_row[10]) if sub_row[10] is not None else False,
            },
            "usedMinutesThisPeriod": used_minutes,
            "remainingMinutesThisPeriod": max(0, subscription_minutes - used_minutes),
        }

    return {
        "subscription": subscription_payload,
        "creditsRemainingMinutes": credits_remaining,
        "freeMinutesRemaining": free_remaining,
        "schoolEmailEligible": school_eligible,
    }


@router.post("/create-checkout-session")
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_stripe()
    _sync_plan_price_ids_from_env()
    profile_id = _get_user_id_from_bearer(authorization)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT email FROM profiles WHERE id = %s", (profile_id,))
        profile_row = cur.fetchone()
        if not profile_row:
            raise HTTPException(status_code=404, detail="Profile not found")
        email = str(profile_row[0])

        cur.execute(
            """
            SELECT id, name, plan_type, stripe_price_id, is_school_plan
            FROM plans
            WHERE id = %s AND is_active = true
            """,
            (payload.planId,),
        )
        plan_row = cur.fetchone()

    if not plan_row:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan_type = str(plan_row[2])
    stripe_price_id = str(plan_row[3]) if plan_row[3] else None
    is_school_plan = bool(plan_row[4])

    if is_school_plan and not is_school_email(email):
        raise HTTPException(status_code=403, detail="School email required for this plan")

    if not stripe_price_id:
        raise HTTPException(status_code=400, detail="Plan is not purchasable")

    customer_id = _get_or_create_billing_customer(profile_id)

    mode = "subscription" if plan_type == "subscription" else "payment"
    checkout_session = stripe.checkout.Session.create(
        mode=mode,
        customer=customer_id,
        line_items=[{"price": stripe_price_id, "quantity": 1}],
        success_url=payload.successUrl,
        cancel_url=payload.cancelUrl,
        metadata={
            "profileId": profile_id,
            "planId": str(payload.planId),
            "planType": plan_type,
            "isSchoolPlan": "true" if is_school_plan else "false",
        },
    )

    return {"checkoutUrl": checkout_session.get("url")}


@router.post("/sync-price-ids")
async def sync_price_ids(
    x_internal_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_internal_api_key(x_internal_api_key)
    updated = _sync_plan_price_ids_from_env()
    configured: dict[str, dict[str, bool]] = {}
    for plan_name in PLAN_PRODUCT_ENV_MAP:
        product_env_name = PLAN_PRODUCT_ENV_MAP[plan_name]
        configured[plan_name] = {
            "productEnvConfigured": bool((os.environ.get(product_env_name, "") or "").strip()),
        }
    return {
        "ok": True,
        "updatedPlans": updated,
        "configured": configured,
    }


@router.post("/portal-session")
async def create_portal_session(
    payload: PortalSessionRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    _require_stripe()
    profile_id = _get_user_id_from_bearer(authorization)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT stripe_customer_id FROM billing_customers WHERE profile_id = %s",
            (profile_id,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No billing customer found")

    customer_id = str(row[0])
    portal = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=payload.returnUrl or "http://localhost:3000/settings/billing",
    )
    return {"portalUrl": str(portal["url"])}


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict[str, bool]:
    _require_stripe()
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    if not signature or not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=400, detail="Missing webhook signature")

    try:
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc

    event_type = str(event.get("type"))
    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        mode = str(data_object.get("mode") or "")
        metadata = data_object.get("metadata") or {}
        profile_id = str(metadata.get("profileId") or "")
        plan_id = int(metadata.get("planId")) if metadata.get("planId") else None

        if profile_id and mode == "subscription":
            subscription_id = str(data_object.get("subscription") or "")
            if subscription_id:
                subscription = stripe.Subscription.retrieve(subscription_id)
                item = (subscription.get("items", {}).get("data") or [{}])[0]
                price_id = str(item.get("price", {}).get("id") or "")
                period_start = datetime.datetime.fromtimestamp(
                    int(subscription.get("current_period_start") or 0),
                    tz=datetime.timezone.utc,
                ) if subscription.get("current_period_start") else None
                period_end = datetime.datetime.fromtimestamp(
                    int(subscription.get("current_period_end") or 0),
                    tz=datetime.timezone.utc,
                ) if subscription.get("current_period_end") else None
                _upsert_subscription_from_stripe(
                    profile_id=profile_id,
                    stripe_subscription_id=subscription_id,
                    stripe_price_id=price_id,
                    status=str(subscription.get("status") or "active"),
                    current_period_start=period_start,
                    current_period_end=period_end,
                    cancel_at_period_end=bool(subscription.get("cancel_at_period_end") or False),
                )
                _apply_referral_reward_if_eligible(profile_id)

        if profile_id and mode == "payment" and plan_id is not None:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("SELECT credit_minutes FROM plans WHERE id = %s", (plan_id,))
                row = cur.fetchone()
            credit_minutes = int(row[0] or 0) if row else 0
            _add_credit(
                profile_id,
                "credit_pack",
                credit_minutes,
                {
                    "planId": plan_id,
                    "checkoutSessionId": data_object.get("id"),
                },
            )

    elif event_type in {"invoice.payment_failed", "invoice.payment_succeeded"}:
        subscription_id = str(data_object.get("subscription") or "")
        if subscription_id:
            status = "past_due" if event_type == "invoice.payment_failed" else "active"
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE subscriptions SET status = %s, updated_at = NOW() WHERE stripe_subscription_id = %s",
                    (status, subscription_id),
                )
                conn.commit()

    elif event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
        subscription_id = str(data_object.get("id") or "")
        if subscription_id:
            status = "canceled" if event_type == "customer.subscription.deleted" else str(data_object.get("status") or "inactive")
            price_id = ""
            item_rows = data_object.get("items", {}).get("data") or []
            if item_rows:
                price_id = str(item_rows[0].get("price", {}).get("id") or "")

            period_start = datetime.datetime.fromtimestamp(
                int(data_object.get("current_period_start") or 0),
                tz=datetime.timezone.utc,
            ) if data_object.get("current_period_start") else None
            period_end = datetime.datetime.fromtimestamp(
                int(data_object.get("current_period_end") or 0),
                tz=datetime.timezone.utc,
            ) if data_object.get("current_period_end") else None

            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT profile_id FROM subscriptions WHERE stripe_subscription_id = %s",
                    (subscription_id,),
                )
                row = cur.fetchone()
                if row:
                    profile_id = str(row[0])
                    _upsert_subscription_from_stripe(
                        profile_id=profile_id,
                        stripe_subscription_id=subscription_id,
                        stripe_price_id=price_id,
                        status=status,
                        current_period_start=period_start,
                        current_period_end=period_end,
                        cancel_at_period_end=bool(data_object.get("cancel_at_period_end") or False),
                    )

    return {"received": True}


@router.get("/referral-code")
async def get_referral_code(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    profile_id = _get_user_id_from_bearer(authorization)
    code = _ensure_referral_code(profile_id)
    custom = _get_custom_referral_code(profile_id)
    return {"referralCode": code, "customCode": custom}


def _get_custom_referral_code(profile_id: str) -> str | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT custom_code FROM referrals WHERE referrer_profile_id = %s AND custom_code IS NOT NULL ORDER BY created_at DESC LIMIT 1",
            (profile_id,),
        )
        row = cur.fetchone()
        return str(row[0]) if row else None


@router.put("/referral-code")
async def set_custom_referral_code(
    payload: CustomReferralCodeRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    import re

    profile_id = _get_user_id_from_bearer(authorization)
    code = payload.customCode.strip().upper()

    if not re.match(r'^[A-Z0-9]{4,20}$', code):
        raise HTTPException(status_code=400, detail="Code must be 4-20 alphanumeric characters")

    # Ensure referral row exists
    _ensure_referral_code(profile_id)

    with get_conn() as conn, conn.cursor() as cur:
        # Check uniqueness against both referral_code and custom_code
        cur.execute(
            "SELECT 1 FROM referrals WHERE (referral_code = %s OR custom_code = %s) AND referrer_profile_id != %s",
            (code, code, profile_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Code already in use")

        cur.execute(
            "UPDATE referrals SET custom_code = %s WHERE referrer_profile_id = %s",
            (code, profile_id),
        )
        conn.commit()

    return {"customCode": code}


@router.post("/apply-referral")
async def apply_referral(
    payload: ApplyReferralRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    profile_id = _get_user_id_from_bearer(authorization)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, referrer_profile_id, referee_profile_id FROM referrals WHERE referral_code = %s OR custom_code = %s",
            (payload.referralCode.strip().upper(), payload.referralCode.strip().upper()),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Referral code not found")

        referral_id = int(row[0])
        referrer_profile_id = str(row[1])
        existing_referee = str(row[2]) if row[2] else None

        if referrer_profile_id == profile_id:
            raise HTTPException(status_code=400, detail="You cannot apply your own referral code")
        if existing_referee and existing_referee != profile_id:
            raise HTTPException(status_code=400, detail="Referral code already used")

        cur.execute(
            "SELECT 1 FROM referrals WHERE referee_profile_id = %s",
            (profile_id,),
        )
        if cur.fetchone() and existing_referee != profile_id:
            raise HTTPException(status_code=400, detail="A referral has already been used on this profile")

        cur.execute(
            """
            UPDATE referrals
            SET referee_profile_id = %s,
                referral_accepted_at = COALESCE(referral_accepted_at, NOW())
            WHERE id = %s
            """,
            (profile_id, referral_id),
        )
        conn.commit()

    return {"ok": True}
