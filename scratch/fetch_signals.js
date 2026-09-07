
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
  // Update recent signals where entry_price < current_price and direction is short
  const getRes = await fetch(`${supabaseUrl}/rest/v1/signals?direction=eq.short&order_type=eq.sell limit&select=id,pair,entry_price,current_price`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  const list = await getRes.json();
  console.log('Signals to check for sell stop correction:', list);

  for (const s of list) {
    if (Number(s.entry_price) <= Number(s.current_price)) {
      console.log(`Fixing signal ${s.id} (${s.pair}): changing order_type to 'sell stop'`);
      await fetch(`${supabaseUrl}/rest/v1/signals?id=eq.${s.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ order_type: 'sell stop' })
      });
    }
  }

  // Print updated list
  const res2 = await fetch(`${supabaseUrl}/rest/v1/signals?select=*&order=created_at.desc&limit=5`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  const data2 = await res2.json();
  console.table(data2.map(s => ({
    id: s.id.slice(0, 8),
    pair: s.pair,
    direction: s.direction,
    order_type: s.order_type,
    entry: s.entry_price,
    current: s.current_price,
    created_at: s.created_at
  })));
}
run();
