@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "DEFAULT_ROOT=%%~fI"

if not defined COMFYUI_ROOT if exist "%DEFAULT_ROOT%\models\" set "COMFYUI_ROOT=%DEFAULT_ROOT%"
if not defined COMFYUI_ROOT (
    echo 请输入 ComfyUI 根目录或 models 目录。
    set /p "COMFYUI_ROOT=ComfyUI 路径: "
)
if not exist "%COMFYUI_ROOT%\" (
    echo [错误] 目录不存在：%COMFYUI_ROOT%
    pause
    exit /b 1
)

for %%I in ("%COMFYUI_ROOT%") do set "INPUT_NAME=%%~nxI"
if /I "%INPUT_NAME%"=="models" goto :input_is_models
set "MODEL_DIR=%COMFYUI_ROOT%\models"
goto :root_ready

:input_is_models
for %%I in ("%COMFYUI_ROOT%\..") do set "COMFYUI_ROOT=%%~fI"
set "MODEL_DIR=%COMFYUI_ROOT%\models"

:root_ready
for %%I in ("%COMFYUI_ROOT%") do set "COMFYUI_ROOT=%%~fI"
if not exist "%MODEL_DIR%\" mkdir "%MODEL_DIR%"
set "CUSTOM_NODES=%COMFYUI_ROOT%\custom_nodes"
if not exist "%CUSTOM_NODES%\" mkdir "%CUSTOM_NODES%"

rem 选择 ComfyUI 自己的 Python，避免把依赖装到错误环境。
if defined PYTHON_EXE goto :python_ready
if exist "%COMFYUI_ROOT%\venv\Scripts\python.exe" set "PYTHON_EXE=%COMFYUI_ROOT%\venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%COMFYUI_ROOT%\.venv\Scripts\python.exe" set "PYTHON_EXE=%COMFYUI_ROOT%\.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%COMFYUI_ROOT%\python_embeded\python.exe" set "PYTHON_EXE=%COMFYUI_ROOT%\python_embeded\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

:python_ready
"%PYTHON_EXE%" --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 找不到可用 Python：%PYTHON_EXE%
    pause
    exit /b 1
)
where git >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Git，请先安装 Git for Windows。
    pause
    exit /b 1
)

echo.
echo ComfyUI 根目录：%COMFYUI_ROOT%
echo Python：%PYTHON_EXE%
echo.
echo [1/3] 安装/更新工作流必需的自定义节点

if exist "%CUSTOM_NODES%\ComfyUI-KJNodes\.git\" (
    echo [更新] ComfyUI-KJNodes
    git -C "%CUSTOM_NODES%\ComfyUI-KJNodes" pull --ff-only
    if errorlevel 1 goto :failed
) else if exist "%CUSTOM_NODES%\ComfyUI-KJNodes\" (
    echo [跳过] ComfyUI-KJNodes 目录已存在且不是 Git 仓库，不覆盖。
) else (
    git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git "%CUSTOM_NODES%\ComfyUI-KJNodes"
    if errorlevel 1 goto :failed
)

if exist "%CUSTOM_NODES%\rgthree-comfy\.git\" (
    echo [更新] rgthree-comfy
    git -C "%CUSTOM_NODES%\rgthree-comfy" pull --ff-only
    if errorlevel 1 goto :failed
) else if exist "%CUSTOM_NODES%\rgthree-comfy\" (
    echo [跳过] rgthree-comfy 目录已存在且不是 Git 仓库，不覆盖。
) else (
    git clone --depth 1 https://github.com/rgthree/rgthree-comfy.git "%CUSTOM_NODES%\rgthree-comfy"
    if errorlevel 1 goto :failed
)

if not exist "%CUSTOM_NODES%\ComfyUI-KJNodes\requirements.txt" (
    echo [错误] 找不到 KJNodes requirements.txt。
    goto :failed
)
echo [依赖] 使用 ComfyUI Python 安装 KJNodes requirements
"%PYTHON_EXE%" -m pip install -r "%CUSTOM_NODES%\ComfyUI-KJNodes\requirements.txt"
if errorlevel 1 goto :failed

echo.
echo [2/3] 准备独立 Hugging Face CLI（不修改 ComfyUI 的 huggingface_hub）
set "HF_REPO=Comfy-Org/MiniMax-H3"
set "HF_HUB_DOWNLOAD_TIMEOUT=120"
if not defined LOCALAPPDATA set "LOCALAPPDATA=%USERPROFILE%\AppData\Local"
set "HF_VENV=%LOCALAPPDATA%\MiniMaxH3\hf-cli"
if not exist "%HF_VENV%\Scripts\python.exe" (
    "%PYTHON_EXE%" -m venv "%HF_VENV%"
    if errorlevel 1 (
        echo [错误] 创建独立 Python 环境失败。
        goto :failed
    )
)
"%HF_VENV%\Scripts\python.exe" -m pip install "huggingface_hub>=1.4.1,<2.0"
if errorlevel 1 goto :failed
set "HF_BIN=%HF_VENV%\Scripts\hf.exe"
if not exist "%HF_BIN%" (
    echo [错误] 独立环境中未找到 hf.exe。
    goto :failed
)
"%HF_BIN%" version
if errorlevel 1 goto :failed
if defined HF_ENDPOINT (echo [信息] 使用 HF_ENDPOINT=%HF_ENDPOINT%) else (echo [信息] 使用 Hugging Face 官方端点)

