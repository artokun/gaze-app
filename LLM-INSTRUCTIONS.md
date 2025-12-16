# GPU CLI - LLM Instructions

This document provides instructions for LLMs to help users with the GPU CLI tool.

## Overview

GPU CLI is a command-line tool that makes running code on remote GPUs as simple as prefixing commands with `gpu`. It handles pod provisioning, file synchronization, and output streaming automatically.

**Key concept**: Transform local commands to remote GPU execution:
```bash
# Local execution
uv run python train.py

# Remote GPU execution (just add "gpu run")
gpu run uv run python train.py
```

## Quick Reference

### Most Common Commands

| Command | Purpose |
|---------|---------|
| `gpu run <command>` | Execute code on remote GPU |
| `gpu shell` | Open interactive SSH shell to pod |
| `gpu jobs` | List running/completed jobs |
| `gpu logs <job-id>` | View job logs |
| `gpu stop` | Stop active pod |
| `gpu dashboard` | Launch interactive TUI monitor |

### First-Time Setup

```bash
# 1. Authenticate with cloud provider (interactive)
gpu auth login

# 2. Initialize project (from project directory)
cd my-project
gpu init

# 3. Run your first command
gpu run python hello.py
```

## Command Reference

### Execution Commands

#### `gpu run <command>`
Execute code on a remote GPU. This is the primary command.

**Basic usage:**
```bash
gpu run python train.py
gpu run python train.py --epochs 100
gpu run uv run pytest tests/
```

**Key options:**
| Option | Description |
|--------|-------------|
| `--attach` | Reattach to a running job |
| `--detach` | Submit job and return immediately (background) |
| `--interactive` | Enable interactive mode (stdin forwarding) |
| `--gpu-type <TYPE>` | Specify GPU (e.g., "RTX 4090", "A100") |
| `--gpu-count <N>` | Number of GPUs (default: 1) |
| `--fresh` | Force new pod creation |
| `--rebuild` | Rebuild Docker image |
| `-p, --publish <ports>` | Port forwarding (e.g., `-p 8080:8080`) |
| `--outputs <patterns>` | Override output patterns to sync back |
| `--env KEY=VALUE` | Set environment variable |
| `--workdir <path>` | Set working directory on pod |

**Examples:**
```bash
# Basic execution
gpu run python train.py

# With specific GPU
gpu run --gpu-type "NVIDIA A100" python train.py

# Background job
gpu run --detach python long_training.py

# Reattach to running job
gpu run --attach abc123

# Port forwarding for web servers
gpu run -p 8080:8080 python server.py

# Interactive Python session
gpu run --interactive python

# Force fresh pod (ignore cached)
gpu run --fresh python train.py

# Override output sync patterns
gpu run --outputs "models/,results/*.json" python train.py
```

#### `gpu shell`
Open an interactive SSH shell to the active pod.

```bash
gpu shell                    # Interactive shell
gpu shell --command "ls -la" # Run single command
```

### Job Management

#### `gpu jobs`
List running and completed jobs.

```bash
gpu jobs              # Show recent jobs
gpu jobs --all        # Show all jobs
gpu jobs --json       # JSON output
gpu jobs --status running  # Filter by status
```

#### `gpu logs <job-id>`
View logs from a job.

```bash
gpu logs abc123              # View logs
gpu logs abc123 --follow     # Stream logs (like tail -f)
gpu logs abc123 --tail 100   # Last 100 lines
gpu logs abc123 --timestamps # Include timestamps
gpu logs --project           # Show all project logs
```

#### `gpu cancel [job-id]`
Cancel a running job.

```bash
gpu cancel abc123     # Cancel specific job
gpu cancel            # Cancel current job (interactive)
gpu cancel --all      # Cancel all running jobs
gpu cancel --force    # Force cancel without confirmation
```

### Pod Management

#### `gpu start`
Start a pod manually (advanced users). Usually `gpu run` handles this automatically.

```bash
gpu start                           # Start with project defaults
gpu start --gpu-type "H100 PCIe"    # Specific GPU
gpu start --gpu-count 2             # Multi-GPU
gpu start --max-price 2.50          # Budget constraint ($/hr)
gpu start --min-vram 24             # Minimum VRAM (GB)
gpu start --cloud-type secure       # Only verified providers
gpu start --region eu-west          # Specific region
```

#### `gpu stop`
Stop the active pod.

```bash
gpu stop              # Stop with final sync
gpu stop --force      # Stop immediately
gpu stop --no-sync    # Skip final output sync
gpu stop --pod-id X   # Stop specific pod
```

#### `gpu machines`
Manage GPU machines.

```bash
gpu machines list              # List all machines
gpu machines show <pod-id>     # Show pod details
gpu machines terminate <id>    # Terminate specific machine
```

### Configuration

