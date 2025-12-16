#!/bin/bash
set -e

echo "Starting Gaze App..."

# Set up data directories
mkdir -p /app/data/uploads /app/data/jobs 2>/dev/null || true

# Symlink data directories if using mounted volume
if [ -d "/app/data" ]; then
    rm -rf /app/uploads /app/jobs 2>/dev/null || true
    ln -sf /app/data/uploads /app/uploads
    ln -sf /app/data/jobs /app/jobs
fi

# Set up gpu-cli credentials from environment variables
if [ -n "$RUNPOD_API_KEY" ]; then
    echo "RUNPOD_API_KEY found, configuring gpu-cli..."

    # Set keychain file location
    export GPU_TEST_KEYCHAIN_FILE="/app/data/.gpu-keychain.json"

    # Generate credentials file
    node /app/scripts/setup-gpu-credentials.js

    # Start gpu daemon
    echo "Starting gpu daemon..."
    gpu daemon start || echo "Note: Daemon may need a moment to initialize"

    # Wait for daemon to be ready
    sleep 2

    echo "gpu-cli configured successfully"
else
    echo "Warning: RUNPOD_API_KEY not set. GPU features will not work."
    echo "Set it with: fly secrets set RUNPOD_API_KEY=rpa_your_key_here"
fi

# Start the Node.js server
echo "Starting Node.js server on port ${PORT:-3000}..."
exec node server.js
