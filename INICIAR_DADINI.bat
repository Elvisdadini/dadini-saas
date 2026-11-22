@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   DADINI SaaS - inicio de servicios
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js. Instala Node 20 o superior.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo Instalando dependencias del backend...
  pushd backend
  call npm install
  popd
)

if not exist "frontend\node_modules" (
  echo Instalando dependencias del frontend...
  pushd frontend
  call npm install
  popd
)

echo Iniciando API en http://localhost:5055 ...
start "DADINI API" /D "%~dp0backend" cmd /k npm start

echo Iniciando web en http://localhost:5180 ...
start "DADINI Web" /D "%~dp0frontend" cmd /k npm run dev

echo.
echo Esperando que la web este lista...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5180"

echo.
echo Listo. Cierra las ventanas "DADINI API" y "DADINI Web" para detener el sistema.
