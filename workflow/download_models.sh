#!/usr/bin/env bash
set -Eeuo pipefail

trap 'echo "[失败] 脚本在第 ${LINENO} 行中止，请检查上方错误。" >&2' ERR

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMFYUI_ROOT="${COMFYUI_ROOT:-}"

if [[ -z "$COMFYUI_ROOT" && -d "$DEFAULT_ROOT/models" ]]; then
  COMFYUI_ROOT="$DEFAULT_ROOT"
fi
if [[ -z "$COMFYUI_ROOT" ]]; then
  read -r -p "请输入 ComfyUI 根目录或 models 目录: " COMFYUI_ROOT
fi
[[ -d "$COMFYUI_ROOT" ]] || { echo "[错误] 目录不存在：$COMFYUI_ROOT" >&2; exit 1; }

COMFYUI_ROOT="$(cd -- "$COMFYUI_ROOT" && pwd -P)"
if [[ "$(basename -- "$COMFYUI_ROOT")" == "models" ]]; then
  MODEL_DIR="$COMFYUI_ROOT"
  COMFYUI_ROOT="$(dirname -- "$MODEL_DIR")"
else
  MODEL_DIR="$COMFYUI_ROOT/models"
fi
CUSTOM_NODES="$COMFYUI_ROOT/custom_nodes"
mkdir -p "$MODEL_DIR" "$CUSTOM_NODES"

# 尽量使用运行 ComfyUI 的同一 Python；也允许通过 PYTHON_EXE 手动指定。
if [[ -n "${PYTHON_EXE:-}" ]]; then
  PYTHON_BIN="$PYTHON_EXE"
elif [[ -x "$COMFYUI_ROOT/venv/bin/python" ]]; then
  PYTHON_BIN="$COMFYUI_ROOT/venv/bin/python"
elif [[ -x "$COMFYUI_ROOT/.venv/bin/python" ]]; then
  PYTHON_BIN="$COMFYUI_ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  PYTHON_BIN="python"
fi
command -v "$PYTHON_BIN" >/dev/null 2>&1 || { echo "[错误] 找不到 Python：$PYTHON_BIN" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "[错误] 未找到 git，请先安装 git。" >&2; exit 1; }

echo
echo "ComfyUI 根目录：$COMFYUI_ROOT"
echo "Python：$($PYTHON_BIN --version 2>&1)"
echo
echo "[1/3] 安装/更新工作流必需的自定义节点"

clone_or_update() {
  local url="$1"
  local dir="$2"
  if [[ -d "$dir/.git" ]]; then
    echo "[更新] $(basename -- "$dir")"
    git -C "$dir" pull --ff-only
  elif [[ -e "$dir" ]]; then
    echo "[跳过] $dir 已存在但不是 Git 仓库，不覆盖现有目录。"
  else
    echo "[安装] $url"
    git clone --depth 1 "$url" "$dir"
  fi
}

clone_or_update "https://github.com/kijai/ComfyUI-KJNodes.git" "$CUSTOM_NODES/ComfyUI-KJNodes"
clone_or_update "https://github.com/rgthree/rgthree-comfy.git" "$CUSTOM_NODES/rgthree-comfy"

if [[ ! -f "$CUSTOM_NODES/ComfyUI-KJNodes/requirements.txt" ]]; then
  echo "[错误] 找不到 ComfyUI-KJNodes/requirements.txt，请检查插件目录。" >&2
  exit 1
fi
echo "[依赖] 使用 ComfyUI Python 安装 KJNodes requirements"
"$PYTHON_BIN" -m pip install -r "$CUSTOM_NODES/ComfyUI-KJNodes/requirements.txt"

echo
echo "[2/3] 准备独立 Hugging Face CLI（不会升级 ComfyUI 的 huggingface_hub）"
HF_REPO="Comfy-Org/MiniMax-H3"
export HF_HUB_DOWNLOAD_TIMEOUT="${HF_HUB_DOWNLOAD_TIMEOUT:-120}"
PYTHON_FOR_VENV="$PYTHON_BIN"
HF_VENV="${HF_CLI_VENV:-${XDG_CACHE_HOME:-$HOME/.cache}/minimax-h3-hf-cli}"
if [[ ! -x "$HF_VENV/bin/python" ]]; then
  "$PYTHON_FOR_VENV" -m venv "$HF_VENV" || {
    echo "[错误] 创建独立 Python venv 失败。Ubuntu/Debian 可执行：sudo apt install python3-venv" >&2
    exit 1
  }
fi
"$HF_VENV/bin/python" -m pip install "huggingface_hub>=1.4.1,<2.0"
HF_BIN="$HF_VENV/bin/hf"
[[ -x "$HF_BIN" ]] || { echo "[错误] 独立环境中没有 hf CLI。" >&2; exit 1; }
"$HF_BIN" version

