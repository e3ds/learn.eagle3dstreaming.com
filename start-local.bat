@echo off
REM [E3DS-LEARN-LOCAL] Clone the repo, run this, edit the docs. That is the whole
REM setup.
REM
REM It starts the same server.js that serves learn.eagle3dstreaming.com, against
REM the same site/ folder, and opens a browser at it. Anything edited here is
REM edited in the working copy, so it shows up as a normal git change.
REM
REM WHY A DIFFERENT DEFAULT PORT. Production on this machine already holds 6500.
REM Starting a second copy there fails with EADDRINUSE and the message scrolls
REM past, leaving a browser pointed at the LIVE site while you believe you are
REM editing locally - which is how someone edits production by accident. 6510
REM cannot collide, and LEARN_PORT still overrides it.

setlocal
cd /d "%~dp0"

if "%LEARN_PORT%"=="" set "LEARN_PORT=6510"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Node.js is not on PATH. Install it from https://nodejs.org and run this again.
    echo.
    pause
    exit /b 1
)

REM Editing is gated by this file and it is gitignored on purpose - a shared
REM password has no business in a repository. A fresh clone therefore has none,
REM and the editor would be silently disabled with no explanation. One is
REM written here so a clone can edit immediately, and it is announced rather
REM than hidden.
if not exist "editor-password.txt" (
    echo local> "editor-password.txt"
    echo.
    echo   No editor-password.txt found, so one was created for local use.
    echo   The password is:  local
    echo   It is gitignored and never leaves this machine.
)

echo.
echo   Serving this working copy on http://localhost:%LEARN_PORT%
echo.
echo   To edit a page, add ?edit=1 to its address, for example
echo     http://localhost:%LEARN_PORT%/?edit=1
echo     http://localhost:%LEARN_PORT%/wiki/getting-started?edit=1
echo.
echo   Change the text in place and press Save. A timestamped copy of the
echo   previous version is kept in .backups\ before anything is overwritten.
echo.
echo   After editing content, run:  node build.js
echo   That regenerates the pages, the navigation and sitemap.xml.
echo.
echo   Press Ctrl+C to stop.
echo.

REM Give the server a moment to bind before the browser asks for the page,
REM otherwise the first load races it and shows a connection error.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%LEARN_PORT%/"

node server.js

echo.
echo   Server stopped.
pause
