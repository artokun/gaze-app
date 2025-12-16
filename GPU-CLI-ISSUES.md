# GPU-CLI Issues & Debugging Notes

Tracking issues encountered while integrating gpu-cli with gaze-app.

---

## Issue 1: Agent Segmentation Fault on Ubuntu 24.04 Image

**Date:** 2025-12-16

**Base Image:** `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`

**Error:**

```
stderr=bash: line 1:   108 Segmentation fault      GPU_PROVIDER=runpod nohup /usr/local/bin/gpu-pod-agent /tmp/gpu-agent.sock > /gpu-cli-workspaces/gaze-app/.gpu-local/agent.log 2>&1
```

**Context:**

- Pod was successfully provisioned (pod_id: n9kwj3lwx2qw2n)
- SSH connection established successfully
- Agent binary uploaded to `/usr/local/bin/gpu-pod-agent`
- Agent crashes immediately on startup with segfault

**Daemon Logs:**

```
2025-12-16T05:26:38.615544Z  INFO gpud::output_monitor: Agent start command result pod_id=n9kwj3lwx2qw2n exit_code=0 stdout= stderr=bash: line 1:   108 Segmentation fault      GPU_PROVIDER=runpod nohup /usr/local/bin/gpu-pod-agent /tmp/gpu-agent.sock > /gpu-cli-workspaces/gaze-app/.gpu-local/agent.log 2>&1
```

**Workaround:** Switched to `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`

**Suspected Cause:** The gpu-pod-agent binary may be compiled for an older glibc version incompatible with Ubuntu 24.04.

---

## Issue 2: RTX 5090 GPU Type Not Found

**Date:** 2025-12-16

**Requested GPU:** `NVIDIA GeForce RTX 5090`

**Observation:** In daemon logs, RTX 5080 appears in warnings but RTX 5090 is not listed. The pod was still provisioned, suggesting it may have fallen back to a different GPU or the 5090 isn't available yet on RunPod.

**Daemon Log Excerpt:**

```
2025-12-16T05:26:05.272532Z  WARN gpu_core::providers::runpod::client: Unknown RunPod GPU name (not in mapping): NVIDIA GeForce RTX 5080
```

**Note:** RTX 5090 may not be widely available on RunPod yet.

---

## Useful Commands for Debugging

```bash
# Check daemon logs
gpu daemon logs -f

# Check daemon status
gpu daemon status

# List jobs
gpu jobs

# Check pod status
gpu status

# Force stop pod
gpu stop --force

# Restart daemon
gpu daemon restart
```

---

## Issue 3: Shell Steps in gpu.toml Not Executed

**Date:** 2025-12-16

**Expectation:** Shell steps defined in `[environment.shell]` with `only_once = true` should run automatically on first pod setup.

**Configuration:**

```toml
[environment.shell]
steps = [
    { run = "[ -d /workspace/LivePortrait ] || git clone https://github.com/KwaiVGI/LivePortrait.git /workspace/LivePortrait", only_once = true },
    { run = "cd /workspace/LivePortrait && pip install -e .", only_once = true },
]
```

**Actual Behavior:** LivePortrait was not cloned. Had to manually run `gpu shell --command "git clone ..."` to install.

**Workaround:** Manually ran:

```bash
gpu shell --command "git clone https://github.com/KwaiVGI/LivePortrait.git /workspace/LivePortrait"
gpu shell --command "cd /workspace/LivePortrait && pip install -r requirements.txt"
```

**Status:** Need to investigate if shell steps are supported or if syntax is incorrect.

---

## Issue 4: No GPU Inventory Command

**Date:** 2025-12-16

**Feature Request:** Would be helpful to have a command to list available GPUs and their current availability/pricing.

Something like:

```bash
gpu machines inventory    # List all available GPU types
gpu machines inventory --available  # Show only currently available
gpu machines inventory --region us-west  # Filter by region
```

Currently there's no way to discover what GPU types are available before specifying `gpu_type` in config.
It would be nice if there was an interactive region / GPU selector in the CLI on init as well as on demand

---

## Issue 5: Port Remapping Not Obvious

**Date:** 2025-12-16

**Observation:** When using `--publish 8080:8000`, the actual local port may be remapped if 8080 is unavailable.

**Log Message:**

```
[gpu]> Remote 8000 -> http://localhost:50907 (remapped)
```

**Suggestion:** Make the remapped port more visible or provide a way to query the actual forwarded port.

