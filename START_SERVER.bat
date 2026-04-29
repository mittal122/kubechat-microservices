@echo off
color 0A
title KubeChat — One Click Deploy

echo.
echo  ██╗  ██╗██╗   ██╗██████╗ ███████╗ ██████╗██╗  ██╗ █████╗ ████████╗
echo  ██║ ██╔╝██║   ██║██╔══██╗██╔════╝██╔════╝██║  ██║██╔══██╗╚══██╔══╝
echo  █████╔╝ ██║   ██║██████╔╝█████╗  ██║     ███████║███████║   ██║   
echo  ██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══██║   ██║   
echo  ██║  ██╗╚██████╔╝██████╔╝███████╗╚██████╗██║  ██║██║  ██║   ██║   
echo  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
echo.
echo  One-Click Server Deployment
echo  =====================================================
echo.
echo  This will automatically:
echo    [1] Install Docker, Git, ngrok (if not installed)
echo    [2] Download the latest KubeChat code
echo    [3] Start all backend services
echo    [4] Open the public internet tunnel
echo.
echo  IMPORTANT: Run this as Administrator for best results.
echo.
pause

:: Run the PowerShell deploy script with bypass policy (no manual setup needed)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"

echo.
echo  Server has stopped. Press any key to exit.
pause > nul
