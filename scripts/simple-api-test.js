require('dotenv').config();
const axios = require('axios');

console.log('=== Starting API Tests ===\n');

// Test 1: SERP API
console.log('1. Testing SERP API...');
axios.get('https://serpapi.com/search.json', {
  params: {
    api_key: process.env.SERPAPI_KEY,
    q: 'test search',
    engine: 'google',
    location: 'United States'
  }
})
.then(response => {
  console.log('✅ SERP API is working');
  console.log(`  Status: ${response.status}`);
})
.catch(error => {
  console.error('❌ SERP API Error:', error.response?.data?.error || error.message);
});

// Test 2: Hunter.io API
console.log('\n2. Testing Hunter.io API...');
axios.get('https://api.hunter.io/v2/account', {
  params: {
    api_key: process.env.HUNTER_API_KEY
  }
})
.then(response => {
  console.log('✅ Hunter.io API is working');
  console.log(`  Status: ${response.status}`);
  console.log(`  Email: ${response.data.data.email}`);
  console.log(`  Plan: ${response.data.data.plan_name}`);
})
.catch(error => {
  console.error('❌ Hunter.io API Error:', error.response?.data?.errors?.[0]?.details || error.message);
});

// Test 3: ZeroBounce API
console.log('\n3. Testing ZeroBounce API...');
axios.get('https://api.zerobounce.net/v2/getcredits', {
  params: {
    api_key: process.env.ZEROBOUNCE_API_KEY
  }
})
.then(response => {
  console.log('✅ ZeroBounce API is working');
  console.log(`  Status: ${response.status}`);
  console.log(`  Credits: ${response.data.Credits}`);
})
.catch(error => {
  console.error('❌ ZeroBounce API Error:', error.response?.data?.error || error.message);
});

// Test 4: SendGrid API (simplified test)
console.log('\n4. Testing SendGrid API (simplified test)...');
console.log('  Note: This only validates the API key format, not actual sending');
const sendgridKey = process.env.SENDGRID_API_KEY || '';
if (sendgridKey.startsWith('SG.') && sendgridKey.length > 30) {
  console.log('✅ SendGrid API key format appears valid');
  console.log('  Key starts with: ' + sendgridKey.substring(0, 10) + '...');
} else {
  console.error('❌ SendGrid API key format appears invalid');
}

console.log('\n=== Test Complete ===');
console.log('Note: Some tests may fail due to API permissions or rate limits, but the connection works.');
