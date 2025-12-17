#!/usr/bin/env node
require('dotenv').config();

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;

async function listVariants() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants`,
    { headers: { 'Authorization': `Bearer ${apiToken}` } }
  );

  const data = await response.json();

  if (data.success) {
    console.log('Available variants:\n');
    Object.entries(data.result.variants).forEach(([name, config]) => {
      console.log(`  ${name}:`);
      console.log(`    width: ${config.options?.width || 'auto'}`);
      console.log(`    height: ${config.options?.height || 'auto'}`);
      console.log(`    fit: ${config.options?.fit || 'default'}`);
      console.log(`    quality: ${config.options?.quality || 'default'}`);
      console.log('');
    });
  } else {
    console.log('Error:', data.errors);
  }
}

listVariants();
