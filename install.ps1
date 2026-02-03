#
# Claude Labs v1.7.6 Installer for Windows
# PowerShell-based interactive installer
#

$ErrorActionPreference = "Stop"
$VERSION = "1.7.6"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$GLOBAL_CLAUDE_DIR = "$env:USERPROFILE\.claude"
$LOCAL_CLAUDE_DIR = ".\.claude"

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Color {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

function Check-Gum {
    if (-not (Get-Command "gum" -ErrorAction SilentlyContinue)) {
        Write-Color "gum이 설치되어 있지 않습니다." "Yellow"
        Write-Color "설치 방법:" "Cyan"
        Write-Host "  scoop install charm-gum"
        Write-Host "  또는"
        Write-Host "  choco install gum"
        Write-Host ""

        $useSimple = Read-Host "gum 없이 간단한 설치를 진행하시겠습니까? (Y/n)"
        if ($useSimple -eq "n" -or $useSimple -eq "N") {
            Write-Color "gum을 먼저 설치해주세요." "Red"
            exit 1
        }
        return $false
    }
    return $true
}

function Print-Banner {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "  🧪 Claude Labs v$VERSION" -ForegroundColor Magenta
    Write-Host "  아이디어만으로 풀스택 웹앱을 완성하는 AI 개발 파트너" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host ""
}

# ============================================================================
# Simple Mode (without gum)
# ============================================================================

function Simple-Install {
    Print-Banner

    # Step 1: Install scope
    Write-Color "Step 1: 설치 위치 선택" "Cyan"
    Write-Host "  1. 전역 설치 (~/.claude/) - 모든 프로젝트에서 사용"
    Write-Host "  2. 프로젝트 설치 (./.claude/) - 현재 프로젝트만"
    $scope = Read-Host "선택 (1 또는 2)"

    if ($scope -eq "1") {
        $script:TARGET_DIR = $GLOBAL_CLAUDE_DIR
        Write-Color "전역 설치 선택됨" "Green"
    } else {
        $script:TARGET_DIR = $LOCAL_CLAUDE_DIR
        Write-Color "프로젝트 설치 선택됨" "Green"
    }

    # Step 2: Skill categories
    Write-Host ""
    Write-Color "Step 2: 스킬 카테고리 선택" "Cyan"
    Write-Host "  1. Core - socrates, screen-spec, tasks-generator (필수 추천)"
    Write-Host "  2. Orchestration - auto-orchestrate, ultra-thin-orchestrate"
    Write-Host "  3. Quality - code-review, evaluation, guardrails"
    Write-Host "  4. Debug - systematic-debugging, reflection, reasoning"
    Write-Host "  5. Reference - fastapi-latest, react-19, rag"
    Write-Host "  6. Design - movin-design-system, paperfolio-design"
    Write-Host "  7. Utility - memory, goal-setting, chrome-browser"
    Write-Host "  A. All - 모든 스킬 설치"
    $categories = Read-Host "선택 (쉼표로 구분, 예: 1,2,3 또는 A)"
    $script:INSTALL_ALL = $categories -match "A"
    $script:SELECTED_CATEGORIES = $categories

    # Step 3: Constitutions
    Write-Host ""
    Write-Color "Step 3: 프레임워크 헌법 선택" "Cyan"
    Write-Host "  1. FastAPI - Python 백엔드"
    Write-Host "  2. Next.js - React 프레임워크"
    Write-Host "  3. Supabase - BaaS"
    Write-Host "  4. Tailwind CSS - CSS 프레임워크"
    Write-Host "  5. Common - 공통 규칙"
    Write-Host "  A. All - 모든 헌법 설치"
    $constitutions = Read-Host "선택 (쉼표로 구분, 예: 1,2 또는 A)"
    $script:INSTALL_ALL_CONST = $constitutions -match "A"
    $script:SELECTED_CONSTITUTIONS = $constitutions

    # Step 4: Slack webhook
    Write-Host ""
    Write-Color "Step 4: Slack 웹훅 설정 (선택사항)" "Cyan"
    $setupSlack = Read-Host "Slack 알림을 설정하시겠습니까? (y/N)"
    if ($setupSlack -eq "y" -or $setupSlack -eq "Y") {
        $script:SLACK_WEBHOOK = Read-Host "Slack Webhook URL"
        $script:SETUP_SLACK = $true
    } else {
        $script:SETUP_SLACK = $false
    }

    # Step 5: Google MCP (Gemini + Stitch)
    Write-Host ""
    Write-Color "Step 5: Google MCP 서버 설정 (선택사항)" "Cyan"
    Write-Host ""
    Write-Host "  Stitch MCP: 디자인 목업 자동 생성" -ForegroundColor Gray
    Write-Host "  Gemini MCP: 프론트엔드 디자인 코딩 지원" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  ※ 둘 다 GCP 프로젝트 + gcloud 인증이 필요합니다" -ForegroundColor Yellow
    Write-Host ""

    $script:SETUP_STITCH = $false
    $script:SETUP_GEMINI = $false
    $script:STITCH_API_KEY = ""
    $script:GCP_PROJECT_ID = ""

    $setupGoogle = Read-Host "Google MCP를 설정하시겠습니까? (Y/n)"
    if ($setupGoogle -eq "n" -or $setupGoogle -eq "N") {
        Write-Color "Google MCP 설정 건너뜀" "Yellow"
    } else {
        # ─────────────────────────────────────────────────────────────
        # Step 5-1: GCP 프로젝트 ID 입력
        # ─────────────────────────────────────────────────────────────
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "  Step 5-1: Google Cloud 프로젝트 ID" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  1. Google Cloud Console에서 프로젝트 ID를 확인하세요"
        Write-Host "     https://console.cloud.google.com" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  2. 상단 프로젝트 선택 -> 프로젝트 ID 복사"
        Write-Host "     (없으면 '새 프로젝트' 생성)"
        Write-Host ""

        $openGcp = Read-Host "브라우저에서 Google Cloud Console을 열까요? (Y/n)"
        if ($openGcp -ne "n" -and $openGcp -ne "N") {
            Start-Process "https://console.cloud.google.com"
        }

        Write-Host ""
        $script:GCP_PROJECT_ID = Read-Host "GCP 프로젝트 ID (예: my-project-123)"

        if (-not $GCP_PROJECT_ID) {
            Write-Color "프로젝트 ID 미입력 - Google MCP 설정 건너뜀" "Yellow"
        } else {
            Write-Color "프로젝트 ID: $GCP_PROJECT_ID" "Green"

            # ─────────────────────────────────────────────────────────────
            # Step 5-2: gcloud CLI 설치 및 인증
            # ─────────────────────────────────────────────────────────────
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Yellow
            Write-Host "  Step 5-2: gcloud CLI 인증" -ForegroundColor Yellow
            Write-Host "========================================" -ForegroundColor Yellow
            Write-Host ""

            # gcloud 설치 확인
            $gcloudExists = Get-Command gcloud -ErrorAction SilentlyContinue
            if (-not $gcloudExists) {
                Write-Color "gcloud CLI가 설치되어 있지 않습니다." "Yellow"
                $installGcloud = Read-Host "gcloud CLI를 설치하시겠습니까? (Y/n)"
                if ($installGcloud -ne "n" -and $installGcloud -ne "N") {
                    # winget으로 설치 시도
                    $wingetExists = Get-Command winget -ErrorAction SilentlyContinue
                    if ($wingetExists) {
                        Write-Color "winget으로 gcloud CLI 설치 중..." "Cyan"
                        winget install Google.CloudSDK
                    } else {
                        # choco로 설치 시도
                        $chocoExists = Get-Command choco -ErrorAction SilentlyContinue
                        if ($chocoExists) {
                            Write-Color "choco로 gcloud CLI 설치 중..." "Cyan"
                            choco install gcloudsdk -y
                        } else {
                            Write-Color "자동 설치 불가. 수동 설치하세요:" "Red"
                            Write-Host "  https://cloud.google.com/sdk/docs/install" -ForegroundColor Cyan
                        }
                    }
                }
            }

            # gcloud 인증
            $gcloudExists = Get-Command gcloud -ErrorAction SilentlyContinue
            if ($gcloudExists) {
                # gcloud CLI 인증 (gcloud 명령어 실행용)
                Write-Host ""
                Write-Color "gcloud CLI 인증을 시작합니다. 브라우저에서 로그인하세요..." "Cyan"
                gcloud auth login --quiet
                Write-Color "gcloud CLI 인증 완료" "Green"

                # 프로젝트 설정
                Write-Color "gcloud 프로젝트 설정 중..." "Cyan"
                gcloud config set project $GCP_PROJECT_ID 2>$null
                Write-Color "프로젝트 설정: $GCP_PROJECT_ID" "Green"

                # ADC 인증 (MCP 서버용)
                Write-Host ""
                Write-Color "ADC 인증을 시작합니다. 브라우저에서 로그인하세요..." "Cyan"
                gcloud auth application-default login --quiet
                Write-Color "ADC 인증 완료" "Green"
                $script:SETUP_GEMINI = $true

                # ─────────────────────────────────────────────────────────────
                # Step 5-3: Stitch API 활성화
                # ─────────────────────────────────────────────────────────────
                Write-Host ""
                Write-Host "========================================" -ForegroundColor Yellow
                Write-Host "  Step 5-3: Stitch API 활성화" -ForegroundColor Yellow
                Write-Host "========================================" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "  GCP 프로젝트에서 Stitch API를 활성화합니다."
                Write-Host ""

                $enableStitch = Read-Host "Stitch API를 활성화하시겠습니까? (Y/n)"
                if ($enableStitch -ne "n" -and $enableStitch -ne "N") {
                    Write-Color "Stitch API 활성화 중..." "Cyan"
                    try {
                        gcloud beta services mcp enable stitch.googleapis.com --project="$GCP_PROJECT_ID" 2>$null
                        Write-Color "Stitch API 활성화 완료" "Green"
                    } catch {
                        try {
                            gcloud services enable stitch.googleapis.com --project="$GCP_PROJECT_ID" 2>$null
                            Write-Color "Stitch API 활성화 완료" "Green"
                        } catch {
                            Write-Color "Stitch API 활성화 실패 - 수동으로 활성화하세요" "Yellow"
                            Write-Host "  https://console.cloud.google.com/apis/library/stitch.googleapis.com" -ForegroundColor Cyan
                        }
                    }
                } else {
                    Write-Color "Stitch API 활성화 건너뜀" "Yellow"
                }

                # ─────────────────────────────────────────────────────────────
                # Step 5-4: IAM 권한 부여
                # ─────────────────────────────────────────────────────────────
                Write-Host ""
                Write-Host "========================================" -ForegroundColor Yellow
                Write-Host "  Step 5-4: IAM 권한 부여" -ForegroundColor Yellow
                Write-Host "========================================" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "  Stitch MCP 사용에 필요한 IAM 권한을 부여합니다."
                Write-Host "  (roles/serviceusage.serviceUsageConsumer)"
                Write-Host ""

                # 현재 인증된 사용자 이메일 가져오기
                $currentUser = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null | Select-Object -First 1

                if ($currentUser) {
                    Write-Host "  현재 인증된 계정: $currentUser" -ForegroundColor Cyan
                    $grantIam = Read-Host "이 계정에 IAM 권한을 부여하시겠습니까? (Y/n)"
                    if ($grantIam -ne "n" -and $grantIam -ne "N") {
                        Write-Color "IAM 권한 부여 중..." "Cyan"
                        try {
                            gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" `
                                --member="user:$currentUser" `
                                --role="roles/serviceusage.serviceUsageConsumer" `
                                --quiet 2>$null
                            Write-Color "IAM 권한 부여 완료" "Green"
                        } catch {
                            Write-Color "IAM 권한 부여 실패 - 수동으로 설정하세요" "Yellow"
                            Write-Host "  gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \" -ForegroundColor Gray
                            Write-Host "    --member=`"user:$currentUser`" \" -ForegroundColor Gray
                            Write-Host "    --role=`"roles/serviceusage.serviceUsageConsumer`"" -ForegroundColor Gray
                        }
                    } else {
                        Write-Color "IAM 권한 부여 건너뜀" "Yellow"
                    }
                } else {
                    Write-Color "인증된 계정을 찾을 수 없습니다. 수동으로 IAM 권한을 설정하세요." "Yellow"
                }
            }

            # ─────────────────────────────────────────────────────────────
            # Step 5-5: Stitch API Key (선택)
            # ─────────────────────────────────────────────────────────────
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Yellow
            Write-Host "  Step 5-5: Stitch API Key (선택)" -ForegroundColor Yellow
            Write-Host "========================================" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  Stitch MCP로 디자인 목업을 자동 생성하려면"
            Write-Host "  API Key가 필요합니다 (없으면 Enter로 건너뛰기)"
            Write-Host ""
            Write-Host "  https://stitch.withgoogle.com/settings" -ForegroundColor Cyan
            Write-Host ""

            $openStitch = Read-Host "브라우저에서 Stitch Settings를 열까요? (Y/n)"
            if ($openStitch -ne "n" -and $openStitch -ne "N") {
                Start-Process "https://stitch.withgoogle.com/settings"
            }

            Write-Host ""
            $script:STITCH_API_KEY = Read-Host "Stitch API Key (없으면 Enter)"

            if ($STITCH_API_KEY) {
                $script:SETUP_STITCH = $true
                Write-Color "Stitch API Key 입력 완료" "Green"
            } else {
                Write-Color "Stitch API Key 건너뜀 (Gemini MCP만 설정)" "Yellow"
            }
        }
    }

    # Confirm
    Write-Host ""
    Write-Color "설치 요약:" "Cyan"
    Write-Host "  위치: $TARGET_DIR"
    Write-Host "  카테고리: $SELECTED_CATEGORIES"
    Write-Host "  헌법: $SELECTED_CONSTITUTIONS"
    if ($SETUP_SLACK) { Write-Host "  Slack: 설정됨" }
    if ($SETUP_GEMINI) { Write-Host "  Gemini MCP: 설치 예정" }
    if ($SETUP_STITCH) { Write-Host "  Stitch MCP: 등록 예정" }
    Write-Host ""

    $confirm = Read-Host "설치를 진행하시겠습니까? (Y/n)"
    if ($confirm -eq "n" -or $confirm -eq "N") {
        Write-Color "설치가 취소되었습니다." "Yellow"
        exit 0
    }

    # Install
    Install-Skills
    Install-Constitutions
    Setup-SlackWebhook
    Setup-GeminiMCP
    Setup-StitchMCP
    Show-Completion
}

# ============================================================================
# Installation Logic
# ============================================================================

function Install-Skills {
    Write-Host ""
    Write-Color "Installing Skills..." "Cyan"

    # Create directories
    New-Item -ItemType Directory -Force -Path "$TARGET_DIR\skills" | Out-Null
    New-Item -ItemType Directory -Force -Path "$TARGET_DIR\agents" | Out-Null
    New-Item -ItemType Directory -Force -Path "$TARGET_DIR\constitutions" | Out-Null
    New-Item -ItemType Directory -Force -Path "$TARGET_DIR\docs" | Out-Null
    New-Item -ItemType Directory -Force -Path "$TARGET_DIR\commands" | Out-Null

    # Copy skills based on selection
    $skillsToCopy = @()

    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "1") {
        $skillsToCopy += "socrates", "screen-spec", "tasks-generator"
    }
    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "2") {
        $skillsToCopy += "auto-orchestrate", "ultra-thin-orchestrate"
    }
    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "3") {
        $skillsToCopy += "code-review", "evaluation", "guardrails", "verification-before-completion"
    }
    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "4") {
        $skillsToCopy += "systematic-debugging", "reflection", "reasoning"
    }
    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "5") {
        $skillsToCopy += "fastapi-latest", "react-19", "rag"
    }
    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "6") {
        $skillsToCopy += "movin-design-system", "paperfolio-design"
    }
    if ($INSTALL_ALL -or $SELECTED_CATEGORIES -match "7") {
        $skillsToCopy += "memory", "goal-setting", "chrome-browser", "deep-research"
    }

    # Always include essential skills
    $skillsToCopy += "a2a", "project-bootstrap", "design-linker", "kongkong2", "ralph-loop"
    $skillsToCopy = $skillsToCopy | Select-Object -Unique

    foreach ($skill in $skillsToCopy) {
        $source = "$SCRIPT_DIR\.claude\skills\$skill"
        if (Test-Path $source) {
            Write-Host "  Installing $skill..." -NoNewline
            Copy-Item -Recurse -Force $source "$TARGET_DIR\skills\$skill"
            Write-Color " Done" "Green"
        }
    }

    # Install agents, docs, commands
    Write-Host "  Installing agents..." -NoNewline
    Copy-Item -Recurse -Force "$SCRIPT_DIR\.claude\agents\*" "$TARGET_DIR\agents\"
    Write-Color " Done" "Green"

    Write-Host "  Installing docs..." -NoNewline
    Copy-Item -Recurse -Force "$SCRIPT_DIR\.claude\docs\*" "$TARGET_DIR\docs\"
    Write-Color " Done" "Green"

    Write-Host "  Installing commands..." -NoNewline
    Copy-Item -Recurse -Force "$SCRIPT_DIR\.claude\commands\*" "$TARGET_DIR\commands\"
    Write-Color " Done" "Green"

    Write-Color "Skills installation complete!" "Green"
}

