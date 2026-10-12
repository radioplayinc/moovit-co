/* Moovit booking CRM — Google Apps Script.
 *
 * SETUP (5 minutes):
 * 1. Create a Google Sheet (this will be the CRM).
 * 2. In the sheet: Extensions → Apps Script. Delete any starter code,
 *    paste this entire file, and set BROKER_EMAIL + SHARED_SECRET below.
 * 3. Deploy → New deployment → type "Web app":
 *      Execute as: Me
 *      Who has access: Anyone
 *    → Deploy → copy the Web app URL.
 * 4. In Cloudflare Pages → moovit-co → Settings → Environment variables:
 *      SHEETS_WEBAPP_URL = the Web app URL
 *      SHEETS_SECRET     = the same secret you set below
 *    → Redeploy once.
 *
 * Every paid booking then appends a row to the "Bookings" tab and emails
 * the full details to BROKER_EMAIL from your Gmail (free).
 */

var BROKER_EMAIL = 'you@yourdomain.com'; // <-- the broker's email
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
    MailApp.sendEmail({
      to: BROKER_EMAIL,
      subject: 'New Moovit booking ' + (b.ref || ''),
      body: buildEmail(b)
    });
    return json({ ok: true, email: true });
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

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