if [[ -n "${HF_ENDPOINT:-}" ]]; then
  echo "[信息] 使用 HF_ENDPOINT=$HF_ENDPOINT"
else
  echo "[信息] 使用 Hugging Face 官方端点"
fi

echo
echo "选择要准备的工作流模型："
echo "  1) T2V 文生视频 + I2V 首尾帧（FL2VA）"
echo "  2) 多参考生视频（REF2VA）"
echo "  3) 三个工作流全部需要（FL2VA + REF2VA）"
read -r -p "请选择 [1/2/3，默认 3]: " MODE
MODE="${MODE:-3}"
case "$MODE" in 1|2|3) ;; *) echo "[错误] 请输入 1、2 或 3。" >&2; exit 1 ;; esac

# 将官方仓库路径下载到 models/，再放入工作流 JSON 指定的 minimaxh3 子目录。
# FL2VA / REF2VA 官方文件约 21 GB；18 GB 下限用于拦截未完成/错误下载。
download_model() {
  local repo_path="$1"
  local target_path="$2"
  local min_bytes="$3"
  local source_path="$MODEL_DIR/$repo_path"
  local current_size=0

  mkdir -p "$(dirname -- "$target_path")"

  if [[ -f "$target_path" ]]; then
    current_size="$(stat -c '%s' "$target_path" 2>/dev/null || echo 0)"
    if (( current_size >= min_bytes )); then
      echo "[已存在] $target_path（$current_size bytes）"
      return 0
    fi
    echo "[清理] 目标文件不完整（$current_size bytes），重新下载：$target_path"
    rm -f -- "$target_path"
  fi

  # 兼容旧脚本/手动下载：若模型在 diffusion_models 根目录，先移动到工作流指定子目录。
  if [[ -f "$source_path" ]]; then
    current_size="$(stat -c '%s' "$source_path" 2>/dev/null || echo 0)"
    if (( current_size >= min_bytes )); then
      echo "[整理] 将已下载模型移动到工作流指定目录"
      mv -f -- "$source_path" "$target_path"
      return 0
    fi
    echo "[清理] 发现未完成文件：$source_path"
    rm -f -- "$source_path"
  fi

  echo "[下载] $repo_path"
  echo "[目标] $target_path"
  "$HF_BIN" download "$HF_REPO" "$repo_path" --local-dir "$MODEL_DIR"

  [[ -f "$source_path" ]] || {
    echo "[错误] Hugging Face 命令结束，但未找到下载文件：$source_path" >&2
    return 1
  }
  current_size="$(stat -c '%s' "$source_path")"
  if (( current_size < min_bytes )); then
    echo "[错误] 文件大小异常：$current_size bytes，要求至少 $min_bytes bytes。" >&2
    return 1
  fi

  mv -f -- "$source_path" "$target_path"
  echo "[完成] $target_path（$current_size bytes）"
}

echo
echo "[3/3] 下载并校验工作流模型"
# 三个工作流共用的文本编码器和 VAE。
download_model "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors" "$MODEL_DIR/text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors" 1
download_model "vae/minimax_h3_video_vae_fp16.safetensors" "$MODEL_DIR/vae/minimax_h3_video_vae_fp16.safetensors" 1
download_model "vae/minimax_h3_audio_vae_fp32.safetensors" "$MODEL_DIR/vae/minimax_h3_audio_vae_fp32.safetensors" 1

if [[ "$MODE" == "1" || "$MODE" == "3" ]]; then
  download_model "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" "$MODEL_DIR/diffusion_models/minimaxh3/minimax_h3_fl2va_pruned_int8_convrot.safetensors" 18000000000
fi
if [[ "$MODE" == "2" || "$MODE" == "3" ]]; then
  download_model "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" "$MODEL_DIR/diffusion_models/minimaxh3/minimax_h3_ref2va_pruned_int8_convrot.safetensors" 18000000000
fi

echo
echo "[检查] 工作流要求的模型路径："
if [[ "$MODE" == "1" || "$MODE" == "3" ]]; then
  test -s "$MODEL_DIR/diffusion_models/minimaxh3/minimax_h3_fl2va_pruned_int8_convrot.safetensors"
  echo "  OK  diffusion_models/minimaxh3/minimax_h3_fl2va_pruned_int8_convrot.safetensors"
fi
if [[ "$MODE" == "2" || "$MODE" == "3" ]]; then
  test -s "$MODEL_DIR/diffusion_models/minimaxh3/minimax_h3_ref2va_pruned_int8_convrot.safetensors"
  echo "  OK  diffusion_models/minimaxh3/minimax_h3_ref2va_pruned_int8_convrot.safetensors"
fi

echo
echo "MiniMax H3 工作流依赖与模型准备完成。"
echo "ComfyUI：$COMFYUI_ROOT"
echo "模型目录：$MODEL_DIR"
echo "请完全重启 ComfyUI 后重新载入工作流。"
