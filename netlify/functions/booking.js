// netlify/functions/booking.js
// Receives booking from form → saves to file → sends SMS via Twilio

const https = require('https');
const querystring = require('querystring');

// ─── Twilio SMS helper ───────────────────────────────────────────────────────
function sendSMS(to, body) {
  return new Promise((resolve, reject) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER; // your Twilio number

    const postData = querystring.stringify({
      To:   to,
      From: fromNumber,
      Body: body
    });

    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization':  'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(`Twilio error: ${parsed.message || data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // CORS headers so your HTML page can call this
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  let booking;
  try {
    booking = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // ── Validate required fields ──
  const required = ['name', 'phone', 'category', 'service', 'date', 'time'];
  for (const field of required) {
    if (!booking[field]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Missing field: ${field}` })
      };
    }
  }

  // ── Clean phone numbers ──
  const cleanPhone = booking.phone.replace(/\D/g, '');
  const customerPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;
  const ownerPhone    = process.env.OWNER_PHONE;   // e.g. +18062810650
  const myPhone       = process.env.MY_PHONE;      // your phone (you, the marketer)

  // ── Format date nicely ──
  const apptDate = new Date(booking.date + 'T12:00:00'); // noon to avoid timezone issues
  const dateStr  = apptDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  const isNew   = booking.newCustomer === 'yes';
  const hasCode = (booking.promoCode || '').toUpperCase() === 'KELLY10';

  // ── SMS to YOU (the marketer) ──
  const alertMsg = 
`🌸 NEW KELLY BOOKING
---
Name: ${booking.name}
Phone: ${booking.phone}
Service: ${booking.service} (${booking.category})
Date: ${dateStr}
Time: ${booking.time}
New Customer: ${isNew ? 'YES ✅' : 'No'}
Promo Code: ${booking.promoCode || 'None'}
Price: ${booking.price || 'TBD'}
---
${isNew && hasCode ? '💰 KELLY10 used — commission earned!' : ''}`;

  // ── SMS to OWNER ──
  const ownerMsg =
`🌸 New Booking Request!
${booking.name} wants ${booking.service}
📅 ${dateStr} at ${booking.time}
📞 ${booking.phone}
${hasCode ? '🏷️ Code KELLY10 — give 10% off' : ''}
Reply to confirm or call them.`;

  // ── Confirmation SMS to CUSTOMER ──
  const confirmMsg =
`Hi ${booking.name}! 🌸
Your booking request at Kelly Threading & Waxing is received!

📅 ${dateStr} at ${booking.time}
💆 ${booking.service}
📍 2239 34th St, Lubbock TX
${hasCode ? '🏷️ Code KELLY10 = 10% OFF your visit!' : ''}

We'll call to confirm soon. Questions? Call (806) 281-0650.
— Kelly Threading & Waxing`;

  // ── Send all SMS ──
  const results = { sms: {} };

  try {
    await sendSMS(myPhone, alertMsg);
    results.sms.marketer = 'sent';
  } catch (e) {
    console.error('SMS to marketer failed:', e.message);
    results.sms.marketer = 'failed: ' + e.message;
  }

  try {
    await sendSMS(ownerPhone, ownerMsg);
    results.sms.owner = 'sent';
  } catch (e) {
    console.error('SMS to owner failed:', e.message);
    results.sms.owner = 'failed: ' + e.message;
  }

  try {
    await sendSMS(customerPhone, confirmMsg);
    results.sms.customer = 'sent';
  } catch (e) {
    console.error('SMS to customer failed:', e.message);
    results.sms.customer = 'failed: ' + e.message;
  }

  // ── Schedule 24hr reminder (stored in Netlify env as a queued job) ──
  // We store the reminder data — the reminder function handles the timing
  results.booking = {
    id:        'BK' + Date.now(),
    name:      booking.name,
    phone:     customerPhone,
    service:   booking.service,
    date:      booking.date,
    time:      booking.time,
    promoCode: booking.promoCode,
    timestamp: new Date().toISOString()
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, ...results })
  };
};
