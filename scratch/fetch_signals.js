
const fs = require('fs');
const path = require('path');

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

async function run() {
  const res = await fetch(`${supabaseUrl}/rest/v1/signals?select=*&order=created_at.desc&limit=5`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  });
  const data = await res.json();
  console.log('Signals in DB:');
  data.forEach(s => {
    console.log(`[${s.pair}] ${s.direction} | status: ${s.status} | entry: ${s.entry_price} | sl: ${s.stop_loss} | tp: ${s.take_profit} | conf: ${s.confidence}% | reasoning: ${s.ai_reasoning?.slice(0, 50)}...`);
  });
}
run();
