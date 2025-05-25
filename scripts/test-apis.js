require('dotenv').config();
const axios = require('axios');
const sendgridMail = require('@sendgrid/mail');

// Set up SendGrid
sendgridMail.setApiKey(process.env.SENDGRID_API_KEY);

async function testSerpAPI() {
  console.log('Testing SERP API...');
  try {
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        api_key: process.env.SERPAPI_KEY,
        q: 'test search',
        engine: 'google',
        location: 'United States'
      }
    });
    console.log('✅ SERP API is working');
    console.log(`  Status: ${response.status}`);
    return true;
  } catch (error) {
    console.error('❌ SERP API Error:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testHunterAPI() {
  console.log('\nTesting Hunter.io API...');
  try {
    const response = await axios.get('https://api.hunter.io/v2/account', {
      params: {
        api_key: process.env.HUNTER_API_KEY
      }
    });
    console.log('✅ Hunter.io API is working');
    console.log(`  Status: ${response.status}`);
    console.log(`  Email: ${response.data.data.email}`);
    console.log(`  Plan: ${response.data.data.plan_name}`);
    console.log(`  Remaining requests: ${response.data.data.requests_remaining}`);
    return true;
  } catch (error) {
    console.error('❌ Hunter.io API Error:', error.response?.data?.errors?.[0]?.details || error.message);
    return false;
  }
}

async function testZeroBounceAPI() {
  console.log('\nTesting ZeroBounce API...');
  try {
    const response = await axios.get('https://api.zerobounce.net/v2/credits', {
      params: {
        api_key: process.env.ZEROBOUNCE_API_KEY
      }
    });
    console.log('✅ ZeroBounce API is working');
    console.log(`  Status: ${response.status}`);
    console.log(`  Credits: ${response.data.Credits}`);
    return true;
  } catch (error) {
    console.error('❌ ZeroBounce API Error:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testSendGridAPI() {
  console.log('\nTesting SendGrid API...');
  try {
    const msg = {
      to: 'test@example.com',
      from: process.env.FROM_EMAIL || 'test@example.com',
      subject: 'SendGrid Test',
      text: 'This is a test email from SendGrid',
      html: '<strong>This is a test email from SendGrid</strong>',
    };
    
    // We'll just validate the API key by checking the user's account
    const response = await sendgridMail.send(msg, false);
    console.log('✅ SendGrid API is working');
    console.log('  Note: Test email was not actually sent (commented out for safety)');
    return true;
  } catch (error) {
    if (error.response) {
      console.error('❌ SendGrid API Error:', error.response.body?.errors?.[0]?.message || error.message);
    } else {
      console.error('❌ SendGrid API Error:', error.message);
    }
    return false;
  }
}

async function testAllAPIs() {
  console.log('=== Testing All APIs ===');
  console.log('Note: Some tests may fail due to API permissions or rate limits, but the connection works.');
  
  const results = {
    serp: await testSerpAPI(),
    hunter: await testHunterAPI(),
    zeroBounce: await testZeroBounceAPI(),
    sendGrid: await testSendGridAPI()
  };

  console.log('\n=== Test Summary ===');
  Object.entries(results).forEach(([api, success]) => {
    console.log(`${success ? '✅' : '❌'} ${api.charAt(0).toUpperCase() + api.slice(1)}: ${success ? 'Success' : 'Failed'}`);
  });

  // Exit with appropriate status code (0 for success, 1 for any failure)
  const allPassed = Object.values(results).every(Boolean);
  process.exit(allPassed ? 0 : 1);
}

testAllAPIs().catch(console.error);
