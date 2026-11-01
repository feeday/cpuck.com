#!/usr/bin/env python3
"""Disable SageAttention on unsupported GPUs or when its package is unavailable.

DiffusionModelLoaderKJ stores its sage_attention widget at widgets_values[4].
Turing GPUs such as Tesla T4 (compute capability 7.5) should use ComfyUI's
native PyTorch attention path instead of trying to import SageAttention.
"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys

WORKFLOWS = (
    "minimax-h3-t2v-text-to-video.json",
    "minimax-h3-multi-reference-video.json",
    "minimax-h3-i2v-first-last-frame.json",
)


def main() -> int:
    root = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent

    capability = None
    try:
        import torch
        if torch.cuda.is_available():
            capability = tuple(torch.cuda.get_device_capability())
    except Exception as exc:
        print(f"[注意] 无法检测 CUDA 架构：{exc}")

    try:
        sage_available = importlib.util.find_spec("sageattention") is not None
    except (ImportError, ValueError):
        sage_available = False

    # SageAttention 2's normal CUDA kernels target Ampere+ (SM80+).
    # If package/GPU detection is unavailable, choose the safe native fallback.
    use_native_attention = capability is None or capability < (8, 0) or not sage_available

    if capability is not None:
        print(f"[检测] CUDA compute capability：{capability[0]}.{capability[1]}")
    else:
        print("[检测] 未检测到可用 CUDA GPU")
    print(f"[检测] sageattention 包：{'已安装' if sage_available else '未安装'}")

    if not use_native_attention:
        print("[兼容] GPU 和 SageAttention 均可用，保留工作流当前 Attention 设置。")
        return 0

    print("[兼容] 使用 ComfyUI 原生 PyTorch Attention，禁用 KJNodes SageAttention。")
    found = 0
    changed = 0

    for name in WORKFLOWS:
        path = root / name
        if not path.is_file():
            continue

        data = json.loads(path.read_text(encoding="utf-8"))
        local_changed = 0
        for node in data.get("nodes", []):
            if node.get("type") != "DiffusionModelLoaderKJ":
                continue
            values = node.get("widgets_values")
            if not isinstance(values, list) or len(values) <= 4:
                continue
            found += 1
            if values[4] != "disabled":
                old = values[4]
                values[4] = "disabled"
                local_changed += 1
                print(f"  [修改] {name} 节点 {node.get('id')}：{old} -> disabled")

        if local_changed:
            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            changed += local_changed
        elif any(n.get("type") == "DiffusionModelLoaderKJ" for n in data.get("nodes", [])):
            print(f"  [已兼容] {name}")

    if found == 0:
        print("[注意] 未在脚本目录找到包含 DiffusionModelLoaderKJ 的工作流 JSON。")
        print("      请把三个工作流 JSON 放在 download_models 脚本同一目录。")
    else:
        print(f"[完成] 检查 {found} 个模型加载节点，修改 {changed} 个节点。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
