@echo off
echo =======================================
echo    Starting KubeChat Microservices
echo =======================================
echo.

echo [1/2] Starting Backend Server (Port 5000)...
start "Backend Server" cmd /k "cd backend && npm run dev"

echo [2/2] Starting Frontend React App (Vite)...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are booting up in separate windows! 
echo To completely stop the application later, just close the two black terminal windows that popped up.
echo =======================================