#### `gpu init`
Initialize a project for GPU CLI.

```bash
gpu init                    # Interactive initialization
gpu init --gpu-type "A100"  # Set default GPU
gpu init --encryption       # Enable LUKS encryption (Vast.ai)
gpu init --no-encryption    # Disable encryption (RunPod default)
gpu init --profile work     # Use specific profile
gpu init --force            # Reinitialize existing project
```

#### `gpu config`
Manage configuration.

```bash
gpu config show                        # Show current config
gpu config get outputs                 # Get specific value
gpu config set outputs '["results/"]'  # Set value
gpu config validate                    # Validate configuration
gpu config set-profile work            # Switch profile
```

#### `gpu status`
Show project initialization status and current configuration.

```bash
gpu status
```

### Authentication

#### `gpu auth login`
Authenticate with cloud provider.

```bash
gpu auth login                    # Interactive login
gpu auth login --profile work     # Login to specific profile
gpu auth login --generate-ssh-keys # Generate new SSH keys
```

#### `gpu auth logout`
Remove stored credentials.

```bash
gpu auth logout         # Logout from default profile
gpu auth logout --force # Force logout without confirmation
```

#### `gpu auth status`
Check authentication status.

```bash
gpu auth status
```

#### `gpu auth key`
Display your SSH public key (for adding to cloud provider).

```bash
gpu auth key
gpu auth key --profile work
```

#### `gpu auth keygen`
Regenerate SSH keypair.

```bash
gpu auth keygen           # Regenerate default keys
gpu auth keygen --force   # Force regeneration
```

### Profiles

Profiles allow multiple cloud provider accounts or configurations.

```bash
gpu profile list              # List all profiles
gpu profile list --detailed   # Show detailed info
gpu profile use work          # Switch to 'work' profile
gpu profile remove old        # Remove a profile
```

### Monitoring

#### `gpu dashboard`
Launch interactive TUI dashboard for real-time monitoring.

```bash
gpu dashboard
```

**Dashboard keybindings:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Navigate down |
| `k` / `↑` | Navigate up |
| `Tab` | Switch panel |
| `Enter` | Expand / View logs |
| `Esc` | Back / Close |
| `a` | Attach to job |
| `c` | Cancel job |
| `s` | Stop pod |
| `e` | Events view |
| `?` | Help |
| `q` | Quit |

#### `gpu sync-status`
Show status of ongoing file synchronization operations.

```bash
gpu sync-status
```

### Daemon Management

The daemon maintains persistent connections for faster execution.

```bash
gpu daemon status    # Check daemon status
gpu daemon start     # Start daemon
gpu daemon stop      # Stop daemon
gpu daemon restart   # Restart daemon
gpu daemon logs      # View daemon logs
gpu daemon logs -f   # Follow daemon logs
```

### File Management

#### `gpu files`
Show which files will be synced to the pod.

```bash
gpu files             # List files to sync
gpu files --detailed  # Show detailed info (sizes, etc.)
```

### Updates

```bash
gpu update            # Update to latest version
gpu update --check    # Check for updates without installing
```

## Configuration Files

### gpu.toml (Project Configuration)

Create in project root:

```toml
# Project identifier (auto-detected from git/directory)
project_id = "my-ml-project"

# Cloud provider: runpod, vast.ai, docker
provider = "runpod"

# LUKS encryption (false for RunPod, true for Vast.ai)
encryption = false

# Default GPU type
gpu_type = "NVIDIA A100"

# Files/directories to sync back from pod
outputs = [
    "results/",
    "models/",
    "logs/",
    "*.png",
    "*.json"
]

# Keychain profile (optional)
profile = "default"

# Environment configuration
[environment]
base_image = "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel"

# System packages (installed via apt)
[environment.system]
apt = [
    { name = "git" },
    { name = "ffmpeg" },
    { name = "libgl1-mesa-glx" },  # For OpenCV
]

# Python packages
[environment.python]
package_manager = "pip"  # or "uv"
pip_global = [
    { name = "torch" },
    { name = "numpy" },
    { name = "transformers" },
    { name = "huggingface_hub" },  # For downloading model weights
]
allow_global_pip = true
```

### pyproject.toml Integration

GPU CLI can also read configuration from `pyproject.toml`:

```toml
[tool.gpu]
outputs = ["results/", "models/"]
encryption = false
gpu_type = "RTX 4090"
```

### File Sync Rules

**TO pod (upload):**
- Controlled by `.gitignore`
- Files in `.gitignore` are NOT synced to pod
- Useful for excluding large datasets, virtual environments, etc.
- **All project files sync automatically** - no need to use `/workspace` paths
- Put dependencies in project subdirectories (e.g., `lib/`) and they will sync
- The sync state is tracked in `.gpu/sync-state.json`

