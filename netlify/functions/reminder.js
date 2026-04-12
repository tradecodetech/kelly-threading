// netlify/functions/reminder.js
// Runs every hour via Netlify scheduled functions
// Sends SMS reminders to customers whose appointment is ~24hrs away
//
// Schedule: every hour  →  netlify.toml sets: schedule = "0 * * * *"

const https = require('https');
const querystring = require('querystring');

function sendSMS(to, body) {
  return new Promise((resolve, reject) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    const postData = querystring.stringify({ To: to, From: fromNumber, Body: body });
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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Fetch pending reminders from Netlify Blobs (key-value store) ──
// We use the free Netlify Blobs API to persist bookings server-side
async function getBlob(key) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${siteId}/blobs/${key}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        } else {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function setBlob(key, value) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;
  const body   = JSON.stringify(value);

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${siteId}/blobs/${key}`,
      method: 'PUT',
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

exports.handler = async () => {
  const now     = new Date();
  const in24hrs = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Load pending reminders list
  const pending = (await getBlob('pending-reminders')) || [];
  const stillPending = [];
  let sent = 0;

  for (const booking of pending) {
    // Parse appointment datetime
    // booking.date = "2025-07-15", booking.time = "2:00 PM"
    const apptDatetime = parseDatetime(booking.date, booking.time);
    if (!apptDatetime) { stillPending.push(booking); continue; }

    const msUntilAppt = apptDatetime - now;
    const hoursUntil  = msUntilAppt / (1000 * 60 * 60);

    // Send reminder if appointment is between 23 and 25 hours away
    if (hoursUntil >= 23 && hoursUntil <= 25 && !booking.reminderSent) {
      const apptDate = apptDatetime.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });

      const msg =
`Hi ${booking.name}! 🌸 Reminder from Kelly Threading & Waxing:

Your appointment is TOMORROW!
📅 ${apptDate} at ${booking.time}
💆 ${booking.service}
📍 2239 34th St, Lubbock TX

Need to reschedule? Call (806) 281-0650
See you soon! ✨`;

      try {
        await sendSMS(booking.phone, msg);
        booking.reminderSent = true;
        sent++;
        console.log(`Reminder sent to ${booking.name}`);
      } catch (e) {
        console.error(`Reminder failed for ${booking.name}:`, e.message);
      }
    }

    // Keep in list if appointment hasn't happened yet and reminder sent
    if (apptDatetime > now) {
      stillPending.push(booking);
    }
  }

  // Save updated list back
  if (pending.length > 0) {
    await setBlob('pending-reminders', stillPending);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ checked: pending.length, remindersSent: sent })
  };
};

function parseDatetime(dateStr, timeStr) {
  try {
    // timeStr like "2:00 PM" or "10:30 AM"
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(hours, minutes, 0, 0);
    return d;
  } catch {
    return null;
  }
}
