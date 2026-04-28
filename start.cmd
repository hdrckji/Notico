@echo off
REM Supplier Delivery Appointment System - Windows Startup Script

echo ==================================================
echo 🚀 Supplier Delivery Appointment System
echo Windows Startup Script
echo ==================================================
echo.

REM Colors using PowerShell might be better, but this is simple

cd /d "%~dp0"

echo 📦 Starting Backend on Port 5000...
start "Backend Server" cmd /k "cd backend && npm install --silent 2>nul & npm run dev"

REM Wait a moment for backend to initialize
timeout /t 2 /nobreak >nul

echo 🎨 Starting Frontend on Port 3000...
start "Frontend Server" cmd /k "cd frontend && npm install --silent 2>nul & npm run dev"

echo.
echo ==================================================
echo ✅ Servers Started!
echo ==================================================
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:3000
echo ==================================================
echo.
echo 📝 Next Steps:
echo   1. Configure backend/.env if not already done
echo   2. Initialize database: cd backend ^& npm run prisma:migrate
echo   3. Access http://localhost:3000 in your browser
echo.
echo Close these windows to stop the servers
echo ==================================================