function Install-Constitutions {
    Write-Host ""
    Write-Color "Installing Constitutions..." "Cyan"

    $constToCopy = @()

    if ($INSTALL_ALL_CONST -or $SELECTED_CONSTITUTIONS -match "1") {
        $constToCopy += "fastapi"
    }
    if ($INSTALL_ALL_CONST -or $SELECTED_CONSTITUTIONS -match "2") {
        $constToCopy += "nextjs"
    }
    if ($INSTALL_ALL_CONST -or $SELECTED_CONSTITUTIONS -match "3") {
        $constToCopy += "supabase"
    }
    if ($INSTALL_ALL_CONST -or $SELECTED_CONSTITUTIONS -match "4") {
        $constToCopy += "tailwind"
    }
    if ($INSTALL_ALL_CONST -or $SELECTED_CONSTITUTIONS -match "5") {
        $constToCopy += "common"
    }

    foreach ($const in $constToCopy) {
        $source = "$SCRIPT_DIR\.claude\constitutions\$const"
        if (Test-Path $source) {
            Write-Host "  Installing $const constitution..." -NoNewline
            Copy-Item -Recurse -Force $source "$TARGET_DIR\constitutions\$const"
            Write-Color " Done" "Green"
        }
    }

    # Copy README
    Copy-Item -Force "$SCRIPT_DIR\.claude\constitutions\README.md" "$TARGET_DIR\constitutions\" -ErrorAction SilentlyContinue

    Write-Color "Constitutions installation complete!" "Green"
}

