#!/usr/bin/env node
/**
 * Generate gpu-cli credentials file from environment variables
 *
 * Required env vars (matching gpu-cli v0.2.14+):
 *   GPU_RUNPOD_API_KEY - Your RunPod API key (starts with rpa_)
 *
 * Optional env vars:
 *   GPU_SSH_PRIVATE_KEY - SSH private key (direct, file path, or base64)
 *   GPU_SSH_PUBLIC_KEY - SSH public key (direct, file path, or base64)
 *
 * If SSH keys are not provided, the script will:
 *   1. Preserve existing keys from the keychain file (if any)
 *   2. Let gpu-cli generate keys on first pod connection (if no existing keys)
 */

const fs = require('fs');
const path = require('path');

const KEYCHAIN_FILE = process.env.GPU_TEST_KEYCHAIN_FILE || '/app/data/.gpu-keychain.json';
const NAMESPACE = 'gpu-cli';

/**
 * Resolve SSH key from env var value
 * Supports: direct content, file path, or base64 encoded
 */
function resolveKey(value, name) {
    if (!value) return null;

    const trimmed = value.trim();

    // Direct key content
    if (trimmed.startsWith('-----BEGIN') || trimmed.startsWith('ssh-')) {
        return trimmed;
    }

    // File path
    if (trimmed.startsWith('/') || trimmed.startsWith('~')) {
        const expanded = trimmed.replace(/^~/, process.env.HOME || '/root');
        if (fs.existsSync(expanded)) {
            return fs.readFileSync(expanded, 'utf8').trim();
        }
    }

    // Base64 encoded
    try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
        if (decoded.startsWith('-----BEGIN') || decoded.startsWith('ssh-')) {
            return decoded;
        }
    } catch (e) {
        // Not valid base64
    }

    console.error(`Warning: Could not resolve ${name} - not a valid key, file path, or base64`);
    return null;
}

/**
 * Read existing credentials from keychain file
 */
function readExistingCredentials() {
    if (!fs.existsSync(KEYCHAIN_FILE)) {
        return null;
    }

    try {
        const keychainData = JSON.parse(fs.readFileSync(KEYCHAIN_FILE, 'utf8'));
        if (keychainData[NAMESPACE]?.credentials) {
            return JSON.parse(keychainData[NAMESPACE].credentials);
        }
    } catch (e) {
        console.error('Warning: Could not read existing keychain file:', e.message);
    }

    return null;
}

function main() {
    const apiKey = process.env.GPU_RUNPOD_API_KEY;
    const privateKeyRaw = process.env.GPU_SSH_PRIVATE_KEY;
    const publicKeyRaw = process.env.GPU_SSH_PUBLIC_KEY;

    if (!apiKey) {
        console.error('Error: GPU_RUNPOD_API_KEY environment variable is required');
        process.exit(1);
    }

    if (!apiKey.startsWith('rpa_')) {
        console.error('Error: GPU_RUNPOD_API_KEY must start with "rpa_"');
        process.exit(1);
    }

    console.log('Setting up gpu-cli credentials...');

    // Try to get SSH keys from environment first
    let privateKey = null;
    let publicKey = null;

    if (privateKeyRaw && publicKeyRaw) {
        privateKey = resolveKey(privateKeyRaw, 'GPU_SSH_PRIVATE_KEY');
        publicKey = resolveKey(publicKeyRaw, 'GPU_SSH_PUBLIC_KEY');

        if (privateKey && publicKey) {
            console.log('Using SSH keys from environment');
        }
    }

    // If no keys from env, try to preserve existing keys from keychain
    if (!privateKey || !publicKey) {
        const existingCreds = readExistingCredentials();
        if (existingCreds?.ssh_private_key && existingCreds?.ssh_public_key) {
            privateKey = existingCreds.ssh_private_key;
            publicKey = existingCreds.ssh_public_key;
            console.log('Preserving existing SSH keys from keychain');
        } else {
            console.log('No SSH keys found - gpu-cli will generate on first pod connection');
        }
    }

    // Create GlobalCredentials structure (matching gpu-cli format)
    // ProviderCredentials uses #[serde(tag = "type", rename_all = "snake_case")]
    const credentials = {
        version: 1,
        ssh_private_key: privateKey,
        ssh_public_key: publicKey,
        providers: {
            runpod: {
                type: "run_pod",
                api_key: apiKey
            }
        }
    };

    // Create keychain file structure
    const keychainData = {
        [NAMESPACE]: {
            credentials: JSON.stringify(credentials)
        }
    };

    // Ensure directory exists
    const keychainDir = path.dirname(KEYCHAIN_FILE);
    if (!fs.existsSync(keychainDir)) {
        fs.mkdirSync(keychainDir, { recursive: true });
    }

    // Write keychain file
    fs.writeFileSync(KEYCHAIN_FILE, JSON.stringify(keychainData, null, 2), {
        mode: 0o600
    });

    console.log(`Credentials written to ${KEYCHAIN_FILE}`);
    console.log(`API Key: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`);
    if (publicKey) {
        console.log(`SSH Public Key: ${publicKey.substring(0, 50)}...`);
    } else {
        console.log('SSH Keys: Will be generated on first pod connection');
    }
}

main();
