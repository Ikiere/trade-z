const url = process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/rest/v1/user_profiles?limit=1` : '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
})
.then(async res => {
  console.log('HTTP Status:', res.status);
  console.log('Status Text:', res.statusText);
  const text = await res.text();
  console.log('Response Body:', text);
})
.catch(err => {
  console.error('Fetch Error:', err);
});
