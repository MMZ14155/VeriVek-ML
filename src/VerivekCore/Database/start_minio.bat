@echo off
title MinIO Server

set "BASE_DIR=%~dp0..\..\.."
cd /d "%BASE_DIR%"

minio.exe server minio-data --console-address ":9001"

pause