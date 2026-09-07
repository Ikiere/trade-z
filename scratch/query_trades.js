const fs = require('fs');
const env = {};
fs.readFileSync('apps/api/.env', 'utf8').split('\n').forEach(l => {
  const p = l.split('=');
  if (p.length >= 2) env[p[0].trim()] = p.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
});

async function run() {
  const res = await fetch(`${env['SUPABASE_URL']}/rest/v1/trades?select=*&limit=10&order=created_at.desc`, {
    headers: { apikey: env['SUPABASE_SERVICE_ROLE_KEY'], Authorization: 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'] }
  });
  const data = await res.json();
  console.log('Trades count:', Array.isArray(data) ? data.length : 0);
  if (Array.isArray(data) && data.length > 0) {
    console.table(data.map(t => ({
      id: t.id.slice(0, 8),
      pair: t.pair,
      direction: t.direction,
      status: t.status,
      entry: t.entry_price,
      exit: t.exit_price,
      pnl: t.pnl,
      broker_id: t.broker_id,
      created_at: t.created_at
    })));
  } else {
    console.log('No trades in DB yet or response:', data);
  }
}
run();
