# -*- coding: utf-8 -*-
# 참값(Chamgab) ML API Server - PowerShell 실행 스크립트

$Host.UI.RawUI.WindowTitle = "참값 ML API Server"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  참값(Chamgab) ML API Server" -ForegroundColor Cyan
Write-Host "  자동 수집-학습-서빙 파이프라인" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# Python 확인
try {
    $pythonVersion = python --version 2>&1
    Write-Host "[확인] $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[오류] Python이 설치되어 있지 않습니다." -ForegroundColor Red
    Write-Host "https://www.python.org/downloads/ 에서 설치해주세요."
    Read-Host "아무 키나 누르세요"
    exit 1
}

# .env 파일 확인
if (-not (Test-Path ".env")) {
    Write-Host "[오류] .env 파일이 없습니다." -ForegroundColor Red
    Write-Host ".env.example을 복사하여 .env를 생성해주세요."
    Read-Host "아무 키나 누르세요"
    exit 1
}

Write-Host ""
Write-Host "[시작] 서버를 시작합니다..." -ForegroundColor Yellow
Write-Host "[스케줄] 자동 스케줄러가 함께 시작됩니다." -ForegroundColor Yellow
Write-Host ""
Write-Host "  - 매일 06:00    일간 수집" -ForegroundColor Gray
Write-Host "  - 매주 월 07:00  주간 수집 + 분석" -ForegroundColor Gray
Write-Host "  - 매주 화 03:00  상권 모델 학습" -ForegroundColor Gray
Write-Host "  - 매월 1일 08:00  전국 수집" -ForegroundColor Gray
Write-Host "  - 매월 2일 03:00  전체 모델 학습" -ForegroundColor Gray
Write-Host ""
Write-Host "종료하려면 Ctrl+C를 누르세요." -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
