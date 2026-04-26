@echo off
color 0A
title KubeChat Global Server Launcher

echo ===================================================
echo      Starting KubeChat Global Server...
echo ===================================================
echo.

:: Step 1: Check if Docker is running, if not, start it
echo [1/3] Checking Docker Engine status...
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_running

echo Docker is not running. Starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Waiting for Docker Engine to initialize (this may take a minute)...

:wait_for_docker
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 goto wait_for_docker

:docker_running
echo [OK] Docker Engine is running!
echo.

:: Step 2: Start all microservices
echo [2/3] Starting backend microservices...
cd /d "c:\Users\mmpdo\Desktop\work\projects\chattining application"
docker-compose up -d
echo [OK] Microservices are up and running!
echo.

:: Step 3: Start Global Ngrok Tunnel
echo [3/3] Opening Global Internet Tunnel via Ngrok...
echo Your server will be accessible at: https://guileless-blinkingly-ezra.ngrok-free.dev
echo.
echo WARNING: DO NOT CLOSE THIS WINDOW. Closing it will disconnect your global server.
echo.
ngrok http --url=guileless-blinkingly-ezra.ngrok-free.dev 5000

pause