echo.
echo 选择要准备的工作流模型：
echo   1^) T2V 文生视频 + I2V 首尾帧（FL2VA）
echo   2^) 多参考生视频（REF2VA）
echo   3^) 三个工作流全部需要（FL2VA + REF2VA）
set "MODE=3"
set /p "MODE=请选择 [1/2/3，默认 3]: "
if not defined MODE set "MODE=3"
if not "%MODE%"=="1" if not "%MODE%"=="2" if not "%MODE%"=="3" (
    echo [错误] 请输入 1、2 或 3。
    goto :failed
)

echo.
echo [3/3] 下载并校验工作流模型
call :download "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors" "%MODEL_DIR%\text_encoders\qwen3vl_32b_minimax_h3_int8_convrot.safetensors" 1
if errorlevel 1 goto :failed
call :download "vae/minimax_h3_video_vae_fp16.safetensors" "%MODEL_DIR%\vae\minimax_h3_video_vae_fp16.safetensors" 1
if errorlevel 1 goto :failed
call :download "vae/minimax_h3_audio_vae_fp32.safetensors" "%MODEL_DIR%\vae\minimax_h3_audio_vae_fp32.safetensors" 1
if errorlevel 1 goto :failed

if "%MODE%"=="1" goto :fl2va
if "%MODE%"=="2" goto :ref2va
goto :all_models

:fl2va
call :download "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_fl2va_pruned_int8_convrot.safetensors" 18000000000
if errorlevel 1 goto :failed
goto :verify_fl2va

:ref2va
call :download "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_ref2va_pruned_int8_convrot.safetensors" 18000000000
if errorlevel 1 goto :failed
goto :verify_ref2va

:all_models
call :download "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_fl2va_pruned_int8_convrot.safetensors" 18000000000
if errorlevel 1 goto :failed
call :download "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_ref2va_pruned_int8_convrot.safetensors" 18000000000
if errorlevel 1 goto :failed
goto :verify_all

:download
set "REPO_PATH=%~1"
set "TARGET=%~2"
set "MIN_BYTES=%~3"
set "SOURCE=%MODEL_DIR%\%REPO_PATH:/=\%"
set "CHECK_FILE=%TARGET%"
set "SIZE_OK="
for /f "delims=" %%S in ('powershell -NoProfile -Command "if ((Test-Path -LiteralPath $env:CHECK_FILE) -and ((Get-Item -LiteralPath $env:CHECK_FILE).Length -ge %MIN_BYTES%)) { 'YES' }"') do set "SIZE_OK=%%S"
if /I "%SIZE_OK%"=="YES" (
    echo [已存在] %TARGET%
    exit /b 0
)
if exist "%TARGET%" (
    echo [清理] 目标文件不完整，重新下载：%TARGET%
    del /f /q "%TARGET%"
)

rem 兼容旧脚本或手动下载到 diffusion_models 根目录的情况，先归位，不重复下载。
set "CHECK_FILE=%SOURCE%"
set "SIZE_OK="
for /f "delims=" %%S in ('powershell -NoProfile -Command "if ((Test-Path -LiteralPath $env:CHECK_FILE) -and ((Get-Item -LiteralPath $env:CHECK_FILE).Length -ge %MIN_BYTES%)) { 'YES' }"') do set "SIZE_OK=%%S"
if /I "%SIZE_OK%"=="YES" (
    for %%D in ("%TARGET%") do if not exist "%%~dpD" mkdir "%%~dpD"
    move /Y "%SOURCE%" "%TARGET%" >nul
    if errorlevel 1 exit /b 1
    echo [整理完成] %TARGET%
    exit /b 0
)
if exist "%SOURCE%" del /f /q "%SOURCE%"

for %%D in ("%TARGET%") do if not exist "%%~dpD" mkdir "%%~dpD"
echo [下载] %REPO_PATH%
echo [目标] %TARGET%
"%HF_BIN%" download "%HF_REPO%" "%REPO_PATH%" --local-dir "%MODEL_DIR%"
if errorlevel 1 exit /b 1
if not exist "%SOURCE%" (
    echo [错误] 下载结束但未找到文件：%SOURCE%
    exit /b 1
)

set "CHECK_FILE=%SOURCE%"
set "SIZE_OK="
for /f "delims=" %%S in ('powershell -NoProfile -Command "if ((Test-Path -LiteralPath $env:CHECK_FILE) -and ((Get-Item -LiteralPath $env:CHECK_FILE).Length -ge %MIN_BYTES%)) { 'YES' }"') do set "SIZE_OK=%%S"
if /I not "%SIZE_OK%"=="YES" (
    echo [错误] 下载文件大小不符合要求，可能下载未完成。
    exit /b 1
)
move /Y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 exit /b 1
echo [完成] %TARGET%
exit /b 0

:verify_fl2va
if not exist "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_fl2va_pruned_int8_convrot.safetensors" goto :failed
echo [检查通过] FL2VA 模型已放入工作流指定目录。
goto :success

:verify_ref2va
if not exist "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_ref2va_pruned_int8_convrot.safetensors" goto :failed
echo [检查通过] REF2VA 模型已放入工作流指定目录。
goto :success

:verify_all
if not exist "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_fl2va_pruned_int8_convrot.safetensors" goto :failed
if not exist "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_ref2va_pruned_int8_convrot.safetensors" goto :failed
echo [检查通过] FL2VA 和 REF2VA 模型均已安装。
goto :success

:success
echo.
echo MiniMax H3 工作流依赖与模型准备完成。
echo ComfyUI：%COMFYUI_ROOT%
echo 模型目录：%MODEL_DIR%
echo 请完全重启 ComfyUI 后重新载入工作流。
pause
exit /b 0

:failed
echo.
echo [失败] 安装或下载未完成。请检查上方错误、网络和磁盘空间后重新运行。
echo 下载中断可重新运行脚本，HF CLI 会使用本地缓存续传。
pause
exit /b 1
