#!/usr/bin/env node
require('dotenv').config();

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;

async function recreateVariant() {
  // First try to delete the existing variant
  console.log('Deleting existing "full" variant...');
  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants/full`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiToken}` }
      }
    );
  } catch (e) {
    console.log('Delete failed (might not exist):', e.message);
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // Create new variant with large dimensions
  console.log('Creating new "full" variant with 9999x9999...');
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
    console.log('✅ Created "full" variant:');
    console.log(JSON.stringify(data.result, null, 2));
  } else {
    console.log('Error:', data.errors);
  }
}

recreateVariant();