function Setup-SlackWebhook {
    if ($SETUP_SLACK -and $SLACK_WEBHOOK) {
        Write-Host ""
        Write-Color "Configuring Slack Webhook..." "Cyan"

        $settingsFile = "$TARGET_DIR\settings.json"

        if (Test-Path $settingsFile) {
            $settings = Get-Content $settingsFile | ConvertFrom-Json
            $settings | Add-Member -NotePropertyName "slack_webhook" -NotePropertyValue $SLACK_WEBHOOK -Force
            $settings | ConvertTo-Json | Set-Content $settingsFile
        } else {
            @{ slack_webhook = $SLACK_WEBHOOK } | ConvertTo-Json | Set-Content $settingsFile
        }

        Write-Color "Slack webhook configured!" "Green"
    }
}

function Setup-GeminiMCP {
    if ($SETUP_GEMINI) {
        Write-Host ""
        Write-Color "Installing Gemini MCP Server..." "Cyan"

        $mcpDir = "$GLOBAL_CLAUDE_DIR\mcp-servers\gemini-mcp"
        New-Item -ItemType Directory -Force -Path "$GLOBAL_CLAUDE_DIR\mcp-servers" | Out-Null

        # Check if local gemini-mcp exists
        $localMcp = "$SCRIPT_DIR\mcp-servers\gemini-mcp"
        if (Test-Path $localMcp) {
            Write-Host "  Using local Gemini MCP..."
            Copy-Item -Recurse -Force $localMcp $mcpDir
        } else {
            Write-Host "  Cloning Gemini MCP..."
            if (Test-Path $mcpDir) {
                git -C $mcpDir pull 2>$null
            } else {
                git clone https://github.com/anthropics/anthropic-quickstarts.git $mcpDir 2>$null
            }
        }

        # Build if package.json exists
        if (Test-Path "$mcpDir\package.json") {
            Write-Host "  Running npm install..."
            Push-Location $mcpDir
            npm install 2>&1 | ForEach-Object { Write-Host "    $_" }

            Write-Host "  Running npm run build..."
            npm run build 2>&1 | ForEach-Object { Write-Host "    $_" }
            Pop-Location
        }

        # OAuth authentication
        Write-Host ""
        Write-Color "Google OAuth 인증을 시작합니다." "Magenta"
        Write-Host "브라우저가 열리면 Google 계정으로 로그인하세요."
        Write-Host ""

        $runAuth = Read-Host "OAuth 인증을 진행하시겠습니까? (Y/n)"
        if ($runAuth -ne "n" -and $runAuth -ne "N") {
            if (Test-Path "$mcpDir\dist\index.js") {
                node "$mcpDir\dist\index.js" auth
            } else {
                Write-Color "MCP 서버 빌드를 확인해주세요." "Yellow"
                Write-Host "  cd $mcpDir"
                Write-Host "  npm install && npm run build"
            }
        }

        Write-Color "Gemini MCP setup complete!" "Green"
    }
}

