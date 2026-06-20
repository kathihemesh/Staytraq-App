@echo off
title Staytraq Chatbot Automation Stack Launcher

echo =======================================================
echo 🚀 Starting Staytraq Chatbot Infrastructure...
echo =======================================================
echo.

:: 1. Start Docker Containers
echo [1/3] Starting Docker containers (Evolution, Redis, Postgres, Redis Insight)...
cd /d "c:\Staytraq App\evolution"
docker compose up -d
if %errorlevel% neq 0 (
    echo.
    echo ❌ Error starting Docker containers. Make sure Docker Desktop is running!
    pause
    exit /b
)

echo.
:: 2. Wait for initialization
echo [2/3] Waiting for containers to initialize (5 seconds)...
timeout /t 5 /nobreak > nul

echo.
:: 3. Start FastAPI Server in a separate window
echo [3/3] Launching FastAPI Backend Server in a new window...
cd /d "c:\Staytraq App\backend"
start "FastAPI Backend Server Logs" cmd /k "python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo =======================================================
echo 🎉 Staytraq Chatbot Stack is now running!
echo -------------------------------------------------------
echo 🌐 Evolution API Manager:  http://localhost:8080/manager
echo 🖥️  Redis Insight GUI:     http://localhost:5540
echo 🩺 FastAPI Backend Health: http://localhost:8000/health
echo =======================================================
echo.
pause
