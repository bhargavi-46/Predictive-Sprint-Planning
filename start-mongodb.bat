@echo off
REM ---------------------------------------------------------------------
REM Starts the local MongoDB server for this project.
REM Double-click this file, or run it from a terminal, before starting
REM the backend. Leave the window open while you work.
REM ---------------------------------------------------------------------

set MONGO_HOME=C:\mongodb

if not exist "%MONGO_HOME%\bin\mongod.exe" (
    echo.
    echo   ERROR: MongoDB was not found at %MONGO_HOME%
    echo   Re-download it from https://www.mongodb.com/try/download/community
    echo   and extract so that %MONGO_HOME%\bin\mongod.exe exists.
    echo.
    pause
    exit /b 1
)

REM Already running? Do not start a second copy - it would fail to lock the data files.
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I "mongod.exe" >NUL
if not errorlevel 1 (
    echo.
    echo   MongoDB is already running. Nothing to do.
    echo.
    exit /b 0
)

if not exist "%MONGO_HOME%\data" mkdir "%MONGO_HOME%\data"
if not exist "%MONGO_HOME%\log"  mkdir "%MONGO_HOME%\log"

echo.
echo   Starting MongoDB on port 27017...
echo   Data directory: %MONGO_HOME%\data
echo   Keep this window open. Press Ctrl+C to stop.
echo.

"%MONGO_HOME%\bin\mongod.exe" --dbpath "%MONGO_HOME%\data" --port 27017