function Setup-StitchMCP {
    if ($SETUP_STITCH -and $GCP_PROJECT_ID) {
        Write-Host ""
        Write-Color "Configuring Stitch MCP Server..." "Cyan"

        # Add to Claude MCP settings
        $claudeSettings = "$GLOBAL_CLAUDE_DIR\settings.json"
        New-Item -ItemType Directory -Force -Path $GLOBAL_CLAUDE_DIR | Out-Null

        # Build config with GCP Project ID and optional API key
        if ($STITCH_API_KEY) {
            $stitchConfig = @{
                command = "npx"
                args = @("-y", "stitch-mcp")
                env = @{
                    GOOGLE_CLOUD_PROJECT = $GCP_PROJECT_ID
                    STITCH_API_KEY = $STITCH_API_KEY
                }
            }
        } else {
            $stitchConfig = @{
                command = "npx"
                args = @("-y", "stitch-mcp")
                env = @{
                    GOOGLE_CLOUD_PROJECT = $GCP_PROJECT_ID
                }
            }
        }

        if (Test-Path $claudeSettings) {
            $settings = Get-Content $claudeSettings | ConvertFrom-Json
            if (-not $settings.mcpServers) {
                $settings | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force
            }
            $settings.mcpServers | Add-Member -NotePropertyName "stitch" -NotePropertyValue $stitchConfig -Force
            $settings | ConvertTo-Json -Depth 10 | Set-Content $claudeSettings
        } else {
            @{
                mcpServers = @{
                    stitch = $stitchConfig
                }
            } | ConvertTo-Json -Depth 10 | Set-Content $claudeSettings
        }

        Write-Host ""
        if ($STITCH_API_KEY) {
            Write-Color "Stitch MCP 설정 완료 (API Key 포함)!" "Green"
        } else {
            Write-Color "Stitch MCP 등록됨 (API Key 미설정)" "Yellow"
        }
        Write-Host ""
        Write-Host "  첫 사용 시 Google Cloud 인증이 필요합니다:" -ForegroundColor Yellow
        Write-Host "    1. gcloud auth login"
        Write-Host "    2. gcloud auth application-default login"
        Write-Host ""
        Write-Color "/screen-spec Phase 5 실행 시 자동 안내됩니다." "Cyan"
    }
}

