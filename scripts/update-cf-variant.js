#!/usr/bin/env node
require('dotenv').config();

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;

async function updateVariant() {
  // Update "full" variant with large dimensions so images won't be resized
  // CF Images won't upscale, so original dimensions will be preserved
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants/full`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        options: {
          fit: 'scale-down',
          width: 9999,
          height: 9999,
          metadata: 'none'
        },
        neverRequireSignedURLs: true
      })
    }
  );

  const data = await response.json();

  if (data.success) {
    console.log('✅ Updated "full" variant:');
    console.log(JSON.stringify(data.result, null, 2));
  } else {
    console.log('Error:', data.errors);
  }
}

updateVariant();
