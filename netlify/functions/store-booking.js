// netlify/functions/store-booking.js
// Called by booking.js after SMS is sent — persists booking to Netlify Blobs
// so reminders can be scheduled and admin can see real data

const https = require('https');

async function getBlob(key) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}`,
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
      path: `/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Content-Type':   'application/json',
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Content-Type': 'application/json'
  };

  let booking;
  try {
    booking = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // ── Add to all-bookings list ──
  const allBookings = (await getBlob('all-bookings')) || [];
  allBookings.unshift(booking); // newest first
  // Cap at 500 bookings stored
  if (allBookings.length > 500) allBookings.splice(500);
  await setBlob('all-bookings', allBookings);

  // ── Add to pending-reminders list ──
  const pending = (await getBlob('pending-reminders')) || [];
  pending.push({
    id:           booking.id,
    name:         booking.name,
    phone:        booking.phone,
    service:      booking.service,
    date:         booking.date,
    time:         booking.time,
    reminderSent: false
  });
  await setBlob('pending-reminders', pending);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, bookingId: booking.id })
  };
};
