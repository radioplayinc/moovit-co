# Moovit — booking template

No-scroll, one-screen-at-a-time booking web app for a moving company.
Single self-contained `index.html` (+ `logo.jpg`). No build step, no backend to run.

## Flows

- **I need stuff moved** — move type → size → ZIPs → date/time → stairs →
  packing → heavy items → animated estimate → lock-in vs. quote-only →
  contact (name, email, phone) → test checkout → confirmation.
- **I move stuff** — contact → vehicle → lifting → gear → coverage ZIP →
  availability → license → payout preference → review → sample job roster.

## Data

Completed bookings and mover applications save to Supabase
(`bookings` / `mover_applications`, anonymous INSERT-only; reads stay
private in the Supabase Table Editor):

- Paid/test booking → `bookings.status = 'confirmed'`
- Quote-only path → `bookings.status = 'quote'`
- Mover application → `mover_applications.status = 'pending'`

If you add the `email` columns, run in the Supabase SQL editor. Note the
column names must match what the code actually POSTs: bookings uses
`customer_email`, mover_applications uses `email`.

```sql
alter table bookings add column if not exists customer_email text;
alter table mover_applications add column if not exists email text;
```

## Branding slots

- `logo.jpg` — real client logo (now live on the loading screen).
- CSS variables `--brand` / `--brand-ink` — accent color.
- `<title>` — currently "Moovit — Book movers in minutes".

## Payments

No card is collected on the site. After booking, the customer is told
their invoice will arrive by email or text message. Taking payment online
later would require Stripe's publishable key plus a server-created
PaymentIntent — never put a Stripe secret key in the browser.

## Distance & summary

- **Miles:** the estimate screen computes driving miles between the two
  ZIPs (zippopotam.us → OSRM, no keys) and shows "≈ N miles driving".
  Miles flow into the booking record, the broker email, and the sheet.
- **Move summary:** the confirmation screen's download button generates a
  branded PNG (logo, booking ref, all details, estimate) via canvas —
  no dependencies.

## Booking alerts

Paid bookings trigger `POST /api/notify-booking` (Cloudflare Pages Function
in `functions/`). Quote-only and abandoned leads do not alert.

- **Push (self-owned, no vendors):** Web Push via VAPID + `sw.js`. The
  broker opens `https://moovit-co.pages.dev/?alerts` and taps "Enable
  alerts" (iPhone: add the page to the Home Screen first, then open it
  from there). Subscriptions save to the `push_subscriptions` table.
  Needs Pages env vars: `VAPID_PRIVATE_KEY` (JWK JSON), `VAPID_SUBJECT`
  (e.g. `mailto:you@domain`), `SUPABASE_SERVICE_KEY`. Table SQL:
  ```sql
  create table if not exists push_subscriptions (
    endpoint text primary key,
    keys jsonb not null,
    created_at timestamptz default now()
  );
  alter table push_subscriptions enable row level security;
  drop policy if exists "anon insert" on push_subscriptions;
  create policy "anon insert" on push_subscriptions
    for insert to anon with check (true);
  ```
- **Email (optional):** `RESEND_API_KEY` + `ALERT_EMAIL` (`ALERT_FROM`
  optional) — full details via Resend, free tier.
- **SMS (optional):** `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`,
  `NOTIFY_TO` — texts the booking via Twilio.
- **Google Sheets CRM + Gmail email (optional):** paste
  `apps-script-crm.js` into the sheet's Extensions → Apps Script, set
  `BROKER_EMAIL` + `SHARED_SECRET`, deploy as a web app (Execute as: Me,
  Who has access: Anyone). Add Pages env vars `SHEETS_WEBAPP_URL` (the
  web app URL) and `SHEETS_SECRET` (same secret). Every paid booking then
  appends a row and emails the full details from the broker's Gmail.

Redeploy after adding env vars so they take effect.

## SEO pack (free search + AI visibility)

Ships in this template since 2026-10-27. Spec: `~/workspace/custom-skills/bookit-site/references/SEO_PACK.md`.

- `index.html` head: title, meta description, canonical, OG/Twitter, JSON-LD `@graph` (`MovingCompany` + `FAQPage`, 7 Q&As), plus a `<noscript>` plain-text summary. The no-scroll booking flow is untouched — no visible footer was added to the booking page.
- `faq.html`: a normal scrolling page in the same design system with the same 7 FAQs in visible HTML — the page Google indexes and AI tools quote.
- `sitemap.xml`, `robots.txt`, `llms.txt` at the root.
- Reskin swaps: `SITE_URL` everywhere, business name, phone, narrowed `SERVICE_AREA`, schema type per vertical, FAQ answers rewritten for the trade and identical in all three copies. Never invent an area, rate, social, or review.
- After deploy (free): submit the sitemap in Google Search Console + Bing Webmaster Tools, and set up a Google Business Profile with the same name/phone/area as the JSON-LD.

## Deploy

Push to `main` — Cloudflare Pages auto-deploys (functions included).
