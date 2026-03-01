# Director of Studies — Pre-Launch TODO

This file tracks everything that must be done before accepting user sign-ups and taking payment.
Each item includes implementation notes written for an AI coding agent.

---

## 1. Billing & Payments ❌ (nothing exists)

### 1.1 Add Stripe integration to the web app
- Install `stripe` and `@stripe/stripe-js` in `apps/web`
- Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- Create a FastAPI endpoint `POST /billing/create-checkout-session` in `apps/agent/app/main.py` (or a dedicated `billing.py` module) using the Stripe Python SDK
- Create a FastAPI endpoint `POST /billing/webhook` to handle `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted` etc.
- Protect the webhook endpoint with Stripe signature verification (`stripe.Webhook.construct_event`)

### 1.2 Add subscription/billing tables to the DB schema
- In `apps/web/src/db/schema.ts` add tables:
  - `billing_customers` — `(id, profileId FK, stripeCustomerId, createdAt)`
  - `subscriptions` — `(id, profileId FK, stripeSubscriptionId, stripePriceId, status, currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt)`
  - `plans` — `(id, name, stripePriceId, monthlyMinutes, price)` (seed with free/pro tiers)
- Run `npm run db:push` in `apps/web` after schema changes, or ideally switch to versioned migrations first (see item 4.1)
- Mirror these tables in `apps/agent/scripts/bootstrap_db.py` (raw SQL CREATE TABLE IF NOT EXISTS block)

### 1.3 Add usage tracking
- In `apps/agent/app/main.py`, record session duration (minutes) to a `session_usage` column on the `sessions` table, or log to a separate `usage_events` table
- Add a Python helper `check_subscription_quota(student_id)` that reads the student's active subscription plan minute allowance and compares to their usage in the current billing period
- Call the quota check at session create time — return HTTP 402 if over limit
- Schema: add `durationSeconds integer` to the `sessions` table and populate it at session end inside the existing `POST /api/session/end` handler in `apps/agent/app/main.py`

### 1.4 Add a billing/subscription page in the web UI
- Create `apps/web/src/app/settings/billing/page.tsx`
- Fetch the student's current plan from `GET /billing/subscription` (add this Python endpoint)
- Render current plan, next billing date, and a "Manage subscription" link (Stripe Customer Portal)
- Add `POST /billing/portal-session` FastAPI endpoint to create a Stripe Customer Portal session and return its URL
- Add "Billing" to the `AccountMenu` dropdown in `apps/web/src/components/AccountMenu.tsx` (link to `/settings/billing`)

### 1.5 Implement a paywall / free tier
- Decide on the free tier limit and encode it in the `plans` seed data
- The quota check (1.3) should enforce this; sessions beyond the limit require an active paid subscription
- Add a UI component that shows a paywall modal when the student is over quota, with a CTA to the billing page

- In terms of plans: have 1 hour free lesson per account - they can use this straight away after signing up without putting a card down. Have the standard subscription be monthly gbp50 for 8 hours a month (2 tutorials a week)
- if the student signs up with their school email (check against list) then offer gbp50 for 10 hours a month (2 hours free, 25% more)
- Also offer a year-long subscription that offers two months free so gbp500/year for the same 8 hours a month (or 10 hours a month if a student).
- Present these prices as price-per-hour of tutoring in all these options 
- Add an option to refer a parent/student and get 5 hours free each (for referer and referee) once the referee buys some subscription
- Also offer packages of pay-by-hour (1hr for gbp10.0, 2hrs for gbp 15.0, 10hrs for gbp 70.0)

---

## 2. Auth Gaps ❌

### 2.1 Password reset flow
- Create `apps/web/src/app/auth/forgot-password/page.tsx`
  - Form: email input + submit button
  - On submit: call `supabase.auth.resetPasswordForEmail(email, { redirectTo: '<APP_URL>/auth/reset-password' })`
  - Show a "Check your email" confirmation message
- Create `apps/web/src/app/auth/reset-password/page.tsx`
  - Reads the `access_token` / `refresh_token` from the URL hash (Supabase magic link)
  - Form: new password + confirm password
  - On submit: call `supabase.auth.updateUser({ password })`
  - Redirect to `/dashboard` on success
- Add "Forgot your password?" link on the login form in `apps/web/src/components/AuthForm.tsx`
- Add both routes to the public paths in `apps/web/src/middleware.ts`

