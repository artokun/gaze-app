#!/usr/bin/env node
/**
 * Upload demo images to Cloudflare Images with proper IDs
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;

if (!accountId || !apiToken) {
  console.error('Missing CF_ACCOUNT_ID or CF_API_TOKEN');
  process.exit(1);
}

const DEMO_DIR = path.join(__dirname, '../public/demo');
const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;

// Files to upload with their custom IDs
const FILES = [
  { file: 'input.jpg', id: 'demo/input' },
  { file: 'q0.webp', id: 'demo/q0' },
  { file: 'q1.webp', id: 'demo/q1' },
  { file: 'q2.webp', id: 'demo/q2' },
  { file: 'q3.webp', id: 'demo/q3' },
  { file: 'q0_20.webp', id: 'demo/q0_20' },
  { file: 'q1_20.webp', id: 'demo/q1_20' },
  { file: 'q2_20.webp', id: 'demo/q2_20' },
  { file: 'q3_20.webp', id: 'demo/q3_20' },
];

async function deleteExisting(imageId) {
  try {
    const response = await fetch(`${API_BASE}/${imageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    if (response.ok) {
      console.log(`  Deleted existing: ${imageId}`);
    }
  } catch (err) {
    // Ignore - might not exist
  }
}

async function uploadImage(filePath, customId) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Create form data
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: getContentType(fileName) });
  formData.append('file', blob, fileName);
  formData.append('id', customId);

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}` },
    body: formData
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'Upload failed');
  }

  return data.result;
}

function getContentType(filename) {
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function main() {
  console.log('Uploading demo images to Cloudflare Images...\n');

  for (const { file, id } of FILES) {
    const filePath = path.join(DEMO_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping ${file} - file not found`);
      continue;
    }

    console.log(`📤 Uploading ${file} as "${id}"...`);

    // Delete existing if any
    await deleteExisting(id);

    try {
      const result = await uploadImage(filePath, id);
      console.log(`   ✅ Uploaded: ${result.id}`);
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
    }
  }

  console.log('\n✨ Done! Demo images are now available at:');
  console.log(`   https://imagedelivery.net/${process.env.CF_ACCOUNT_HASH}/demo/{filename}/public`);
}

main().catch(console.error);
