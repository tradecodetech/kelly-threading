// netlify/functions/booking.js
// Receives booking → sends to Zapier → Zapier emails you instantly
// No Twilio needed. Free.

const https = require('https');

function postToZapier(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'hooks.zapier.com',
      port: 443,
      path: '/hooks/catch/27192061/u7e2wnt/',
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        console.log('Zapier response:', res.statusCode, responseData);
        resolve({ status: res.statusCode, body: responseData });
      });
    });

    req.on('error', (err) => {
      console.error('Zapier error:', err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

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

  const required = ['name', 'phone', 'category', 'service', 'date', 'time'];
  for (const field of required) {
    if (!booking[field]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Missing: ${field}` }) };
    }
  }

  const apptDate = new Date(booking.date + 'T12:00:00');
  const dateStr  = apptDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  const isNew   = booking.newCustomer === 'yes';
  const hasCode = (booking.promoCode || '').toUpperCase() === 'KELLY10';

  const zapierPayload = {
    booking_id:     booking.id || 'BK' + Date.now(),
    customer_name:  booking.name,
    customer_phone: booking.phone,
    service:        booking.service,
    category:       booking.category,
    price:          booking.price || 'TBD',
    date:           dateStr,
    time:           booking.time,
    new_customer:   isNew ? 'YES - New Customer' : 'Returning Customer',
    promo_code:     booking.promoCode || 'None',
    commission:     hasCode ? 'YES - KELLY10 used' : 'No code used',
    timestamp:      new Date().toISOString(),

    email_subject: `🌸 New Kelly Booking — ${booking.name} — ${booking.service}`,
    email_body:
`NEW BOOKING REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Name:        ${booking.name}
📞 Phone:       ${booking.phone}
💆 Service:     ${booking.service} (${booking.category})
💰 Price:       ${booking.price || 'TBD'}
📅 Date:        ${dateStr}
⏰ Time:        ${booking.time}
🆕 New Customer: ${isNew ? 'YES ✅' : 'No'}
🏷️  Promo Code:  ${booking.promoCode || 'None'}
${hasCode ? '💰 KELLY10 used — YOU EARN COMMISSION!' : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Call ${booking.name} at ${booking.phone} to confirm.
Kelly Threading — (806) 281-0650
━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  };

  try {
    const result = await postToZapier(zapierPayload);
    console.log('Zapier sent:', result.status);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, zapier: result.status })
    };
  } catch (err) {
    console.error('Zapier failed:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, warning: 'Notification issue' })
    };
  }
};
