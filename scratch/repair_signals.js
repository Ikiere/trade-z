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

async function repair() {
  console.log('Fetching all signals from Supabase...');
  const res = await fetch(`${supabaseUrl}/rest/v1/signals?select=*`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  });

  const signals = await res.json();
  console.log(`Found ${signals.length} total signals in database.`);

  let repairedCount = 0;

  for (const sig of signals) {
    const pair = String(sig.pair || 'EURUSD').toUpperCase();
    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU') || pair.includes('GOLD');
    const isCrypto = pair.includes('BTC') || pair.includes('ETH');
    const decimals = isJpy ? 3 : (isGold || isCrypto ? 2 : 5);

    let entry = Number(sig.entry_price) || 0;
    if (entry <= 0) {
      if (pair.includes('EUR')) entry = 1.0845;
      else if (pair.includes('GBP')) entry = 1.2680;
      else if (isJpy) entry = 154.20;
      else if (isGold) entry = 2850.50;
      else entry = 1.0000;
    }
    entry = Number(entry.toFixed(decimals));

    const direction = String(sig.direction).toLowerCase() === 'short' ? 'short' : 'long';
    let sl = Number(sig.stop_loss) || 0;
    let tp = Number(sig.take_profit) || 0;

    const defaultSlDist = isGold ? 6.0 : (isJpy ? 0.25 : (isCrypto ? 100.0 : 0.0015));
    const defaultTpDist = defaultSlDist * 2.5;

    let needsRepair = false;

    if (direction === 'long') {
      if (sl <= 0 || sl >= entry) {
        sl = entry - defaultSlDist;
        needsRepair = true;
      }
      if (tp <= 0 || tp <= entry) {
        const risk = Math.abs(entry - sl) || defaultSlDist;
        tp = entry + (risk * 2.5);
        needsRepair = true;
      }
    } else {
      if (sl <= 0 || sl <= entry) {
        sl = entry + defaultSlDist;
        needsRepair = true;
      }
      if (tp <= 0 || tp >= entry) {
        const risk = Math.abs(sl - entry) || defaultSlDist;
        tp = entry - (risk * 2.5);
        needsRepair = true;
      }
    }

    sl = Number(sl.toFixed(decimals));
    tp = Number(tp.toFixed(decimals));

    if (needsRepair || sig.entry_price !== entry) {
      const updateRes = await fetch(`${supabaseUrl}/rest/v1/signals?id=eq.${sig.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entry_price: entry,
          stop_loss: sl,
          take_profit: tp,
          direction: direction
        })
      });

      if (updateRes.ok) {
        repairedCount++;
        console.log(`Repaired Signal [${sig.pair}] ID: ${sig.id} -> Direction: ${direction}, Entry: ${entry}, SL: ${sl}, TP: ${tp}`);
      } else {
        console.error(`Failed to repair signal ${sig.id}: ${updateRes.statusText}`);
      }
    }
  }

  console.log(`\nRepair completed successfully! Repaired ${repairedCount} of ${signals.length} signals.`);
}

repair().catch(console.error);
