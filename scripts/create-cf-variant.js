#!/usr/bin/env node
require('dotenv').config();

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;

async function createVariant() {
  // Create a "full" variant that serves images at original size with high quality
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: 'full',
        options: {
          fit: 'scale-down',
          metadata: 'none'
          // No width/height = original size preserved
        },
        neverRequireSignedURLs: true
      })
    }
  );

  const data = await response.json();

  if (data.success) {
    console.log('✅ Created "full" variant:');
    console.log(JSON.stringify(data.result, null, 2));
  } else {
    console.log('Error:', data.errors);

    // If it already exists, try to update it
    if (data.errors?.[0]?.code === 5415) {
      console.log('\nVariant already exists, updating...');
      const updateResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            options: {
              fit: 'scale-down',
              metadata: 'none',
              quality: 100
            },
            neverRequireSignedURLs: true
          })
        }
      );
      const updateData = await updateResponse.json();
      if (updateData.success) {
        console.log('✅ Updated "full" variant');
      } else {
        console.log('Update error:', updateData.errors);
      }
    }
  }
}

createVariant();
