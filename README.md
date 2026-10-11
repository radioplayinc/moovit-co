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

**TEST MODE.** The checkout collects card details into a demo confirmation
and stores only the last four digits. Going live requires Stripe's
publishable key plus a server-created PaymentIntent — never put a Stripe
secret key in the browser.

## Deploy

Push to `main` — Cloudflare Pages auto-deploys.