### 2.2 Email confirmation UX
- After sign-up via `supabase.auth.signUp`, check if `data.session` is null — this means email confirmation is pending
- If pending: redirect to a new `apps/web/src/app/auth/confirm-email/page.tsx` that shows "check your inbox" messaging and a "resend confirmation email" button
- "Resend" button calls `supabase.auth.resend({ type: 'signup', email })`
- Add `/auth/confirm-email` to public paths in middleware

### 2.3 Terms of service acceptance
- Add `termsAcceptedAt timestamp` column to the `profiles` table in `apps/web/src/db/schema.ts` and `apps/agent/scripts/bootstrap_db.py`
- Add a required ToS checkbox to the sign-up form in `apps/web/src/components/AuthForm.tsx`
- On sign-up success, call `PATCH /profile/terms-accept` (add this Python endpoint) which sets `terms_accepted_at = NOW()`
- Gate session creation: if `terms_accepted_at` is null, return HTTP 403 with a message prompting acceptance

---

## 3. Legal & Safeguarding ❌ (critical — UK GCSE/A-level product with minors)

### 3.1 Terms of Service and Privacy Policy pages
- Create `apps/web/src/app/terms/page.tsx` — static page with Terms of Service text
- Create `apps/web/src/app/privacy/page.tsx` — static page with Privacy Policy text
- Add both to public paths in `apps/web/src/middleware.ts`
- Add links to both pages in the footer of `apps/web/src/app/layout.tsx`

### 3.2 Parental consent gate for minors
- During student onboarding (`apps/web/src/app/onboarding/page.tsx`), calculate age from `date_of_birth`
- If the student is under 16: block progression and show a message requiring a parent/guardian to create a parent account and link the student before the student account is activated
- Add `consentGrantedAt timestamp` and `consentGrantedByParentId uuid FK→parents` columns to the `students` table
- A parent linking a student (via invite code) should set `consent_granted_at = NOW()` and record the parent id
- Python endpoint: `GET /student/consent-status` returns whether the student has been consented by a parent
- Web: check consent status after onboarding and block dashboard access with a clear explanation if consent is pending

### 3.3 Account deletion (GDPR right to erasure)
- Add `deletedAt timestamp` (soft delete) columns to `profiles`, `students`, and `parents` tables
- Create `DELETE /profile` Python endpoint that sets `deleted_at = NOW()` on the profile (and cascades to child entities)
- Create `apps/web/src/app/settings/profile/delete/page.tsx` with a confirmation dialog and "Delete my account" button
- This page should call the delete endpoint then sign the user out via `supabase.auth.signOut()` and redirect to `/`
- Add "Delete account" link in `apps/web/src/app/settings/profile/page.tsx`
- Update all DB queries that read user data to add `WHERE deleted_at IS NULL`

### 3.4 Cookie notice
- Add a cookie consent banner component `apps/web/src/components/CookieBanner.tsx` that persists acceptance in `localStorage`
- Render it in `apps/web/src/app/layout.tsx` (client side, lazy)

---

## 4. Database & Migrations ❌

### 4.1 Switch from `drizzle push` to versioned migrations and remove any mention of drizzle since it's outdated
- In `apps/web/drizzle.config.ts`, the current setup uses `drizzle-kit push` which is destructive and not safe for production
- Switch to versioned migration files: run `npx drizzle-kit generate` to snapshot the current schema as migration `0001_initial.sql` in `apps/web/drizzle/`
- Update `apps/web/package.json` scripts: replace `db:push` with `db:generate` (create migration files) and `db:migrate` (apply them via `drizzle-kit migrate`)
- Update `apps/web/drizzle.config.ts` if needed to point `out` directory at `./drizzle`
- Update `Makefile` `db-migrate` target to run the new migration command
- Update `README.md` to document the new workflow

---

## 5. Production Infrastructure ❌

### 5.1 SSL/TLS termination
- Add a reverse proxy (Caddy or nginx) in front of the web and agent services
- Caddy is simplest: add a `Caddyfile` at repo root and a `caddy` service in `infra/docker-compose.yml`
- Route `yourdomain.com` → Next.js (port 3000), `api.yourdomain.com` → FastAPI (port 8000), `lk.yourdomain.com` → LiveKit (port 7880)
- For local TLS use `caddy run --config Caddyfile` with a self-signed cert; for production use `tls { on_demand }` with a Let's Encrypt email

### 5.2 Pin the LiveKit Docker image
- In `infra/docker-compose.yml`, change `livekit/livekit-server:latest` to a pinned version (e.g. `livekit/livekit-server:v1.7.2`)
- Check the latest stable tag at https://github.com/livekit/livekit/releases

