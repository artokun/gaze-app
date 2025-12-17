#!/usr/bin/env node
/**
 * List all images in Cloudflare Images
 */

require('dotenv').config();

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;

if (!accountId || !apiToken) {
  console.log('Missing environment variables:');
  console.log('  CF_ACCOUNT_ID:', accountId ? 'set' : 'NOT SET');
  console.log('  CF_API_TOKEN:', apiToken ? 'set' : 'NOT SET');
  process.exit(1);
}

async function listImages() {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      }
    );

    const data = await response.json();

    if (data.success) {
      console.log(`\nFound ${data.result.images.length} images:\n`);

      // Group by session/prefix
      const grouped = {};
      data.result.images.forEach(img => {
        const parts = img.id.split('/');
        const prefix = parts.length > 1 ? parts[0] : 'root';
        if (!grouped[prefix]) grouped[prefix] = [];
        grouped[prefix].push(img);
      });

      Object.keys(grouped).sort().forEach(prefix => {
        console.log(`📁 ${prefix}/`);
        grouped[prefix].forEach(img => {
          const name = img.id.split('/').slice(1).join('/') || img.id;
          console.log(`   - ${name} (${img.filename || 'uploaded'})`);
        });
        console.log('');
      });
    } else {
      console.log('API Error:', data.errors);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

listImages();
