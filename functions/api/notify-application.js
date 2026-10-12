// POST /api/notify-application — forwards mover applications to the
// Google Sheets CRM ("Movers" tab) + broker email via Apps Script.
// Env vars: SHEETS_WEBAPP_URL, SHEETS_SECRET (same as notify-booking).
export async function onRequestPost(context) {
  const env = context.env || {};
  const json = (obj, status) =>
    new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  let b;
  try {
    b = await context.request.json();
  } catch (e) {
    return json({ ok: false, reason: 'bad-json' }, 400);
  }
  const results = {};
  if (env.SHEETS_WEBAPP_URL) {
    try {
      const res = await fetch(env.SHEETS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.SHEETS_SECRET || '',
          type: 'mover',
          mover: {
            name: b.name || '', phone: b.phone || '', email: b.email || '',
            vehicle: b.vehicle || '', lifting: b.lifting || '', gear: b.gear || '',
            zip: b.zip || '', radius: b.radius || '',
            availability: b.availability || '', license: b.license || '',
            payout: b.payout || '',
          },
        }),
      });
      let jr = {};
      try { jr = await res.json(); } catch (e) {}
      results.sheet = res.ok && jr.ok === true;
      if (jr.email) results.sheetEmail = true;
      if (jr.error) results.sheetError = jr.error;
    } catch (e) {
      results.sheet = false;
    }
  }
  return json({ ok: true, ...results });
}