function Show-Completion {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Installation Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Location: $TARGET_DIR"

    $skillCount = (Get-ChildItem "$TARGET_DIR\skills" -Directory -ErrorAction SilentlyContinue).Count
    $constCount = (Get-ChildItem "$TARGET_DIR\constitutions" -Recurse -Filter "*.md" -ErrorAction SilentlyContinue).Count
    Write-Host "  Skills: $skillCount"
    Write-Host "  Constitutions: $constCount"

    # Check MCP status
    Write-Host ""
    Write-Color "MCP 설정 상태:" "Cyan"
    Write-Host ""

    $claudeSettings = "$GLOBAL_CLAUDE_DIR\settings.json"
    $mcpStitch = "X 미설정"
    $mcpGemini = "X 미설정"
    $mcpContext7 = "X 미설정"

    if (Test-Path $claudeSettings) {
        $content = Get-Content $claudeSettings -Raw
        if ($content -match '"stitch"') { $mcpStitch = "O 설정됨" }
        if ($content -match '"gemini"') { $mcpGemini = "O 설정됨" }
        if ($content -match '"context7"') { $mcpContext7 = "O 설정됨" }
    }

    Write-Host "  Stitch MCP:   $mcpStitch" -ForegroundColor $(if ($mcpStitch -match "설정됨") { "Green" } else { "Yellow" })
    Write-Host "    -> /screen-spec Phase 5 디자인 자동 생성"
    Write-Host ""
    Write-Host "  Gemini MCP:   $mcpGemini" -ForegroundColor $(if ($mcpGemini -match "설정됨") { "Green" } else { "Yellow" })
    Write-Host "    -> 프론트엔드 디자인 코딩 지원"
    Write-Host ""
    Write-Host "  Context7 MCP: $mcpContext7" -ForegroundColor $(if ($mcpContext7 -match "설정됨") { "Green" } else { "Yellow" })
    Write-Host "    -> 최신 라이브러리 문서 검색"

    # Show Stitch setup guide (API Key - simple!)
    if ($mcpStitch -match "미설정") {
        Write-Host ""
        Write-Host "----------------------------------------" -ForegroundColor Yellow
        Write-Color "Stitch MCP 설정 (API Key로 간단!)" "Yellow"
        Write-Host "----------------------------------------" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  1. API Key 생성:"
        Write-Host "     https://stitch.withgoogle.com/settings" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  2. 인스톨러 재실행:"
        Write-Host "     > .\install.ps1 -> Stitch MCP 선택 -> API Key 입력"
        Write-Host ""
    }

    # Show Gemini setup guide (ADC required)
    if ($mcpGemini -match "미설정") {
        Write-Host ""
        Write-Host "----------------------------------------" -ForegroundColor Cyan
        Write-Color "Gemini MCP 설정 가이드 (gcloud 필요)" "Cyan"
        Write-Host "----------------------------------------" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Step 1: gcloud CLI 설치"
        Write-Host "    https://cloud.google.com/sdk/docs/install"
        Write-Host ""
        Write-Host "  Step 2: ADC 인증"
        Write-Host "    > gcloud auth application-default login"
        Write-Host "    -> 브라우저에서 Google 로그인"
        Write-Host ""
        Write-Host "  Step 3: 인스톨러 재실행"
        Write-Host "    > .\install.ps1 -> Gemini MCP 선택"
        Write-Host ""
    }

    Write-Host ""
    Write-Color "Next Steps:" "Cyan"
    Write-Host ""
    Write-Host "  1. Claude Code 실행:"
    Write-Host "     > claude"
    Write-Host ""
    Write-Host "  2. 소크라테스로 기획 시작:"
    Write-Host "     > /socrates"
    Write-Host ""
    Write-Host "  3. 기획 완료 후 화면 명세:"
    Write-Host "     > /screen-spec"
    Write-Host ""
    Write-Host "  4. 태스크 생성 및 실행:"
    Write-Host "     > /tasks-generator"
    Write-Host "     > /auto-orchestrate"
    Write-Host ""

    # Copy to clipboard
    Set-Clipboard -Value "/socrates"
    Write-Color "/socrates 가 클립보드에 복사되었습니다." "Cyan"
}