### 5.3 Observability
- Add Sentry to the Next.js app: `npm install @sentry/nextjs` in `apps/web`, run `npx @sentry/wizard@latest -i nextjs`, add `SENTRY_DSN` to `.env.example`
- Add Sentry to the Python agent: `pip install sentry-sdk[fastapi]` in `apps/agent`, call `sentry_sdk.init(dsn=..., integrations=[FastApiIntegration()])` at the top of `apps/agent/app/main.py`
- Add structured JSON logging to the Python agent using Python's `logging` module with a JSON formatter (e.g. `python-json-logger`)

### 5.4 CI/CD pipeline
- Create `.github/workflows/ci.yml` that runs on PRs:
  - Python: `cd apps/agent && pip install -e ".[dev]" && pytest`
  - TypeScript: `cd apps/web && npm ci && npm run build && npm run lint`
- Create `.github/workflows/deploy.yml` that triggers on push to `main` and deploys to the production host

### 5.5 DB backups
- The current Postgres runs in a Docker named volume with no snapshot strategy
- For production: use a managed Postgres (e.g. Neon, Supabase Postgres, RDS) instead of the containerised instance
- If self-hosting, add a `pg_dump` cron job and ship dumps to S3/R2

### 5.6 Close the exposed Postgres port
- `infra/docker-compose.yml` exposes `5432:5432` externally — fine for local dev, must be removed for production
- Remove the `ports:` entry from the `db` service in the production compose file, or use a separate `docker-compose.prod.yml` override that omits it

---

## 6. Error Pages ❌

### 6.1 Custom 404 and 500 pages
- Create `apps/web/src/app/not-found.tsx` — simple "Page not found" UI with a link back to `/dashboard`
- Create `apps/web/src/app/error.tsx` — Next.js error boundary for unhandled runtime errors; log to Sentry
- Create `apps/web/src/app/global-error.tsx` — catches errors in the root layout

---

## 7. Calendar Sync Stubs ❌ (post-MVP)

### 7.1 Google Calendar sync
- `apps/web/src/lib/calendar-sync.ts` has `GoogleCalendarSync` throwing `"not implemented yet"`
- Implementation requires: Google OAuth2 credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), OAuth flow to get a refresh token, and using the Google Calendar API to `POST /calendars/.../events`
- Store the refresh token in a `calendar_integrations` table (new) keyed by `student_id`

### 7.2 Apple/CalDAV calendar sync
- Similar approach to Google, but using the CalDAV protocol (`tsdav` npm package)

---

## 8. Admin Tooling ❌ (pre-launch nice-to-have)

### 8.1 Admin dashboard
- No route or UI exists for inspecting users, content, or sessions without direct DB access
- Minimum viable admin: a protected `/admin` Next.js page (gated by a hardcoded admin email list) that shows:
  - Total users (students/parents) counts
  - Sessions in the last 24h/7d
  - Failed sessions (no transcript generated)
  - See number of subscribers and total hours they spent
- Gate with middleware checking `profile.account_type === 'admin'` (add admin type to the DB enum)

- Add a feedback button after each session and in general in the dashboard. Display these in the admin dashboard
- Also add a "suggest a course" feedback button in the course page

---

## Priority Order for Launch

| Priority | Item |
|---|---|
| 🔴 P0 | Billing: Stripe integration, subscription tables, usage quota |
| 🔴 P0 | Legal: ToS + Privacy Policy pages |
| 🔴 P0 | Legal: parental consent gate for under-16 students |
| 🔴 P0 | Auth: password reset flow |
| 🔴 P0 | GDPR: account deletion UI + soft-delete |
| 🟠 P1 | Auth: email confirmation UX + resend |
| 🟠 P1 | Auth: ToS acceptance checkbox on sign-up |
| 🟠 P1 | DB: switch to versioned migrations before any production deploy |
| 🟠 P1 | Infra: SSL/TLS termination |
| 🟠 P1 | Infra: pin LiveKit image |
| 🟡 P2 | Observability: Sentry + structured logging |
| 🟡 P2 | Infra: CI/CD pipeline |
| 🟡 P2 | Infra: Postgres managed service / backups |
| 🟡 P2 | Error pages (404, 500) |
| 🟡 P2 | Cookie consent banner |
| 🟢 P3 | Calendar sync (Google/Apple) |
| 🟢 P3 | Admin dashboard |
