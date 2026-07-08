@echo off
setlocal EnableDelayedExpansion

REM Build orchestrator for VeriVek C++ native modules

set CMAKE=cmake
set ROOT=%~dp0
set NATIVE_DIR=%ROOT%src\VerivekCore\native
set TRAINING_DIR=%ROOT%src\VerivekCore\Training
set MODEL_MANAGER_DIR=%ROOT%src\VerivekCore\ModelManager

set HARDWARE_MONITOR_DIR=%NATIVE_DIR%\HardwareMonitor
set HARDWARE_MONITOR_BUILD=%HARDWARE_MONITOR_DIR%\build
set HARDWARE_MONITOR_DLL=hardware_monitor.dll

set VEK_COMPILER_DIR=%NATIVE_DIR%\VekCompiler
set VEK_COMPILER_BUILD=%VEK_COMPILER_DIR%\build
set VEK_COMPILER_DLL=vek_compiler.dll

if "%1"=="clean" goto :clean
if "%1"=="configure" goto :configure
if "%1"=="build" goto :build
if "%1"=="copy" goto :copy
if "%1"=="all" goto :all
if "%1"=="" goto :all
echo Unknown target: %1
echo Usage: build.bat [all ^| configure ^| build ^| copy ^| clean]
exit /b 1

:all
call :configure || exit /b 1
call :build || exit /b 1
call :copy || exit /b 1
goto :eof

:configure
if not exist "%HARDWARE_MONITOR_BUILD%" mkdir "%HARDWARE_MONITOR_BUILD%"
%CMAKE% -S "%HARDWARE_MONITOR_DIR%" -B "%HARDWARE_MONITOR_BUILD%" -G "MinGW Makefiles"
if errorlevel 1 exit /b 1

if not exist "%VEK_COMPILER_BUILD%" mkdir "%VEK_COMPILER_BUILD%"
%CMAKE% -S "%VEK_COMPILER_DIR%" -B "%VEK_COMPILER_BUILD%" -G "MinGW Makefiles"
if errorlevel 1 exit /b 1

goto :eof

:build
%CMAKE% --build "%HARDWARE_MONITOR_BUILD%"
if errorlevel 1 exit /b 1

%CMAKE% --build "%VEK_COMPILER_BUILD%"
if errorlevel 1 exit /b 1

goto :eof

:copy
if not exist "%HARDWARE_MONITOR_BUILD%\%HARDWARE_MONITOR_DLL%" (
    echo DLL not found: %HARDWARE_MONITOR_BUILD%\%HARDWARE_MONITOR_DLL%
    exit /b 1
)
copy /Y "%HARDWARE_MONITOR_BUILD%\%HARDWARE_MONITOR_DLL%" "%TRAINING_DIR%\%HARDWARE_MONITOR_DLL%"
if errorlevel 1 exit /b 1

if not exist "%VEK_COMPILER_BUILD%\%VEK_COMPILER_DLL%" (
    echo DLL not found: %VEK_COMPILER_BUILD%\%VEK_COMPILER_DLL%
    exit /b 1
)
copy /Y "%VEK_COMPILER_BUILD%\%VEK_COMPILER_DLL%" "%MODEL_MANAGER_DIR%\%VEK_COMPILER_DLL%"
if errorlevel 1 exit /b 1

goto :eof

:clean
if exist "%HARDWARE_MONITOR_BUILD%" rmdir /S /Q "%HARDWARE_MONITOR_BUILD%"
if exist "%TRAINING_DIR%\%HARDWARE_MONITOR_DLL%" del /F /Q "%TRAINING_DIR%\%HARDWARE_MONITOR_DLL%"

if exist "%VEK_COMPILER_BUILD%" rmdir /S /Q "%VEK_COMPILER_BUILD%"
if exist "%MODEL_MANAGER_DIR%\%VEK_COMPILER_DLL%" del /F /Q "%MODEL_MANAGER_DIR%\%VEK_COMPILER_DLL%"

goto :eof