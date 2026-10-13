/* Moovit booking CRM — Google Apps Script.
 *
 * SETUP (5 minutes):
 * 1. Create a Google Sheet (this will be the CRM).
 * 2. In the sheet: Extensions → Apps Script. Delete any starter code,
 *    paste this entire file, and set BROKER_EMAIL + BUSINESS_NAME +
 *    SHARED_SECRET below.
 * 3. Deploy → New deployment → type "Web app":
 *      Execute as: Me
 *      Who has access: Anyone
 *    → Deploy → copy the Web app URL.
 * 4. In Cloudflare Pages → moovit-co → Settings → Environment variables:
 *      SHEETS_WEBAPP_URL = the Web app URL
 *      SHEETS_SECRET     = the same secret you set below
 *    → Redeploy once.
 *
 * Every paid booking then appends a row to the "Bookings" tab, emails
 * the full details to BROKER_EMAIL from your Gmail (free), and emails
 * a customer-friendly summary to the customer's address.
 */

var BROKER_EMAIL = 'you@yourdomain.com'; // <-- the broker's email
var BUSINESS_NAME = 'Moovit'; // <-- customer-facing business name
var SHARED_SECRET = 'change-me-to-a-random-string'; // <-- make something random

var SHEET_NAME = 'Bookings';
var HEADERS = ['Timestamp', 'Ref', 'Status', 'Name', 'Email', 'Phone',
  'Move type', 'Move size', 'From ZIP', 'To ZIP', 'Date', 'Time window',
  'Stairs', 'Packing', 'Heavy items', 'Miles', 'Estimate'];

var SHEET_MOVERS = 'Movers';
var MOVER_HEADERS = ['Timestamp', 'Name', 'Phone', 'Email', 'Vehicle',
  'Lift 75lbs', 'Gear', 'Coverage ZIP', 'Radius', 'Availability',
  'License', 'Payout'];

function doGet() {
  return json({ ok: true, service: 'moovit-crm' });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || data.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }
    if (data.type === 'mover') return handleMover(data.mover || {});
    var b = data.booking || {};
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sh) sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
    var headers = ensureHeaders(sh, HEADERS);
    var vals = {
      'Timestamp': new Date(), 'Ref': b.ref || '', 'Status': b.status || 'confirmed',
      'Name': b.name || '', 'Email': b.email || '', 'Phone': b.phone || '',
      'Move type': b.moveType || '', 'Move size': b.size || '',
      'From ZIP': b.fromZip || '', 'To ZIP': b.toZip || '',
      'Date': b.date || '', 'Time window': b.time || '',
      'Stairs': b.stairs || '', 'Packing': b.packing || '', 'Heavy items': b.heavy || '',
      'Miles': b.miles != null ? b.miles : '',
      'Estimate': b.estimate != null ? b.estimate : ''
    };
    sh.appendRow(headers.map(function(h){ return vals[h] !== undefined ? vals[h] : ''; }));
    var attachments = [];
    if (b.summaryPng) {
      try {
        var b64 = String(b.summaryPng).split(',')[1] || String(b.summaryPng);
        attachments.push(Utilities.newBlob(Utilities.base64Decode(b64), 'image/png',
          'move-summary-' + (b.ref || 'booking') + '.png'));
      } catch (e) {}
    }
    MailApp.sendEmail({
      to: BROKER_EMAIL,
      subject: 'New Moovit booking ' + (b.ref || ''),
      body: buildEmail(b),
      attachments: attachments
    });
    var customerEmailed = false;
    if (b.email) {
      MailApp.sendEmail({
        to: b.email,
        subject: 'Your move with ' + BUSINESS_NAME + ' is reserved — ' + (b.ref || ''),
        body: buildCustomerEmailText(b),
        htmlBody: buildCustomerEmailHtml(b),
        attachments: attachments
      });
      customerEmailed = true;
    }
    return json({ ok: true, email: true, customerEmail: customerEmailed });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function ensureHeaders(sh, wanted) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(wanted);
    sh.setFrozenRows(1);
    return wanted.slice();
  }
  var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  wanted.forEach(function(h){
    if (existing.indexOf(h) === -1) {
      var at = (h === 'Miles') ? existing.indexOf('Estimate') : -1;
      if (at === -1) at = existing.length;
      sh.insertColumnBefore(at + 1);
      sh.getRange(1, at + 1).setValue(h);
      existing.splice(at, 0, h);
    }
  });
  return existing;
}

