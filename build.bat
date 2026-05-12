@echo off
REM Build & run the social-network stack via Docker Compose.
REM Usage:
REM   build.bat          - build images and start containers
REM   build.bat stop     - stop containers
REM   build.bat clean    - stop + remove volumes (wipes DB + uploads)

cd /d "%~dp0"
set CMD=%1
if "%CMD%"=="" set CMD=up

if /i "%CMD%"=="up" (
    docker compose up --build -d
    echo.
    echo Frontend: http://localhost:3000
    echo Backend:  http://localhost:8080
    docker compose ps
) else if /i "%CMD%"=="stop" (
    docker compose down
) else if /i "%CMD%"=="clean" (
    docker compose down -v
) else (
    echo usage: %0 [up^|stop^|clean] 1>&2
    exit /b 2
)
