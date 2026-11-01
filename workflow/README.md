# MiniMax H3 ComfyUI 工作流

本目录包含三个独立的 ComfyUI 工作流，以及 Windows / Ubuntu 一键安装和模型下载脚本。

## 工作流

| 文件 | 用途 | 扩散模型 |
|---|---|---|
| minimax-h3-t2v-text-to-video.json | T2V 文生视频 | FL2VA |
| minimax-h3-multi-reference-video.json | 多参考图/视频/音频生视频 | REF2VA |
| minimax-h3-i2v-first-last-frame.json | I2V 首帧/尾帧图生视频 | FL2VA |

T2V 和首尾帧 I2V 共用 FL2VA；多参考工作流使用 REF2VA。

## 一键安装

脚本会：
1. 安装或更新 ComfyUI-KJNodes 和 rgthree-comfy。
2. 使用 ComfyUI 当前 Python 安装 KJNodes 的 requirements.txt。
3. 在独立 Python venv 中安装 Hugging Face CLI，不升级 ComfyUI 环境里的 huggingface_hub。
4. 下载共用文本编码器、视频/音频 VAE，以及选择的 FL2VA / REF2VA 模型。
5. 将扩散模型放入工作流 JSON 指定的 diffusion_models/minimaxh3/ 子目录，并检查大模型文件至少 18 GB，避免把未完成下载当成安装成功。

### Windows

双击 download_models.bat，输入 ComfyUI 根目录（包含 models 文件夹的目录）或 models 文件夹路径，再选择下载范围。

### Ubuntu / Gitpod

在仓库根目录运行：

    chmod +x workflow/download_models.sh
    ./workflow/download_models.sh

也可以设置 ComfyUI 路径：

    export COMFYUI_ROOT="/workspace/ComfyUI"
    ./workflow/download_models.sh

如果 ComfyUI 使用非默认 Python：

    PYTHON_EXE="/path/to/comfyui/python" ./workflow/download_models.sh

Ubuntu 的 Hugging Face CLI 默认安装在 ~/.cache/minimax-h3-hf-cli，不会覆盖 ComfyUI 环境依赖。可通过 HF_CLI_VENV 自定义目录。

### 下载范围

1. T2V + I2V：下载 FL2VA 和所有共用模型。
2. 多参考生视频：下载 REF2VA 和所有共用模型。
3. 全部工作流：下载 FL2VA、REF2VA 和所有共用模型。

模型仓库： https://huggingface.co/Comfy-Org/MiniMax-H3

FL2VA / REF2VA 的 INT8 ConvRot 模型文件约 21 GB。请确保磁盘空间充足。下载中断后重新运行脚本即可使用 Hugging Face CLI 缓存继续下载。

如果无法访问 Hugging Face，可在运行前设置镜像端点，例如：

Ubuntu：

    export HF_ENDPOINT="https://hf-mirror.com"
    ./workflow/download_models.sh

Windows CMD：

    set HF_ENDPOINT=https://hf-mirror.com
    workflow\download_models.bat

## 模型安装位置

    ComfyUI/
    └── models/
        ├── diffusion_models/
        │   └── minimaxh3/
        │       ├── minimax_h3_fl2va_pruned_int8_convrot.safetensors
        │       └── minimax_h3_ref2va_pruned_int8_convrot.safetensors
        ├── text_encoders/
        │   └── qwen3vl_32b_minimax_h3_int8_convrot.safetensors
        └── vae/
            ├── minimax_h3_video_vae_fp16.safetensors
            └── minimax_h3_audio_vae_fp32.safetensors

## 注意

- DiffusionModelLoaderKJ 来自 ComfyUI-KJNodes。
- Label (rgthree) 来自 rgthree-comfy。
- 多参考工作流中的 VHS_LoadVideo 还需要 VideoHelperSuite；Label (rgthree) 不再需要手动安装多个节点。
- 模型权重不会提交到 Git 仓库。
- 安装完成后请完全重启 ComfyUI，再重新载入工作流。
