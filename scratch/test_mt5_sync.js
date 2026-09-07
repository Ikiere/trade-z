const fs = require('fs');
const env = {};
fs.readFileSync('apps/api/.env', 'utf8').split('\n').forEach(l => {
  const p = l.split('=');
  if (p.length >= 2) env[p[0].trim()] = p.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
});

async function run() {
  const bridgeHistRes = await fetch('http://127.0.0.1:5001/history');
  const bridgeData = await bridgeHistRes.json();
  console.log('Bridge returned trades:', bridgeData.trades?.length);

  // Get user ID
  const userRes = await fetch(`${env['SUPABASE_URL']}/rest/v1/user_settings?select=user_id&limit=1`, {
    headers: { apikey: env['SUPABASE_SERVICE_ROLE_KEY'], Authorization: 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'] }
  });
  const users = await userRes.json();
  const userId = users[0]?.user_id;
  console.log('Using User ID:', userId);

  if (!userId) {
    console.error('No user found');
    return;
  }

  for (const t of (bridgeData.trades || [])) {
    const brokerId = `MT5-#${t.ticket}`;
    let pair = (t.pair || t.symbol || 'EURUSD').toUpperCase();
    if (pair.endsWith('M') && pair.length > 4) pair = pair.slice(0, -1);

    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU') || pair.includes('GOLD');
    const pipMult = isJpy ? 100 : isGold ? 10 : 10000;
    const rawDiff = t.direction === 'long' ? (t.exit_price - t.entry_price) : (t.entry_price - t.exit_price);
    const pips = Number((rawDiff * pipMult).toFixed(1));

    const checkRes = await fetch(`${env['SUPABASE_URL']}/rest/v1/trades?broker_id=eq.${brokerId}&select=id`, {
      headers: { apikey: env['SUPABASE_SERVICE_ROLE_KEY'], Authorization: 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'] }
    });
    const existing = await checkRes.json();

    const payload = {
      user_id: userId,
      pair,
      type: 'market',
      direction: t.direction,
      status: t.status,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      stop_loss: 0,
      take_profit: 0,
      lot_size: t.volume,
      pnl: t.profit,
      pips,
      broker_id: brokerId,
      opened_at: t.opened_at || new Date().toISOString(),
      closed_at: t.closed_at || new Date().toISOString(),
      ai_reasoning: `Synced from MetaTrader 5 Terminal (Ticket #${t.ticket})`
    };

    if (existing && existing.length > 0) {
      console.log(`Updating trade ${brokerId}`);
      await fetch(`${env['SUPABASE_URL']}/rest/v1/trades?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { apikey: env['SUPABASE_SERVICE_ROLE_KEY'], Authorization: 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'], 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      console.log(`Inserting trade ${brokerId}`);
      await fetch(`${env['SUPABASE_URL']}/rest/v1/trades`, {
        method: 'POST',
        headers: { apikey: env['SUPABASE_SERVICE_ROLE_KEY'], Authorization: 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'], 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  }

  // Print updated trades in Supabase
  const res = await fetch(`${env['SUPABASE_URL']}/rest/v1/trades?select=*&limit=10&order=closed_at.desc`, {
    headers: { apikey: env['SUPABASE_SERVICE_ROLE_KEY'], Authorization: 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'] }
  });
  const allTrades = await res.json();
  console.table(allTrades.map(t => ({
    pair: t.pair,
    direction: t.direction,
    status: t.status,
    entry: t.entry_price,
    exit: t.exit_price,
    pnl: t.pnl,
    broker_id: t.broker_id,
    closed_at: t.closed_at
  })));
}
run();
