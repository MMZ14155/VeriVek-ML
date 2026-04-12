@echo off

set "TARGET_DIR=%~dp0.."
set "MINIO_URL=https://dl.minio.org.cn/server/minio/release/windows-amd64/minio.exe"
set "OUTPUT_FILE=%TARGET_DIR%\minio.exe"

if exist "%OUTPUT_FILE%" (
    echo 已存在 minio.exe
    pause
) else (
    echo 开始下载 minio.exe
    curl -L --progress-bar "%MINIO_URL%" -o "%OUTPUT_FILE%"

    if %errorlevel% == 0 (
        echo 下载完成
    ) else (
        echo 下载失败
    )

    pause
)