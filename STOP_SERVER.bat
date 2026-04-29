@echo off
color 0C
title KubeChat — Stop Server

echo.
echo  Stopping KubeChat Server...
echo  =====================================================
echo.

set DEPLOY_DIR=%USERPROFILE%\kubechat

if exist "%DEPLOY_DIR%\docker-compose.yml" (
    cd /d "%DEPLOY_DIR%"
) else if exist "%~dp0docker-compose.yml" (
    cd /d "%~dp0"
) else (
    echo  Could not find docker-compose.yml. Are services running?
    pause
    exit /b
)

echo  [1/2] Stopping all containers (data is preserved)...
docker-compose down
echo  Done!
echo.
echo  [2/2] Killing ngrok tunnel (if running)...
taskkill /f /im ngrok.exe > nul 2>&1
echo  Done!
echo.
echo  =====================================================
echo  All KubeChat services have been stopped.
echo  Your data (messages, users) is safely preserved.
echo  Run START_SERVER.bat to start again.
echo  =====================================================
echo.
pause
