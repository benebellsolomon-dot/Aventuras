r"""Download xinsir SDXL OpenPose ControlNet into ComfyUI/models/controlnet (D: drive)."""
import os
import shutil

os.environ.setdefault("HF_HOME", r"D:\LLM\hf_cache")
from huggingface_hub import hf_hub_download, list_repo_files  # noqa: E402

REPO = "xinsir/controlnet-openpose-sdxl-1.0"
DEST_DIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\models\controlnet"
DEST_NAME = "controlnet-openpose-sdxl-xinsir.safetensors"

files = list_repo_files(REPO)
print("repo files:", files)
safes = [f for f in files if f.endswith(".safetensors")]
print("safetensors:", safes)

# prefer an fp16 variant if present (smaller), else the main model file
pick = None
for f in safes:
    if "fp16" in f.lower():
        pick = f
        break
if pick is None:
    # main diffusers model file
    for f in safes:
        if "diffusion_pytorch_model" in f:
            pick = f
            break
if pick is None and safes:
    pick = safes[0]
if pick is None:
    raise SystemExit("no safetensors found in repo")
print("picking:", pick)

path = hf_hub_download(repo_id=REPO, filename=pick)
print("downloaded to cache:", path)

os.makedirs(DEST_DIR, exist_ok=True)
dest = os.path.join(DEST_DIR, DEST_NAME)
shutil.copy(path, dest)
print("COPIED ->", dest, "size MB", round(os.path.getsize(dest) / 1024 / 1024, 1))