---

## Issue 6: Pod-Local Downloads Don't Persist Across Restarts

**Date:** 2025-12-16

**Problem:** Files downloaded directly to the pod (e.g., model weights from Hugging Face) are lost when the pod is stopped and recreated.

**Example Scenario:**
```bash
# Downloaded weights to pod
gpu shell --command "pip install huggingface_hub && python -c 'from huggingface_hub import snapshot_download; snapshot_download(...)'"

# Pod stopped
gpu stop

# New pod created - weights are gone!
gpu run python my_script.py  # Error: weights not found
```

**Root Cause:** Each `gpu stop` + `gpu run` cycle may provision a new pod. Files outside the synced workspace are lost.

**Workarounds:**
1. **Include weights in project**: Download locally, add to project, sync to pod (increases sync time but persists)
2. **Download on startup**: Add download logic to your Python code's startup (slower first request)
3. **Use gpu.toml outputs**: Configure outputs to sync weights back to local, then they'll sync back on next run

**Suggestion:** Add support for persistent storage or volume mounting in gpu.toml, e.g.:
```toml
[volumes]
models = { source = "hf://KlingTeam/LivePortrait", mount = "./pretrained_weights" }
```

---

## Issue 7: Dependency Installation Order / Transient Dependencies

**Date:** 2025-12-16

**Problem:** When using `pip_global` in gpu.toml, packages may be installed but then overwritten or removed by subsequent installations. For example, `huggingface_hub` was installed but then not available because the pod was reprovisioned.

**Suggestion:** Add `pip_global` packages to gpu.toml to ensure they're always installed:
```toml
{ name = "huggingface_hub" },  # For downloading model weights
```

---

## Issue 8: Model Weights Need Manual Download

**Date:** 2025-12-16

**Problem:** ML repositories like LivePortrait don't include model weights in the git repo (they're too large). They need to be downloaded separately from Hugging Face/Google Drive.

**What I Expected:** Some way to specify model downloads in gpu.toml
**What Actually Happened:** Had to manually run download commands on the pod, which then got lost on pod restart

**Current Workaround:** Download weights on pod startup in Python code:
```python
from huggingface_hub import snapshot_download
import os

weights_dir = os.path.join(os.path.dirname(__file__), 'pretrained_weights')
if not os.path.exists(os.path.join(weights_dir, 'liveportrait')):
    snapshot_download('KlingTeam/LivePortrait', local_dir=weights_dir)
```

**Suggestion:** Add Hugging Face integration to gpu.toml:
```toml
[models]
liveportrait = { repo = "KlingTeam/LivePortrait", path = "./lib/LivePortrait/pretrained_weights" }
```

---

## Issue 9: No `gpu sync from` Command - Outputs Are Daemon-Managed

**Date:** 2025-12-16

**Problem:** Tried to use `gpu sync from` to pull outputs from pod, but this command doesn't exist.

**Error:**
```
error: unrecognized subcommand 'sync'
  tip: a similar subcommand exists: 'sync-status'
```

**Actual Behavior:** Outputs are "daemon-managed" - they sync automatically in the background based on patterns in `gpu.toml`.

**Solution:** Don't call any sync command. Instead:
1. Ensure `outputs` pattern in gpu.toml covers your output files
2. Write outputs to the **project workspace directory** (not `/workspace/`)
3. Poll for files to appear locally

**Important:** Your pod code must write to the project directory, not `/workspace/`:
```python
# CORRECT - uses script directory (syncs back)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
output_dir = os.path.join(SCRIPT_DIR, "jobs", session_id)

# WRONG - writes outside synced workspace (won't sync)
output_dir = f"/workspace/jobs/{session_id}"
```

---

## Issue 10: Port Conflicts When Restarting Servers

**Date:** 2025-12-16

**Problem:** When running a long-lived server (like FastAPI) via `gpu run`, previous jobs may still be running and holding ports, causing "address already in use" errors on restart.

**Symptoms:**
```
ERROR:    [Errno 98] error while attempting to bind on address ('0.0.0.0', 8000): address already in use
INFO:     Application shutdown complete.
[gpu]> | status  : ERR (exit 1)
```

**Root Cause:** Jobs are "daemon-managed" and persist even after the `gpu run` command exits. If you run `gpu run` again, the old server may still be bound to the port.

**Solution:** Stop the pod before starting a new server:
```bash
gpu stop --force --no-sync
```

