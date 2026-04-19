@echo off
chcp 65001 >nul
echo ╔══════════════════════════════════════════╗
echo ║   TWS Water Factory Management System   ║
echo ║      ระบบจัดการโรงงานผลิตน้ำดื่ม TWS      ║
echo ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ไม่พบ Node.js ในเครื่องนี้
  echo.
  echo กรุณาติดตั้ง Node.js ก่อน:
  echo   1. เปิดเว็บ: https://nodejs.org
  echo   2. ดาวน์โหลด LTS version
  echo   3. ติดตั้งและ restart หน้าต่างนี้
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo Node.js %%v พร้อมใช้งาน
echo.

:: Add MSVC to PATH so better-sqlite3 can build if needed
set "MSVC_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64"
if exist "%MSVC_PATH%\cl.exe" set "PATH=%MSVC_PATH%;%PATH%"

if not exist node_modules (
  echo กำลังติดตั้ง dependencies...
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo ติดตั้งไม่สำเร็จ
    pause
    exit /b 1
  )
  echo กำลัง build native modules...
  call npm rebuild better-sqlite3
  echo ติดตั้งสำเร็จ!
  echo.
) else (
  if not exist node_modules\better-sqlite3\build\Release\better_sqlite3.node (
    echo กำลัง build better-sqlite3...
    call npm rebuild better-sqlite3
    echo.
  )
)

echo เริ่มต้นระบบ...
echo เปิดเบราว์เซอร์ที่:  http://localhost:3000
echo.
echo ชื่อผู้ใช้เริ่มต้น:
echo   Admin    : admin    / admin123
echo   Manager  : manager  / manager123
echo   Staff    : staff    / staff123
echo.
echo กด Ctrl+C เพื่อหยุดระบบ
echo ─────────────────────────────────────────
node server.js
pause