**Example: Adding a library dependency**
```bash
# Clone a library into your project - it will auto-sync to pod
mkdir -p lib
git clone https://github.com/example/my-lib.git lib/my-lib

# Reference it in your Python code using relative paths
import sys
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, 'lib', 'my-lib'))
```

**FROM pod (download):**
- Controlled by `outputs` in `gpu.toml`
- ONLY files matching output patterns are synced back
- Example: `outputs = ["results/", "models/*.pt"]`

## Common Workflows

### Workflow 1: Simple Script Execution
```bash
cd my-project
gpu run python train.py
# Results automatically sync back to local machine
```

### Workflow 2: Interactive Development
```bash
# Option A: Interactive Python
gpu run --interactive python

# Option B: Full SSH shell
gpu shell
```

### Workflow 3: Long-Running Training
```bash
# Submit background job
gpu run --detach python long_training.py

# Check status
gpu jobs

# View logs
gpu logs <job-id> --follow

# Reattach when needed
gpu run --attach <job-id>
```

### Workflow 4: Pre-warm Pod for Multiple Jobs
```bash
# Start pod in advance (saves 5-15 min on first command)
gpu start --gpu-type "H100 PCIe"

# Run multiple jobs on same pod
gpu run python experiment1.py
gpu run python experiment2.py
gpu run python experiment3.py

# Stop when done
gpu stop
```

### Workflow 5: Web Server / API
```bash
# Start server with port forwarding
gpu run -p 8080:8080 python server.py

# Access at http://localhost:8080
```

### Workflow 6: Jupyter Notebook
```bash
# Start Jupyter with port forwarding
gpu run -p 8888:8888 jupyter notebook --ip=0.0.0.0 --port=8888

# Open http://localhost:8888 in browser
```

### Workflow 7: Multi-GPU Training
```bash
gpu run --gpu-count 4 torchrun --nproc_per_node=4 train.py
```

## GPU Types

Common GPU types (availability varies by provider):

| GPU | VRAM | Best For |
|-----|------|----------|
| RTX 4090 | 24GB | Development, small models |
| RTX 3090 | 24GB | Budget option |
| A100 40GB | 40GB | Large models, training |
| A100 80GB | 80GB | Very large models |
| H100 PCIe | 80GB | Latest generation, fastest |
| H100 SXM | 80GB | Highest performance |

**Specify GPU:**
```bash
gpu run --gpu-type "NVIDIA A100" python train.py
gpu run --gpu-type "RTX 4090" python train.py
```

## Troubleshooting

### "No pod available"
```bash
# Check authentication
gpu auth status

# Try starting pod manually with verbose output
gpu start -v

# Check daemon status
gpu daemon status
```

### "Connection refused"
```bash
# Restart daemon
gpu daemon restart

# Check SSH key is registered
gpu auth key
# Add this key to your cloud provider account
```

### "Files not syncing"
```bash
# Check what files will sync
gpu files --detailed

# Check .gitignore isn't excluding needed files
cat .gitignore

# Force full sync
gpu run --force-sync python script.py
```

### "Outputs not appearing locally"
```bash
# Check output patterns in gpu.toml
gpu config get outputs

# Update output patterns
gpu config set outputs '["results/", "models/", "*.png"]'
```

### "Pod keeps stopping"
```bash
# Pods auto-stop after 5 minutes of inactivity (configurable via cooldown_minutes)
# To keep alive longer, use the dashboard
gpu dashboard

# Or run an interactive shell
gpu shell

# Or increase cooldown in gpu.toml
cooldown_minutes = 10
```

### "Address already in use" (Port Conflicts)
When running long-lived servers (FastAPI, Flask, etc.), old jobs may persist and hold ports:

```bash
# Stop all running jobs before starting a new server
gpu stop --force --no-sync

# Then start fresh with force-sync to ensure latest code
gpu run --force-sync -p 8080:8000 python server.py
```

**For programmatic use** (Node.js, Python subprocess), always stop first:
```javascript
const { execSync, spawn } = require('child_process');

// Stop any existing jobs (required for non-interactive use)
try {
    execSync('gpu stop --force --no-sync', { timeout: 60000 });
} catch (e) { /* ignore if no jobs running */ }

// Start new server with force-sync
spawn('gpu', ['run', '--force-sync', '-p', '8080:8000', 'python', 'server.py']);
```

**Key flags:**
- `--force` or `-f`: Skip confirmation prompt (required for non-interactive/automated use)
- `--no-sync`: Skip syncing outputs before stopping (faster)
- `--force-sync`: Force re-sync of all project files to pod (ensures latest code)

### "Wrong GPU type"
```bash
# Check current config
gpu config show

# Override for single run
gpu run --gpu-type "A100" python train.py

# Change default
gpu config set gpu_type "NVIDIA A100"
```

## Performance Tips

