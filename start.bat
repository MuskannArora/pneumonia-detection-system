@echo off
setlocal
title PneumoAI server
cd /d "%~dp0backend"

if not exist "..\pneumonia_final_v2.keras" (
  echo [ERROR] pneumonia_final_v2.keras was not found in the project folder.
  pause
  exit /b 1
)

if exist ".venv\Scripts\python.exe" goto run

echo First run: creating the Python environment (this takes a few minutes)...
set "PY="
where py >nul 2>nul && py -3.12 --version >nul 2>nul && set "PY=py -3.12"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo [ERROR] Python 3.10-3.12 is not installed. Install it from https://www.python.org/downloads/ and tick "Add Python to PATH".
  pause
  exit /b 1
)
%PY% -m venv .venv || (echo [ERROR] Could not create the virtual environment. & pause & exit /b 1)
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt || (echo [ERROR] Installing requirements failed. & pause & exit /b 1)

:run
echo.
echo  PneumoAI is starting. The model takes 10-60 seconds to load.
echo  The browser will open at http://localhost:8000/app/  (status turns green when ready)
echo  Close this window or press Ctrl+C to stop the server.
echo.
start "" "http://localhost:8000/app/"
".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000
pause
