# moovit-co — mover booking template

No-scroll, step-by-step booking web app for a moving company. One page at a
time; answers drive the next page.

- **Customers:** move details → instant estimate → lock-in → contact →
  payment (test mode) → confirmation. Quote-only path saves the lead.
- **Movers:** application flow → roster welcome with claimable sample jobs.

## Deploy (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
2. Select this repo. Framework preset: **None**. Build command: *(empty)*.
   Output directory: `/`
3. Deploy. Every push to `main` redeploys automatically.

## Data (Supabase)

- Project: `moovit-co`
- Tables: `bookings`, `mover_applications` (SQL in project history)
- Row Level Security: anonymous visitors can INSERT only; reads happen in
  the Supabase dashboard Table Editor.
- Wiring lives in `CONFIG.supabase` at the top of the inline script in
  `index.html`. Set `enabled: false` to run fully offline.
- Payment step is a test-mode stub — wire a real Stripe publishable key +
  PaymentIntent in `CONFIG.payments` before accepting live payments.

## Branding slots

- `--brand` CSS variable (accent color)
- `<!--BRAND:LOGO-->` comments (header + loader marks)
- `CONFIG.brand` (name, tagline)
