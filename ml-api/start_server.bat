@echo off
chcp 65001 >nul
title 참값 ML API Server

echo ========================================
echo   참값(Chamgab) ML API Server
echo   자동 수집-학습-서빙 파이프라인
echo ========================================
echo.

cd /d "%~dp0"

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo https://www.python.org/downloads/ 에서 설치해주세요.
    pause
    exit /b 1
)

REM .env 파일 확인
if not exist ".env" (
    echo [오류] .env 파일이 없습니다.
    echo .env.example을 복사하여 .env를 생성해주세요.
    pause
    exit /b 1
)

echo [시작] 서버를 시작합니다...
echo [스케줄] 자동 스케줄러가 함께 시작됩니다.
echo.
echo   - 매일 06:00  일간 수집
echo   - 매주 월 07:00  주간 수집 + 분석
echo   - 매주 화 03:00  상권 모델 학습
echo   - 매월 1일 08:00  전국 수집
echo   - 매월 2일 03:00  전체 모델 학습
echo.
echo 종료하려면 Ctrl+C를 누르세요.
echo ========================================
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

pause
