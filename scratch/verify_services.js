const nestApiUrl = 'https://trade-z-production-9a14.up.railway.app/api/v1/health';
const pythonAiUrl = 'https://trade-z-production.up.railway.app/health';
const nestChatUrl = 'https://trade-z-production-9a14.up.railway.app/api/v1/chat';

async function verify() {
  console.log('--- Trade-Z Backend Verification ---');

  // 1. Check NestJS API Health
  try {
    const res = await fetch(nestApiUrl);
    console.log(`NestJS API Health status: ${res.status} (${res.statusText})`);
    if (res.ok) {
      console.log('NestJS API Response:', await res.json());
    }
  } catch (err) {
    console.error('NestJS API Health error:', err.message);
  }

  console.log('\n-------------------------------------');

  // 2. Check Python AI Service Health
  try {
    const res = await fetch(pythonAiUrl);
    console.log(`Python AI Health status: ${res.status} (${res.statusText})`);
    if (res.ok) {
      console.log('Python AI Response:', await res.json());
    }
  } catch (err) {
    console.error('Python AI Health error:', err.message);
  }

  console.log('\n-------------------------------------');

  // 3. Verify End-to-End Chat Communication (NestJS -> Python AI)
  try {
    console.log('Sending chat query to NestJS (which calls Python AI)...');
    const res = await fetch(nestChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Tell me about EURUSD' })
    });

    console.log(`End-to-End Chat status: ${res.status} (${res.statusText})`);
    if (res.ok) {
      console.log('End-to-End Chat Response:', await res.json());
    } else {
      console.log('Response body:', await res.text());
    }
  } catch (err) {
    console.error('End-to-End Chat error:', err.message);
  }
}

verify();
