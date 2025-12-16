#!/usr/bin/env node
/**
 * Generate gpu-cli credentials file from environment variables
 *
 * This script creates a keychain JSON file that gpu-cli can use
 * when GPU_TEST_KEYCHAIN_FILE is set (for containerized deployments)
 *
 * Required env vars:
 *   RUNPOD_API_KEY - Your RunPod API key (starts with rpa_)
 *
 * Optional env vars:
 *   GPU_SSH_PRIVATE_KEY - Pre-generated SSH private key (OpenSSH format)
 *   GPU_SSH_PUBLIC_KEY - Pre-generated SSH public key
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEYCHAIN_FILE = process.env.GPU_TEST_KEYCHAIN_FILE || '/app/data/.gpu-keychain.json';
const NAMESPACE = 'gpu-cli';

function generateSshKeypair() {
    // Generate Ed25519 keypair using ssh-keygen
    const tmpDir = '/tmp/gpu-ssh-keys';
    const privateKeyPath = path.join(tmpDir, 'id_ed25519');
    const publicKeyPath = path.join(tmpDir, 'id_ed25519.pub');

    // Clean up any existing keys
    if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });

    // Generate keypair
    execSync(`ssh-keygen -t ed25519 -f ${privateKeyPath} -N "" -q`, {
        stdio: 'pipe'
    });

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();

    // Clean up
    fs.rmSync(tmpDir, { recursive: true });

    return { privateKey, publicKey };
}

function main() {
    const apiKey = process.env.RUNPOD_API_KEY;

    if (!apiKey) {
        console.error('Error: RUNPOD_API_KEY environment variable is required');
        process.exit(1);
    }

    if (!apiKey.startsWith('rpa_')) {
        console.error('Error: RUNPOD_API_KEY must start with "rpa_"');
        process.exit(1);
    }

    console.log('Setting up gpu-cli credentials...');

    // Get or generate SSH keys
    let privateKey = process.env.GPU_SSH_PRIVATE_KEY;
    let publicKey = process.env.GPU_SSH_PUBLIC_KEY;

    if (!privateKey || !publicKey) {
        console.log('Generating SSH keypair...');
        const keys = generateSshKeypair();
        privateKey = keys.privateKey;
        publicKey = keys.publicKey;
    } else {
        console.log('Using provided SSH keys from environment');
    }

    // Create GlobalCredentials structure
    const credentials = {
        version: 1,
        ssh_private_key: privateKey,
        ssh_public_key: publicKey,
        providers: {
            runpod: {
                RunPod: {
                    api_key: apiKey,
                    default_region: null,
                    cost_limit_per_hour: null
                }
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
        mode: 0o600  // Restrictive permissions
    });

    console.log(`Credentials written to ${KEYCHAIN_FILE}`);
    console.log(`API Key: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`);
    console.log(`SSH Public Key: ${publicKey.substring(0, 40)}...`);
}

main();
