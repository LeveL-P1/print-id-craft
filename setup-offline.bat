@echo off
echo =======================================
echo Print ID Craft Offline Installation
echo =======================================
echo.
echo Please ensure your Database server is running.
echo Also ensure you have configured your DATABASE_URL in the .env file.
echo.

set /p DB_PROVIDER="Which database are you using? (1: MySQL, 2: PostgreSQL) [1]: "
if "%DB_PROVIDER%"=="" set DB_PROVIDER=1

if "%DB_PROVIDER%"=="1" (
    echo Setting Prisma to use MySQL...
    call npm run db:use:mysql
) else (
    echo Setting Prisma to use PostgreSQL...
    call npm run db:use:postgres
)

echo.
echo Pushing schema to database...
call npm run db:push

echo.
echo Seeding initial templates and user...
call npm run seed

echo.
echo Setup Complete! 
echo Run 'npm run dev' to start the application offline.
pause
