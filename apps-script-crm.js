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
  'Stairs', 'Packing', 'Heavy items', 'Estimate'];

function doGet() {
  return json({ ok: true, service: 'moovit-crm' });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || data.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }
    var b = data.booking || {};
    sheet().appendRow([
      new Date(),
      b.ref || '', b.status || 'confirmed',
      b.name || '', b.email || '', b.phone || '',
      b.moveType || '', b.size || '',
      b.fromZip || '', b.toZip || '',
      b.date || '', b.time || '',
      b.stairs || '', b.packing || '', b.heavy || '',
      b.estimate != null ? b.estimate : ''
    ]);
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

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
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
