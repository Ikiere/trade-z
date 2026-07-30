const url = 'https://invyoijtyfridyumlgqr.supabase.co/rest/v1/user_profiles?limit=1';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImludnlvaWp0eWZyaWR5dW1sZ3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQwMTk5NiwiZXhwIjoyMTAwOTc3OTk2fQ.j5ccbvys-D5ngNt2wkn5gzxIvGYoDSEoI7wJYul5mGE';

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
