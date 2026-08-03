const fs = require('fs');
const path = require('path');

// Load environment variables from apps/api/.env manually
const envPath = path.resolve(__dirname, '../apps/api/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabaseUrl = env['SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env');
  process.exit(1);
}

async function runTest() {
  console.log('Attempting to insert a test signal into Supabase signals table via REST API...');
  
  const payload = {
    user_id: '31c93e9c-6e3f-446a-9448-37bf8071ce45', // User ID from user's logs
    pair: 'EURUSD',
    direction: 'long',
    status: 'active',
    entry_price: 1.08450,
    stop_loss: 1.08150,
    take_profit: 1.09050,
    confidence: 85,
    timeframe: '4h',
    order_type: 'buy limit'
  };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/signals`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log(`Response Status: ${res.status} ${res.statusText}`);
    console.log(`Response Body: ${text}`);
  } catch (err) {
    console.error('Fetch Exception:', err);
  }
}

runTest();
