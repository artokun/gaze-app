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

# Set up gpu-cli credentials from env vars
if [ -n "$GPU_RUNPOD_API_KEY" ]; then
    echo "Setting up gpu-cli credentials..."
    node /app/scripts/setup-gpu-credentials.js
fi

# Start gpu daemon
echo "Starting gpu daemon..."
gpu daemon start || echo "Note: Daemon may need a moment to initialize"
sleep 2

# Check authentication status
echo "Checking gpu-cli auth..."
gpu auth status || true

# Start the Node.js server
echo "Starting Node.js server on port ${PORT:-3000}..."
exec node server.js
