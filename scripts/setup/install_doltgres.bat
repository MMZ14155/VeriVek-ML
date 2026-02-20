@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Installing DoltgreSQL for VeriVek ML
echo ========================================
echo.

REM 设置版本和下载链接
set DOLTGRES_VERSION=0.55.3
set DOLTGRES_URL=https://github.com/dolthub/doltgresql/releases/download/v0.55.3/doltgresql-windows-amd64.zip

REM 选择安装路径
if exist "D:\" (
    set INSTALL_DIR=D:\doltgresql
    echo Installing to D:\doltgresql
) else (
    set INSTALL_DIR=C:\doltgresql
    echo Installing to C:\doltgresql
)
echo.

set TEMP_DIR=%TEMP%\doltgres_install

echo [1/5] Creating installation directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
echo Done
echo.

echo [2/5] Downloading DoltgreSQL...
set ZIP_FILE=%TEMP_DIR%\doltgresql.zip
powershell -Command "Invoke-WebRequest -Uri '%DOLTGRES_URL%' -OutFile '%ZIP_FILE%'"
if %errorlevel% neq 0 (
    echo Download failed
    pause
)
echo Done
echo.

echo [3/5] Extracting files...
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%TEMP_DIR%\extracted' -Force"
xcopy /E /Y "%TEMP_DIR%\extracted\*" "%INSTALL_DIR%\" > nul
echo Done
echo.

echo [4/5] Adding to PATH...
setx PATH "%PATH%;%INSTALL_DIR%\bin" /M > nul 2>&1
echo Done
echo.

echo [5/5] Verifying installation...
"%INSTALL_DIR%\doltgresql-windows-amd64\bin\doltgres.exe" --version
if %errorlevel% neq 0 (
    echo Installation verification failed
    pause
)
echo Done
echo.

echo ========================================
echo   DoltgreSQL installed successfully!
echo   Location: %INSTALL_DIR%
echo ========================================
pause