function handleMover(m) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_MOVERS);
  if (!sh) sh = ss.insertSheet(SHEET_MOVERS);
  var headers = ensureHeaders(sh, MOVER_HEADERS);
  var vals = {
    'Timestamp': new Date(),
    'Name': m.name || '', 'Phone': m.phone || '', 'Email': m.email || '',
    'Vehicle': m.vehicle || '', 'Lift 75lbs': m.lifting || '', 'Gear': m.gear || '',
    'Coverage ZIP': m.zip || '', 'Radius': m.radius || '',
    'Availability': m.availability || '', 'License': m.license || '',
    'Payout': m.payout || ''
  };
  sh.appendRow(headers.map(function(h){ return vals[h] !== undefined ? vals[h] : ''; }));
  var lines = [
    'New mover application', '',
    'Name:  ' + (m.name || '-'),
    'Phone: ' + (m.phone || '-'),
    'Email: ' + (m.email || '-'), '',
    'Vehicle:      ' + (m.vehicle || '-'),
    'Lift 75+ lbs: ' + (m.lifting || '-'),
    'Gear:         ' + (m.gear || '-'),
    'Coverage ZIP: ' + (m.zip || '-'),
    'Radius:       ' + (m.radius || '-'),
    'Availability: ' + (m.availability || '-'),
    'License:      ' + (m.license || '-'),
    'Payout:       ' + (m.payout || '-')
  ];
  MailApp.sendEmail({ to: BROKER_EMAIL, subject: 'New mover application: ' + (m.name || ''), body: lines.join('\n') });
  return json({ ok: true, email: true });
}

function buildEmail(b) {
  var lines = [
    'New booking ' + (b.ref || ''),
    '',
    'Name:  ' + (b.name || '-'),
    'Phone: ' + (b.phone || '-'),
    'Email: ' + (b.email || '-'),
    '',
    'Move:   ' + [b.size, b.moveType].filter(String).join(' · '),
    'Route:  ' + (b.fromZip || '-') + ' -> ' + (b.toZip || '-'),
    'Distance: ' + (b.miles != null ? 'approx ' + Number(b.miles).toLocaleString() + ' miles' : '-'),
    'When:   ' + [b.date, b.time].filter(String).join(' · '),
    'Access: ' + [b.stairs, b.packing, b.heavy].filter(String).join(' · '),
    '',
    'Estimate: $' + (b.estimate != null ? b.estimate : '-')
  ];
  return lines.join('\n');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildCustomerEmailText(b) {
  var lines = [
    'Hi ' + (b.name || 'there') + ',',
    '',
    'Your move with ' + BUSINESS_NAME + ' is reserved. Here is your summary:',
    '',
    'Booking ref: ' + (b.ref || '-'),
    'Route: ' + (b.fromZip || '-') + ' -> ' + (b.toZip || '-'),
    'Distance: ' + (b.miles != null ? 'approx ' + Number(b.miles).toLocaleString() + ' driving miles' : '-'),
    'Date: ' + ([b.date, b.time].filter(String).join(' · ') || '-'),
    'Move: ' + ([b.size, b.moveType].filter(String).join(' · ') || '-'),
    'Details: ' + ([b.stairs, b.packing, b.heavy].filter(String).join(' · ') || '-'),
    '',
    'Estimated total: $' + (b.estimate != null ? b.estimate : '-'),
    '',
    'No payment due today — we will send your invoice by email or text message, and you can pay whenever you are ready.',
    '',
    'Questions? Just reply to this email.',
    '',
    '— ' + BUSINESS_NAME
  ];
  return lines.join('\n');
}

function buildCustomerEmailHtml(b) {
  function row(k, v) {
    return '<tr><td style="padding:8px 12px;color:#5b6470;font-size:13px;">' + k + '</td>' +
      '<td style="padding:8px 12px;font-size:14px;font-weight:600;color:#1a1a1a;text-align:right;">' + v + '</td></tr>';
  }
  var rows =
    row('Booking ref', esc(b.ref || '-')) +
    row('Route', esc(b.fromZip || '-') + ' → ' + esc(b.toZip || '-')) +
    row('Distance', b.miles != null ? 'approx ' + Number(b.miles).toLocaleString() + ' miles' : '-') +
    row('Date', esc([b.date, b.time].filter(String).join(' · ') || '-')) +
    row('Move', esc([b.size, b.moveType].filter(String).join(' · ') || '-')) +
    row('Details', esc([b.stairs, b.packing, b.heavy].filter(String).join(' · ') || '-'));
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">' +
    '<h2 style="color:#1a1a1a;margin:0 0 8px;">Your move is reserved</h2>' +
    '<p style="font-size:14px;">Hi ' + esc(b.name || 'there') + ',</p>' +
    '<p style="font-size:14px;">Your move with ' + esc(BUSINESS_NAME) + ' is reserved. Here is your summary:</p>' +
    '<table style="width:100%;border-collapse:collapse;background:#f7f7f5;border:1px solid #e5e5e0;border-radius:10px;margin:16px 0;">' + rows + '</table>' +
    '<p style="font-size:18px;">Estimated total: <strong>$' + esc(b.estimate != null ? b.estimate : '-') + '</strong></p>' +
    '<p style="font-size:14px;color:#5b6470;">No payment due today — we will send your invoice by email or text message, and you can pay whenever you are ready.</p>' +
    '<p style="font-size:14px;">Questions? Just reply to this email.</p>' +
    '<p style="font-size:14px;">— ' + esc(BUSINESS_NAME) + '</p></div>';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
