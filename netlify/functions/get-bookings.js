// netlify/functions/get-bookings.js
// Called by the admin dashboard to load real server-side bookings

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

exports.handler = async (event) => {
  // Simple auth check — pass ?token=YOUR_ADMIN_TOKEN in URL
  const token   = event.queryStringParameters?.token;
  const myToken = process.env.ADMIN_TOKEN;

  if (!token || token !== myToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const bookings = (await getBlob('all-bookings')) || [];

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bookings, count: bookings.length })
  };
};