1. **Pre-warm pods**: Use `gpu start` before running multiple jobs to avoid startup latency

2. **Use detached mode**: For long jobs, use `--detach` to avoid connection issues

3. **Optimize .gitignore**: Exclude large files (datasets, venvs) from upload sync

4. **Specify outputs precisely**: Only sync back what you need to minimize download time

5. **Use the dashboard**: `gpu dashboard` provides real-time visibility into pod status

6. **Keep daemon running**: The daemon maintains connections for faster subsequent commands

## Security Notes

- **Credentials**: Stored in OS keychain (macOS Keychain, Linux Secret Service)
- **SSH**: Uses Ed25519 keys with host key verification
- **LUKS encryption**: Optional user-controlled encryption (Vast.ai only)
- **No config files**: No plaintext credentials in project directories
- **Per-project isolation**: Each project has separate keys in keychain

## Global Options

These options work with most commands:

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Increase output verbosity (use -vv or -vvv for more) |
| `-q, --quiet` | Minimal output (command output only) |
| `--progress-style <style>` | Progress display: panel, pipeline, minimal, verbose |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GPU_PROVIDER` | Override cloud provider (runpod, vast.ai, docker) |
| `GPU_PROFILE` | Override default profile |
| `GPU_LOG_LEVEL` | Set log level (trace, debug, info, warn, error) |
| `RUST_LOG` | Set tracing log level (trace, debug, info, warn, error) |
| `GPU_RUN_TIMEOUT` | Override command timeout in seconds |

## Additional Configuration Options

These gpu.toml options are available but less commonly needed:

### Pod Lifecycle
```toml
# Auto-stop cooldown in minutes (default: 5)
cooldown_minutes = 10

# Keep proxy listening after pod stop for auto-resume
persistent_proxy = true

# Seconds to wait for pod resume (default: 180)
resume_timeout_secs = 180
```

### Output Sync (Advanced)
```toml
# Patterns to EXCLUDE from output sync
exclude_outputs = ["*.tmp", "*.cache"]

# Enable/disable output syncing (default: true)
outputs_enabled = true
```

### Storage
```toml
# Workspace volume size in GB
workspace_size_gb = 50

# Storage mode: "built-in" (default), "network", "managed"
storage_mode = "built-in"
```

### Health Checks
```toml
# Paths that should NOT reset idle timer (prevents auto-stop on health checks)
health_check_paths = ["/health", "/healthz", "/ready", "/ping"]
```

## Daemon-Managed Output Sync

Outputs matching patterns in `gpu.toml` are **automatically synced** by the daemon. There is no `gpu sync from` command - syncing happens in the background.

**Important**: Your code must write outputs to the **project workspace directory** (where your code runs), not to `/workspace/`. Files outside the synced workspace won't be synced back.

```python
# CORRECT - writes to project directory, will sync
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
output_path = os.path.join(SCRIPT_DIR, "outputs", "result.json")

# WRONG - writes outside workspace, won't sync
output_path = "/workspace/outputs/result.json"
```

### CRITICAL: Output Sync Is Unreliable - Use HTTP Download Instead

**⚠️ DO NOT rely on daemon-managed output sync for production workloads.** The sync frequently fails, is slow, and unpredictable. Files may take 30+ seconds to appear or never sync at all.

**RECOMMENDED: Skip daemon sync entirely. Use HTTP download directly:**

1. **Add file serving endpoint** to your GPU-side server:
```python
# On GPU pod (FastAPI example)
@app.get("/files/{session_id}/{filename}")
async def get_file(session_id: str, filename: str):
    # Security: whitelist allowed files
    allowed = ['output.webp', 'result.json', 'metadata.json']
    if filename not in allowed:
        raise HTTPException(status_code=404)
    return FileResponse(f"jobs/{session_id}/{filename}")
```

2. **Download directly via HTTP** (skip daemon sync):
```javascript
// On local server - download files directly, no daemon sync
const expectedFiles = ['output.webp', 'metadata.json'];

for (const file of expectedFiles) {
    const response = await axios.get(
        `${GPU_SERVER_URL}/files/${sessionId}/${file}`,
        { responseType: 'arraybuffer', timeout: 120000 }
    );
    fs.writeFileSync(path.join(outputDir, file), response.data);
    console.log(`Downloaded ${file}`);
}
```

**Why HTTP is better:**
- ✅ Deterministic - you know exactly when files are downloaded
- ✅ No mysterious daemon state to debug
- ✅ Works reliably across pod reprovisioning
- ✅ Faster - no 30-second polling loops
- ✅ Easier to debug and monitor progress
- ❌ Daemon sync: unreliable, slow, hard to debug

## Getting Help

```bash
gpu --help           # General help
gpu run --help       # Help for specific command
gpu auth --help      # Help for command group
```
