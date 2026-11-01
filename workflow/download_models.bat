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

rem 同时接受 ComfyUI 根目录和直接指向 models 的目录。
for %%I in ("%COMFYUI_ROOT%") do (
    if /I "%%~nxI"=="models" (
        set "MODEL_DIR=%%~fI"
        set "COMFYUI_ROOT=%%~dpI"
    ) else (
        set "COMFYUI_ROOT=%%~fI"
        set "MODEL_DIR=%%~fI\models"
    )
)
if not exist "%MODEL_DIR%\" mkdir "%MODEL_DIR%"

echo.
echo 选择要准备的工作流模型：
echo   1^) T2V 文生视频 + I2V 首尾帧（共用 FL2VA 模型）
echo   2^) 多参考生视频（REF2VA 模型）
echo   3^) 三个工作流全部需要（下载 FL2VA + REF2VA）
set "MODE=3"
set /p "MODE=请选择 [1/2/3，默认 3]: "
if not defined MODE set "MODE=3"
if not "%MODE%"=="1" if not "%MODE%"=="2" if not "%MODE%"=="3" (
    echo [错误] 请输入 1、2 或 3。
    pause
    exit /b 1
)

set "HF_REPO=Comfy-Org/MiniMax-H3"
set "HF_HUB_DOWNLOAD_TIMEOUT=60"
if defined HF_ENDPOINT (echo [信息] HF_ENDPOINT=%HF_ENDPOINT%) else (echo [信息] 使用 Hugging Face 官方端点)

rem 优先使用已安装的 hf；若不存在，则安装到独立 venv。
set "HF_BIN=hf"
where hf >nul 2>&1
if not errorlevel 1 goto :hf_ready

if not defined PYTHON_EXE if exist "%COMFYUI_ROOT%\python_embeded\python.exe" set "PYTHON_EXE=%COMFYUI_ROOT%\python_embeded\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"
"%PYTHON_EXE%" --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 hf 或可用的 Python 3。
    pause
    exit /b 1
)
if not defined LOCALAPPDATA set "LOCALAPPDATA=%USERPROFILE%\AppData\Local"
set "HF_VENV=%LOCALAPPDATA%\MiniMaxH3\hf-cli"
if not exist "%HF_VENV%\Scripts\hf.exe" (
    echo [准备] 创建独立 Hugging Face CLI 环境：%HF_VENV%
    "%PYTHON_EXE%" -m venv "%HF_VENV%"
    if errorlevel 1 (
        echo [错误] 创建 Python venv 失败。请安装标准版 Python 3，或先单独安装 hf CLI。
        pause
        exit /b 1
    )
    "%HF_VENV%\Scripts\python.exe" -m pip install --upgrade pip huggingface_hub
    if errorlevel 1 goto :failed
)
set "HF_BIN=%HF_VENV%\Scripts\hf.exe"

:hf_ready
"%HF_BIN%" version
if errorlevel 1 goto :failed

call :download "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors" "%MODEL_DIR%\text_encoders\qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
if errorlevel 1 goto :failed
call :download "vae/minimax_h3_video_vae_fp16.safetensors" "%MODEL_DIR%\vae\minimax_h3_video_vae_fp16.safetensors"
if errorlevel 1 goto :failed
call :download "vae/minimax_h3_audio_vae_fp32.safetensors" "%MODEL_DIR%\vae\minimax_h3_audio_vae_fp32.safetensors"
if errorlevel 1 goto :failed

if "%MODE%"=="1" goto :fl2va
if "%MODE%"=="2" goto :ref2va
goto :all_models

:fl2va
call :download "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_fl2va_pruned_int8_convrot.safetensors"
if errorlevel 1 goto :failed
goto :success

:ref2va
call :download "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_ref2va_pruned_int8_convrot.safetensors"
if errorlevel 1 goto :failed
goto :success

:all_models
call :download "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_fl2va_pruned_int8_convrot.safetensors"
if errorlevel 1 goto :failed
call :download "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" "%MODEL_DIR%\diffusion_models\minimaxh3\minimax_h3_ref2va_pruned_int8_convrot.safetensors"
if errorlevel 1 goto :failed
goto :success

:download
set "REPO_PATH=%~1"
set "TARGET=%~2"
set "SOURCE=%MODEL_DIR%\%REPO_PATH:/=\%"
for %%A in ("%SOURCE%") do set "SOURCE_FULL=%%~fA"
for %%A in ("%TARGET%") do set "TARGET_FULL=%%~fA"

if /I "%SOURCE_FULL%"=="%TARGET_FULL%" (
    echo [校验/下载] %REPO_PATH%
    "%HF_BIN%" download "%HF_REPO%" "%REPO_PATH%" --local-dir "%MODEL_DIR%"
    if errorlevel 1 exit /b 1
    if not exist "%TARGET%" (
        echo [错误] 下载后未找到：%TARGET%
        exit /b 1
    )
    exit /b 0
)

if exist "%TARGET%" (
    echo [跳过] 已存在：%TARGET%
    exit /b 0
)
for %%D in ("%TARGET%") do if not exist "%%~dpD" mkdir "%%~dpD"
echo [下载] %REPO_PATH%
"%HF_BIN%" download "%HF_REPO%" "%REPO_PATH%" --local-dir "%MODEL_DIR%"
if errorlevel 1 exit /b 1
if not exist "%SOURCE%" (
    echo [错误] 下载后未找到：%SOURCE%
    exit /b 1
)
move /Y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 exit /b 1
echo [完成] %TARGET%
exit /b 0

:success
echo.
echo MiniMax H3 模型准备完成。
echo ComfyUI 根目录：%COMFYUI_ROOT%
echo 模型目录：%MODEL_DIR%
echo 下载中断后重新运行即可；已存在的完整文件会跳过。
echo 如无法访问 Hugging Face，可先设置 HF_ENDPOINT 后重试。
pause
exit /b 0

:failed
echo.
echo [失败] 模型下载未完成。检查网络或 HF_ENDPOINT 后重新运行即可。
echo 如仓库要求认证，请执行 "%HF_BIN%" auth login。
pause
exit /b 1
