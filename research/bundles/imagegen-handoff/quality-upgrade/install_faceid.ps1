# Install IPAdapter FaceID stack into ComfyUI embedded python (D: caches; no opencv clobber).
$ErrorActionPreference = 'Continue'
$env:TMP = 'D:\temp'; $env:TEMP = 'D:\temp'; $env:PIP_CACHE_DIR = 'D:\temp\pip-cache'
New-Item -ItemType Directory -Force -Path 'D:\temp\pip-cache' | Out-Null
$py = 'D:\LLM\ComfyUI_windows_portable\python_embeded\python.exe'
$ip = 'D:\LLM\ComfyUI_windows_portable\ComfyUI\models\ipadapter'
$lo = 'D:\LLM\ComfyUI_windows_portable\ComfyUI\models\loras'
$whl = 'D:\temp\insightface-0.7.3-cp313-cp313-win_amd64.whl'

Write-Output "=== 1. download insightface wheel ==="
curl.exe -L -f --retry 3 -o $whl "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp313-cp313-win_amd64.whl"
Write-Output "wheel exit=$LASTEXITCODE size=$((Get-Item $whl).Length)"

Write-Output "=== 2. pip install runtime deps (onnxruntime onnx scikit-image) ==="
& $py -m pip install --no-warn-script-location onnxruntime onnx scikit-image
Write-Output "deps exit=$LASTEXITCODE"

Write-Output "=== 3. pip install insightface --no-deps ==="
& $py -m pip install --no-deps $whl
Write-Output "insightface exit=$LASTEXITCODE"

Write-Output "=== 4. download FaceID model + lora ==="
curl.exe -L -f --retry 3 -o "$ip\ip-adapter-faceid-plusv2_sdxl.bin" "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl.bin"
Write-Output "bin exit=$LASTEXITCODE"
curl.exe -L -f --retry 3 -o "$lo\ip-adapter-faceid-plusv2_sdxl_lora.safetensors" "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl_lora.safetensors"
Write-Output "lora exit=$LASTEXITCODE"

Write-Output "=== 5. verify imports ==="
& $py -c "import onnxruntime; print('onnxruntime', onnxruntime.__version__); from insightface.app import FaceAnalysis; print('insightface FaceAnalysis import OK')"
Write-Output "verify exit=$LASTEXITCODE"

Write-Output "=== sizes ==="
if (Test-Path "$ip\ip-adapter-faceid-plusv2_sdxl.bin") { "bin MB=" + [math]::Round((Get-Item "$ip\ip-adapter-faceid-plusv2_sdxl.bin").Length/1MB,1) }
if (Test-Path "$lo\ip-adapter-faceid-plusv2_sdxl_lora.safetensors") { "lora MB=" + [math]::Round((Get-Item "$lo\ip-adapter-faceid-plusv2_sdxl_lora.safetensors").Length/1MB,1) }
Write-Output "DONE"
