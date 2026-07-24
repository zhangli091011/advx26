@echo off
setlocal
cd /d "%~dp0"
echo Building ADVX PIT OS and incrementing the patch version...
call npm run desktop:build
if errorlevel 1 (
  echo.
  echo Build failed. Review the output above.
  pause
  exit /b 1
)
echo.
echo Build completed. No files were uploaded.
pause
