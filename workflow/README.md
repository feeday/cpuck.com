# MiniMax H3 ComfyUI 工作流

本目录包含三个独立的 ComfyUI 工作流，以及 Windows / Ubuntu 模型下载脚本。

## 工作流

| 文件 | 用途 | 扩散模型 |
|---|---|---|
| minimax-h3-t2v-text-to-video.json | T2V 文生视频 | minimax_h3_fl2va_pruned_int8_convrot.safetensors |
| minimax-h3-multi-reference-video.json | 多参考图/视频/音频生视频 | minimax_h3_ref2va_pruned_int8_convrot.safetensors |
| minimax-h3-i2v-first-last-frame.json | I2V 首帧/尾帧图生视频 | minimax_h3_fl2va_pruned_int8_convrot.safetensors |

T2V 和首尾帧 I2V 共用 FL2VA 扩散模型；多参考工作流使用 REF2VA 扩散模型。

## 下载模型

模型来源：Hugging Face 官方 ComfyUI 重打包仓库：
https://huggingface.co/Comfy-Org/MiniMax-H3

### Windows

双击 download_models.bat，输入 ComfyUI 根目录（即包含 models 文件夹的目录），再选择下载范围。

### Ubuntu

    chmod +x workflow/download_models.sh
    ./workflow/download_models.sh

如果工作流目录不在 ComfyUI 根目录下，脚本会提示输入 ComfyUI 根目录。也可以提前设置：

    export COMFYUI_ROOT="/path/to/ComfyUI"
    ./workflow/download_models.sh

### 下载范围

1. T2V + I2V：下载 FL2VA 扩散模型和所有共用模型。
2. 多参考生视频：下载 REF2VA 扩散模型和所有共用模型。
3. 全部工作流：下载两种扩散模型及所有共用模型。

下载使用 Hugging Face 官方 CLI 的 hf download 命令，不会把模型权重提交到本 Git 仓库。共享模型由 Hugging Face CLI 根据本地目录缓存校验并避免重复下载；已安装到 minimaxh3 子目录的扩散模型会跳过。下载中断后重新运行即可继续使用 Hugging Face 下载缓存。

如果当前网络无法访问 huggingface.co，可在运行前自行设置可用的 Hugging Face 镜像端点，例如：

Ubuntu：

    export HF_ENDPOINT="https://hf-mirror.com"
    ./workflow/download_models.sh

Windows CMD：

    set HF_ENDPOINT=https://hf-mirror.com
    workflow\download_models.bat

镜像端点由使用者自行选择；默认仍使用 Hugging Face 官方站点。若仓库返回认证错误，可先安装 huggingface_hub 并执行 hf auth login。

## 模型放置位置

脚本按工作流节点实际选择的文件名安装到以下目录：

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

## 工作流模型配置说明

这三个原始 JSON 的节点配置和说明卡片存在两处文件名不一致：

- CLIPLoader 节点当前实际选择的是 qwen3vl_32b_minimax_h3_int8_convrot.safetensors，但说明卡片及模型元数据列出的是 qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors。下载脚本按节点当前选择的 INT8 文件下载，避免导入后提示缺少模型。
- 多参考工作流的扩散模型节点实际选择 minimax_h3_ref2va_pruned_int8_convrot.safetensors；其说明卡片列出的 FL2VA 文件不适用于该节点。下载脚本按节点当前选择的 REF2VA 文件下载。

工作流 JSON 原样保存，没有改动节点参数。

## 注意

- 请使用包含 MiniMax H3 原生节点的较新版本 ComfyUI。
- DiffusionModelLoaderKJ 需要安装对应的 KJNodes 自定义节点包。
- 多参考工作流中的 VHS_LoadVideo 需要 VideoHelperSuite；Label (rgthree) 需要 rgthree-comfy。
- 模型文件体积较大，请预留足够磁盘空间。不同工作流共享文本编码器和 VAE，不需要重复下载。
