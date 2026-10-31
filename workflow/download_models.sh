#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMFYUI_ROOT="${COMFYUI_ROOT:-}"
if [[ -z "$COMFYUI_ROOT" && -d "$DEFAULT_ROOT/models" ]]; then COMFYUI_ROOT="$DEFAULT_ROOT"; fi
if [[ -z "$COMFYUI_ROOT" ]]; then
  read -r -p "请输入 ComfyUI 根目录（包含 models/ 的目录）: " COMFYUI_ROOT
fi
if [[ ! -d "$COMFYUI_ROOT" ]]; then echo "[错误] 目录不存在：$COMFYUI_ROOT" >&2; exit 1; fi

COMFYUI_ROOT="$(cd -- "$COMFYUI_ROOT" && pwd)"
MODEL_DIR="$COMFYUI_ROOT/models"
mkdir -p "$MODEL_DIR"

echo
echo "选择要准备的工作流模型："
echo "  1) T2V 文生视频 + I2V 首尾帧（共用 FL2VA 模型）"
echo "  2) 多参考生视频（REF2VA 模型）"
echo "  3) 三个工作流全部需要（下载 FL2VA + REF2VA）"
read -r -p "请选择 [1/2/3，默认 3]: " MODE
MODE="${MODE:-3}"
case "$MODE" in 1|2|3) ;; *) echo "[错误] 请输入 1、2 或 3。" >&2; exit 1 ;; esac

HF_REPO="Comfy-Org/MiniMax-H3"
export HF_HUB_DOWNLOAD_TIMEOUT="${HF_HUB_DOWNLOAD_TIMEOUT:-60}"
if command -v hf >/dev/null 2>&1; then
  HF_BIN="$(command -v hf)"
else
  PYTHON_BIN="${PYTHON_EXE:-python3}"
  command -v "$PYTHON_BIN" >/dev/null 2>&1 || { echo "[错误] 未找到 hf 或 python3。" >&2; exit 1; }
  HF_VENV="${XDG_CACHE_HOME:-$HOME/.cache}/minimax-h3-hf-cli"
  if [[ ! -x "$HF_VENV/bin/hf" ]]; then
    echo "[准备] 创建 Hugging Face CLI 环境：$HF_VENV"
    "$PYTHON_BIN" -m venv "$HF_VENV" || { echo "[错误] 请先安装 python3-venv。" >&2; exit 1; }
    "$HF_VENV/bin/python" -m pip install --upgrade pip huggingface_hub
  fi
  HF_BIN="$HF_VENV/bin/hf"
fi

if [[ -n "${HF_ENDPOINT:-}" ]]; then
  echo "[信息] HF_ENDPOINT=$HF_ENDPOINT"
else
  echo "[信息] 使用 Hugging Face 官方端点"
fi
"$HF_BIN" version

download_file() {
  local repo_path="$1" target_path="$2" source_path="$MODEL_DIR/$repo_path"
  mkdir -p "$(dirname -- "$target_path")"
  if [[ -s "$target_path" ]]; then echo "[跳过] 已存在：$target_path"; return 0; fi
  echo "[下载] $repo_path"
  "$HF_BIN" download "$HF_REPO" "$repo_path" --local-dir "$MODEL_DIR"
  [[ -s "$source_path" ]] || { echo "[错误] 下载后未找到：$source_path" >&2; return 1; }
  if [[ "$source_path" != "$target_path" ]]; then mv -f -- "$source_path" "$target_path"; fi
  echo "[完成] $target_path"
}

# 所有工作流共用的文本编码器和音频/视频 VAE。
download_file "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors" "$MODEL_DIR/text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
download_file "vae/minimax_h3_video_vae_fp16.safetensors" "$MODEL_DIR/vae/minimax_h3_video_vae_fp16.safetensors"
download_file "vae/minimax_h3_audio_vae_fp32.safetensors" "$MODEL_DIR/vae/minimax_h3_audio_vae_fp32.safetensors"

# T2V / I2V 使用 FL2VA；多参考工作流使用 REF2VA。
if [[ "$MODE" == "1" || "$MODE" == "3" ]]; then
  download_file "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" "$MODEL_DIR/diffusion_models/minimaxh3/minimax_h3_fl2va_pruned_int8_convrot.safetensors"
fi
if [[ "$MODE" == "2" || "$MODE" == "3" ]]; then
  download_file "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" "$MODEL_DIR/diffusion_models/minimaxh3/minimax_h3_ref2va_pruned_int8_convrot.safetensors"
fi

echo
echo "MiniMax H3 模型准备完成。"
echo "ComfyUI 根目录：$COMFYUI_ROOT"
echo "模型目录：$MODEL_DIR"
echo "下载中断后重新运行即可；已存在的完整文件会跳过。"
echo "如无法访问 Hugging Face，可先设置 HF_ENDPOINT 后重试。"
