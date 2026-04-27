# Custom ComfyUI Worker — Build & Deploy

## What this is
A custom Runpod serverless worker image that:
- Extends `runpod-workers/worker-comfyui:5.8.5-base` (official, battle-tested handler)
- Bakes in the 4 custom node packages David's locked InfiniteTalk workflow needs
- Reads models from the existing Network Volume `tech-that-pays-v2` (`hxrjnm1wvk`)

## Why this exists
- `runpod-workers/worker-comfyui` alone: no custom nodes
- `wlsdml1114/InfiniteTalk_Runpod_hub`: maintainer admits it's broken (issues #15-17)
- This: David's exact stack, no third-party bugs, full control

## Build sequence (autonomous via API once you provide creds)

### What you provide (one-time, ~3 min)
1. Docker Hub username
2. Docker Hub Personal Access Token (Account Settings → Security → New Access Token, "Read & Write" scope)

### What I run
1. Deploy a CPU-only Runpod pod with kaniko-style build script as `dockerStartCmd`
2. Pod fetches Dockerfile + yaml from catbox URLs
3. Kaniko (daemonless image builder) builds the image and pushes to `your-username/tech-that-pays-comfyui:v1`
4. I poll the pod for build completion (markers written to `/workspace/BUILD_*`)
5. Once pushed, I update Runpod endpoint `ctzclier9wdzdy` to use the new image
6. Run smoke test with `infinitetalk_landscape_832x480_API.json`

### Expected costs
- CPU pod (cpu3c): $0.04/hr × ~1 hr build = ~$0.04
- Docker Hub: free tier, no charge
- Runpod endpoint pull on first cold start: free, ~3 min added to first render

### Expected timeline
- Build pod boot + image pull: ~2 min
- Layer-by-layer build (4 git clones + pip installs): ~15-25 min
- Push 5-10GB to Docker Hub: ~10-30 min depending on pod's upload speed
- Endpoint update + smoke test: ~5 min
- **Total: ~30-60 min unattended**

## File map
- `Dockerfile` — the image recipe
- `extra_model_paths.yaml` — copied into image at `/comfyui/extra_model_paths.yaml`; tells ComfyUI to read models from the NV mount
- This README

## Testing the image after push
A successful smoke test response from Runpod runsync looks like:
```json
{
  "delayTime": 12345,
  "executionTime": 45678,
  "id": "sync-...",
  "status": "COMPLETED",
  "output": {
    "message": "data:video/mp4;base64,...",
    "status": "success"
  }
}
```

If it FAILS with a custom-node error → the git clone of that node failed during build (network glitch). Just re-run the build.

If it FAILS with a model-not-found error → either the NV isn't attached to the endpoint, or the model file path doesn't match `extra_model_paths.yaml`. Verify with the inspect script.

## Iterating later
To add a custom node, model URL, or update something:
1. Edit `Dockerfile`
2. Re-upload to catbox, re-deploy build pod with new Dockerfile URL
3. Push as `:v2` tag
4. Update endpoint to point at `:v2`

Total per-iteration cost: ~$0.04 + build time.
