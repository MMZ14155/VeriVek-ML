@echo off

set "TARGET_DIR=%~dp0.."
set "MINIO_URL=https://dl.minio.org.cn/server/minio/release/windows-amd64/minio.exe"
set "OUTPUT_FILE=%TARGET_DIR%\minio.exe"

if exist "%OUTPUT_FILE%" (
    echo minio.exe already exists
    pause
) else (
    echo Starting download of minio.exe
    curl -L --progress-bar "%MINIO_URL%" -o "%OUTPUT_FILE%"

    if %errorlevel% == 0 (
        echo Download completed
    ) else (
        echo Download failed
    )

    pause
)