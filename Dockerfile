# Tech That Pays V2 — Custom ComfyUI worker image
# Extends the official runpod-workers/worker-comfyui base, adds the 4 custom node
# packages David's locked InfiniteTalk workflow needs. Models stay on the Runpod
# Network Volume `tech-that-pays-v2` (id hxrjnm1wvk) mounted at /runpod-volume,
# accessed via extra_model_paths.yaml.

FROM runpod/worker-comfyui:5.8.5-base

# Install custom nodes for the InfiniteTalk pipeline.
# Each is shallow-cloned then has its requirements.txt installed.
WORKDIR /comfyui/custom_nodes

# KJNodes — covers PathchSageAttentionKJ, ImageResizeKJv2
RUN git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git && \
    pip install --no-cache-dir -r ComfyUI-KJNodes/requirements.txt

# WanVideoWrapper — covers AudioEncoderEncode, AudioEncoderLoader, ModelPatchLoader
RUN git clone --depth 1 https://github.com/kijai/ComfyUI-WanVideoWrapper.git && \
    pip install --no-cache-dir -r ComfyUI-WanVideoWrapper/requirements.txt

# InfiniteTalk — covers InfiniteTalkAutoSampler
# Try MeiGen-AI's repo first; if it 404s, fall back to wlsdml1114's fork.
RUN (git clone --depth 1 https://github.com/MeiGen-AI/ComfyUI-InfiniteTalk.git || \
     git clone --depth 1 https://github.com/wlsdml1114/ComfyUI-InfiniteTalk.git) && \
    if [ -f ComfyUI-InfiniteTalk/requirements.txt ]; then \
        pip install --no-cache-dir -r ComfyUI-InfiniteTalk/requirements.txt; \
    fi

# MelBandRoFormer — covers MelBandRoFormerModelLoader, MelBandRoFormerSampler
RUN git clone --depth 1 https://github.com/kijai/ComfyUI-MelBandRoFormer.git && \
    if [ -f ComfyUI-MelBandRoFormer/requirements.txt ]; then \
        pip install --no-cache-dir -r ComfyUI-MelBandRoFormer/requirements.txt; \
    fi

# Point ComfyUI at the Network Volume's models dir (mounted at runtime by Runpod)
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# Reset working dir so the base image's CMD/ENTRYPOINT works unchanged
WORKDIR /
