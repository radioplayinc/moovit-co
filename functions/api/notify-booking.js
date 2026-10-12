// POST /api/notify-booking — alerts on new paid bookings.
//   Push via Web Push (self-owned: VAPID + service worker, no vendors).
//   Email via Resend (optional). SMS via Twilio (optional).
// Env vars (Cloudflare Pages → Settings → Environment variables):
//   VAPID_PRIVATE_KEY (JWK JSON), VAPID_SUBJECT (e.g. mailto:you@domain),
//   SUPABASE_SERVICE_KEY (to read push subscriptions),
//   RESEND_API_KEY, ALERT_EMAIL, ALERT_FROM (email),
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, NOTIFY_TO (SMS)
//   SHEETS_WEBAPP_URL, SHEETS_SECRET (Google Sheets CRM + Gmail email via Apps Script)

const SUPABASE_URL = 'https://zhtfcrrvhqybhtoyppir.supabase.co';
const te = new TextEncoder();

function b64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hmac(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}
async function hkdfExpand(prk, info, len) {
  const chunks = [];
  let t = new Uint8Array(0);
  let counter = 1;
  let have = 0;
  while (have < len) {
    t = await hmac(prk, concat(t, info, new Uint8Array([counter])));
    chunks.push(t);
    have += t.length;
    counter++;
  }
  return concat(...chunks).slice(0, len);
}

// RFC 8291 aes128gcm encryption for one push subscription.
async function encryptPush(p256dhB64u, authB64u, plaintextBytes) {
  const receiverPub = unb64u(p256dhB64u); // 65-byte uncompressed
  const authSecret = unb64u(authB64u); // 16 bytes
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
  const ephPub = concat(new Uint8Array([0x04]), unb64u(ephJwk.x), unb64u(ephJwk.y));
  const recvKey = await crypto.subtle.importKey('raw', receiverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: recvKey }, eph.privateKey, 256));
  const prk = await hmac(authSecret, shared);
  const keyInfo = concat(te.encode('WebPush: info'), new Uint8Array([0]), receiverPub, ephPub);
  const ikm = await hkdfExpand(prk, keyInfo, 32);
  const cek = await hkdfExpand(ikm, concat(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(ikm, concat(te.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const padded = concat(new Uint8Array([0x02]), plaintextBytes);
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));
  const header = concat(salt, new Uint8Array([0, 0, 0x10, 0x00]), new Uint8Array([65]), ephPub);
  return { body: concat(header, ct) };
}

// RFC 8292 VAPID Authorization header value.
async function vapidAuthHeader(endpoint, subject, privJwk, vapidPubB64u) {
  const key = await crypto.subtle.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64u(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject,
  })));
  const data = te.encode(`${header}.${payload}`);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${vapidPubB64u}`;
}

async function sendPush(sub, payload, vapid) {
  const plaintext = te.encode(JSON.stringify(payload));
  const { body } = await encryptPush(sub.keys.p256dh, sub.keys.auth, plaintext);
  const authz = await vapidAuthHeader(sub.endpoint, vapid.subject, vapid.privJwk, vapid.pubB64u);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: authz,
      TTL: '86400',
    },
    body,
  });
}

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

  const title = `New Moovit booking ${(b.ref || '').trim()}`.trim();
  const lines = [
    `Name: ${b.name || '—'}`,
    `Phone: ${b.phone || '—'}`,
    `Email: ${b.email || '—'}`,
    `Move: ${[b.size, b.moveType].filter(Boolean).join(' · ') || '—'}`,
    `Route: ${b.fromZip && b.toZip ? `${b.fromZip} → ${b.toZip}` : '—'}`,
    `When: ${[b.date, b.time].filter(Boolean).join(' · ') || '—'}`,
    `Access: ${[b.stairs, b.packing, b.heavy].filter(Boolean).join(' · ') || '—'}`,
    b.estimate ? `Estimate: $${b.estimate}` : '',
  ].filter(Boolean);
  const text = `${title}\n\n${lines.join('\n')}`;
  const results = {};

  // Web Push — self-owned, no vendors.
  if (env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT && env.SUPABASE_SERVICE_KEY) {
    try {
      const privJwk = JSON.parse(env.VAPID_PRIVATE_KEY);
      const vapidPubB64u = b64u(concat(new Uint8Array([0x04]), unb64u(privJwk.x), unb64u(privJwk.y)));
      const vapid = { privJwk, subject: env.VAPID_SUBJECT, pubB64u: vapidPubB64u };
      const sr = env.SUPABASE_SERVICE_KEY;
      const subRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,keys`, {
        headers: { apikey: sr, Authorization: `Bearer ${sr}` },
      });
      if (!subRes.ok) {
        results.push = { error: 'fetch-subs-failed' };
      } else {
        const subs = await subRes.json();
        const payload = { title, body: lines.join('\n') };
        let sent = 0, failed = 0;
        for (const s of subs) {
          try {
            const r = await sendPush(s, payload, vapid);
            if (r.status === 404 || r.status === 410) {
              await fetch(
                `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
                { method: 'DELETE', headers: { apikey: sr, Authorization: `Bearer ${sr}` } }
              );
              failed++;
            } else if (r.ok) sent++;
            else failed++;
          } catch (e) { failed++; }
        }
        results.push = { sent, failed, total: subs.length };
      }
    } catch (e) {
      results.push = { error: String((e && e.message) || e) };
    }
  }

  // Email via Resend (optional).
  if (env.RESEND_API_KEY && env.ALERT_EMAIL) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.ALERT_FROM || 'Moovit <onboarding@resend.dev>',
          to: [env.ALERT_EMAIL],
          subject: title,
          text,
        }),
      });
      results.email = res.ok;
    } catch (e) { results.email = false; }
  }

  // Twilio SMS (optional).
  const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, NOTIFY_TO } = env;
  if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && NOTIFY_TO) {
    const params = new URLSearchParams({ From: TWILIO_FROM, To: NOTIFY_TO, Body: text });
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );
      results.sms = res.ok;
    } catch (e) { results.sms = false; }
  }

  // Google Sheets CRM + broker email via Apps Script (optional).
  if (env.SHEETS_WEBAPP_URL) {
    try {
      const res = await fetch(env.SHEETS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.SHEETS_SECRET || '',
          booking: {
            ref: (b.ref || '').trim(), status: 'confirmed',
            name: b.name || '', email: b.email || '', phone: b.phone || '',
            size: b.size || '', moveType: b.moveType || '',
            fromZip: b.fromZip || '', toZip: b.toZip || '',
            date: b.date || '', time: b.time || '',
            stairs: b.stairs || '', packing: b.packing || '', heavy: b.heavy || '',
            estimate: b.estimate != null ? b.estimate : null,
            miles: b.miles != null ? b.miles : null,
          },
        }),
      });
      let jr = {};
      try { jr = await res.json(); } catch (e) {}
      results.sheet = res.ok && jr.ok === true;
      if (jr.email) results.sheetEmail = true;
      if (jr.customerEmail) results.customerEmail = true;
      if (jr.error) results.sheetError = jr.error;
    } catch (e) {
      results.sheet = false;
    }
  }

  return json({ ok: true, ...results });
}

// Exported for offline verification of the crypto.
export const _pushCrypto = { b64u, unb64u, concat, hmac, hkdfExpand, encryptPush, vapidAuthHeader };
