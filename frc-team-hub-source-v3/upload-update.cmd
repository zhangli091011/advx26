@echo off
setlocal
cd /d "%~dp0"
echo Uploading the latest ADVX PIT OS update...
call npm run desktop:publish
if errorlevel 1 (
  echo.
  echo Upload failed. Review the output above.
  pause
  exit /b 1
)
echo.
echo Latest update uploaded successfully.
pause