**Important Flags:**
- `--force` or `-f`: Skip confirmation prompt (required for non-interactive/programmatic use)
- `--no-sync`: Skip syncing outputs before stopping (faster)

**In Node.js:**
```javascript
const { execSync } = require('child_process');

// Stop any existing jobs first
try {
    execSync('gpu stop --force --no-sync', { timeout: 60000, stdio: 'pipe' });
} catch (e) {
    // Ignore - might not have any running jobs
}

// Then start new server with --force-sync to ensure latest code
spawn('gpu', ['run', '--force-sync', '--publish', '8080:8000', 'python', 'server.py']);
```

**Alternative Approach:** Make your server handle port conflicts gracefully:
```python
# Python - try alternate ports
import socket

def find_free_port(start_port=8000):
    for port in range(start_port, start_port + 100):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(('0.0.0.0', port))
            s.close()
            return port
        except OSError:
            continue
    raise RuntimeError("No free ports found")
```

---

## Issue 11: `gpu stop` Requires Interactive Confirmation

**Date:** 2025-12-16

**Problem:** Running `gpu stop` from a non-terminal environment (like a Node.js child process) fails with:
```
Failed to get confirmation: IO error: not a terminal
```

**Solution:** Use `--force` flag to skip confirmation:
```bash
gpu stop --force
```

**Note:** This flag is undocumented in the main help but visible via `gpu stop --help`.

---

## Issue 12: Daemon-Managed Output Sync Unreliable

**Date:** 2025-12-16

**Problem:** The daemon-managed output sync often fails to sync files back from the pod, even when:
- Output patterns in gpu.toml are correct
- Files are written to the correct project workspace directory
- `gpu sync-status` shows the sync as "active"

**Symptoms:**
- Files never appear locally despite generation completing on pod
- `gpu sync-status` shows sync happening but local directory remains empty
- Daemon logs show "output supervisor lookup failed" errors

**Example Daemon Logs:**
```
2025-12-16T06:33:14.463495Z  WARN gpud::output_monitor: output supervisor lookup failed pod_id=xyz error=Pod not found: xyz
```

**Root Cause:** The daemon's output monitor loses track of pods, possibly due to:
- Pod reprovisioning
- Connection timeouts
- Race conditions between job completion and sync initiation

**Workaround:** Implement HTTP fallback for file retrieval:

```python
# gaze_server.py - Add file serving endpoint
@app.get("/files/{session_id}/{filename}")
async def get_file(session_id: str, filename: str):
    file_path = Path(SCRIPT_DIR) / "jobs" / session_id / "output" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)
```

```javascript
// server.js - Try daemon sync, fall back to HTTP
const daemonSyncTimeout = 30000;
let waited = 0;
let synced = false;

while (waited < daemonSyncTimeout) {
    if (fs.existsSync(localPath)) { synced = true; break; }
    await sleep(2000);
    waited += 2000;
}

if (!synced) {
    // HTTP fallback
    const response = await axios.get(`${GPU_SERVER_URL}/files/${filename}`, {
        responseType: 'arraybuffer'
    });
    fs.writeFileSync(localPath, response.data);
}
```

**Suggestion:** Add explicit sync command or callback mechanism:
```bash
# Would be nice to have
gpu sync from --wait  # Block until sync complete
gpu sync from --timeout 60  # With timeout
```

Or a webhook/callback when sync completes.

---

## Issue 13: `gpu status` Command Not Implemented

**Date:** 2025-12-16

**Problem:** Running `gpu status` returns an error:
```
✗ Error: Not implemented: status
```

**Workaround:** Use alternative commands:
```bash
gpu daemon status    # Check daemon status
gpu sync-status      # Check sync status
gpu jobs             # List jobs
```

---

## Configuration That Works

```toml
# gpu.toml
project_id = "my-project"
provider = "runpod"
encryption = false

gpu_type = "NVIDIA GeForce RTX 4090"

# Keep pod warm for 10 minutes (default is 5)
cooldown_minutes = 10

# Outputs to sync back (daemon-managed, no manual sync needed)
outputs = ["jobs/*/output/"]

[environment]
base_image = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"

# System packages
[environment.system]
apt = [
    { name = "git" },
    { name = "ffmpeg" },
]

# Python packages (include huggingface_hub for model downloads)
[environment.python]
package_manager = "pip"
allow_global_pip = true
pip_global = [
    { name = "torch" },
    { name = "huggingface_hub" },
]
```