# ============================================================================
# Gum Mode (with gum)
# ============================================================================

function Gum-Install {
    Clear-Host

    # Banner
    gum style --foreground 212 --border-foreground 212 --border double `
        --align center --width 60 --margin "1 2" --padding "1 2" `
        "🧪 Claude Labs v$VERSION" "" "아이디어만으로 풀스택 웹앱을 완성하는 AI 개발 파트너"

    # Step 1: Install scope
    Write-Host ""
    gum style --foreground 39 "Step 1: 설치 위치 선택"

    $scope = gum choose --cursor.foreground 212 `
        "전역 설치 (~/.claude/) - 모든 프로젝트에서 사용" `
        "프로젝트 설치 (./.claude/) - 현재 프로젝트만"

    if ($scope -match "전역") {
        $script:TARGET_DIR = $GLOBAL_CLAUDE_DIR
    } else {
        $script:TARGET_DIR = $LOCAL_CLAUDE_DIR
    }

    # Step 2: Skill categories
    Write-Host ""
    gum style --foreground 39 "Step 2: 스킬 카테고리 선택"

    $categories = gum choose --no-limit --cursor.foreground 212 `
        "Core - socrates, screen-spec, tasks-generator (필수 추천)" `
        "Orchestration - auto-orchestrate, ultra-thin-orchestrate" `
        "Quality - code-review, evaluation, guardrails" `
        "Debug - systematic-debugging, reflection, reasoning" `
        "Reference - fastapi-latest, react-19, rag" `
        "Design - movin-design-system, paperfolio-design" `
        "Utility - memory, goal-setting, chrome-browser" `
        "All - 모든 스킬 설치"

    $script:INSTALL_ALL = $categories -match "All"
    $script:SELECTED_CATEGORIES = $categories

    # Step 3: Constitutions
    Write-Host ""
    gum style --foreground 39 "Step 3: 프레임워크 헌법 선택"

    $constitutions = gum choose --no-limit --cursor.foreground 212 `
        "FastAPI - Python 백엔드" `
        "Next.js - React 프레임워크" `
        "Supabase - BaaS" `
        "Tailwind CSS - CSS 프레임워크" `
        "Common - 공통 규칙" `
        "All - 모든 헌법 설치"

    $script:INSTALL_ALL_CONST = $constitutions -match "All"
    $script:SELECTED_CONSTITUTIONS = $constitutions

    # Step 4: Slack
    Write-Host ""
    gum style --foreground 39 "Step 4: Slack 웹훅 설정 (선택사항)"

    if (gum confirm --default=false "Slack 알림을 설정하시겠습니까?") {
        $script:SLACK_WEBHOOK = gum input --placeholder "https://hooks.slack.com/services/..."
        $script:SETUP_SLACK = $true
    } else {
        $script:SETUP_SLACK = $false
    }

    # Step 5: Gemini
    Write-Host ""
    gum style --foreground 39 "Step 5: Gemini MCP 서버 설정 (선택사항)"
    gum style --foreground 252 --italic "Gemini MCP는 OAuth 인증을 사용합니다."

    $script:SETUP_GEMINI = gum confirm --default=false "Gemini MCP를 설치하시겠습니까?"

    # Step 6: Stitch
    Write-Host ""
    gum style --foreground 39 "Step 6: Google Stitch MCP 서버 설정 (선택사항)"
    gum style --foreground 252 --italic "Stitch MCP는 YAML 화면 명세에서 디자인 목업을 자동 생성합니다."

    $script:SETUP_STITCH = gum confirm --default=false "Stitch MCP를 설치하시겠습니까?"

    # Confirm and install
    Write-Host ""
    if (gum confirm "설치를 진행하시겠습니까?") {
        Install-Skills
        Install-Constitutions
        Setup-SlackWebhook
        Setup-GeminiMCP
        Setup-StitchMCP
        Show-Completion
    } else {
        Write-Color "설치가 취소되었습니다." "Yellow"
    }
}

# ============================================================================
# Main
# ============================================================================

$hasGum = Check-Gum

if ($hasGum) {
    Gum-Install
} else {
    Simple-Install
}
