#!/bin/bash
#
# Claude Labs v1.7.6 Installer
# TUI-based interactive installer using gum
#

set -e

VERSION="1.7.6"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBAL_CLAUDE_DIR="$HOME/.claude"
LOCAL_CLAUDE_DIR="./.claude"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

check_gum() {
    if ! command -v gum &> /dev/null; then
        echo -e "${YELLOW}gum이 설치되어 있지 않습니다. 설치를 진행합니다...${NC}"

        if command -v brew &> /dev/null; then
            brew install gum
        elif command -v apt-get &> /dev/null; then
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
            echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list
            sudo apt update && sudo apt install gum
        else
            echo -e "${RED}gum을 자동으로 설치할 수 없습니다.${NC}"
            echo "https://github.com/charmbracelet/gum#installation 참조"
            exit 1
        fi
    fi
}

print_banner() {
    gum style \
        --foreground 212 --border-foreground 212 --border double \
        --align center --width 60 --margin "1 2" --padding "1 2" \
        "🧪 Claude Labs v$VERSION" \
        "" \
        "아이디어만으로 풀스택 웹앱을 완성하는 AI 개발 파트너"
}

# ============================================================================
# Installation Steps
# ============================================================================

select_install_scope() {
    echo ""
    gum style --foreground 39 "📍 Step 1: 설치 위치 선택"

    SCOPE=$(gum choose --cursor.foreground 212 \
        "전역 설치 (~/.claude/) - 모든 프로젝트에서 사용" \
        "프로젝트 설치 (./.claude/) - 현재 프로젝트만")

    if [[ "$SCOPE" == *"전역"* ]]; then
        TARGET_DIR="$GLOBAL_CLAUDE_DIR"
        echo -e "${GREEN}✓ 전역 설치 선택됨${NC}"
    else
        TARGET_DIR="$LOCAL_CLAUDE_DIR"
        echo -e "${GREEN}✓ 프로젝트 설치 선택됨${NC}"
    fi
}

select_skill_categories() {
    echo ""
    gum style --foreground 39 "📦 Step 2: 스킬 카테고리 선택"

    CATEGORIES=$(gum choose --no-limit --cursor.foreground 212 --selected.foreground 212 \
        --header "설치할 카테고리를 선택하세요 (Space로 선택, Enter로 확인):" \
        "🎯 Core - socrates, screen-spec, tasks-generator (필수 추천)" \
        "🤖 Orchestration - auto-orchestrate, ultra-thin-orchestrate" \
        "🛡  Quality - code-review, evaluation, guardrails, verification" \
        "🐛 Debug - systematic-debugging, reflection, reasoning" \
        "📚 Reference - fastapi-latest, react-19, rag" \
        "🎨 Design - movin-design-system, paperfolio-design" \
        "🔧 Utility - memory, goal-setting, chrome-browser, deep-research" \
        "📋 All - 모든 스킬 설치")

    echo -e "${GREEN}✓ $(echo "$CATEGORIES" | wc -l | tr -d ' ')개 카테고리 선택됨${NC}"
}

select_constitutions() {
    echo ""
    gum style --foreground 39 "📜 Step 3: 프레임워크 헌법 선택"

    CONSTITUTIONS=$(gum choose --no-limit --cursor.foreground 212 --selected.foreground 212 \
        --header "사용할 프레임워크를 선택하세요:" \
        "🐍 FastAPI - Python 백엔드 (auth, api-design, dotenv)" \
        "⚛️  Next.js - React 프레임워크 (auth, api-routes)" \
        "🗄️  Supabase - BaaS (rls, auth-integration)" \
        "🎨 Tailwind CSS - CSS 프레임워크 (v4-syntax)" \
        "📋 Common - 공통 규칙 (uuid, seed-validation)" \
        "📋 All - 모든 헌법 설치")

    echo -e "${GREEN}✓ $(echo "$CONSTITUTIONS" | wc -l | tr -d ' ')개 헌법 선택됨${NC}"
}

configure_slack_webhook() {
    echo ""
    gum style --foreground 39 "🔔 Step 4: Slack 웹훅 설정 (선택사항)"

    if gum confirm --default=false "Slack 알림을 설정하시겠습니까?"; then
        SLACK_WEBHOOK=$(gum input --placeholder "https://hooks.slack.com/services/..." \
            --header "Slack Webhook URL을 입력하세요:")

        if [[ -n "$SLACK_WEBHOOK" ]]; then
            echo -e "${GREEN}✓ Slack 웹훅 설정됨${NC}"
            SETUP_SLACK=true
        fi
    else
        echo -e "${YELLOW}⏭️  Slack 설정 건너뜀${NC}"
        SETUP_SLACK=false
    fi
}

configure_google_mcp() {
    echo ""
    gum style --foreground 39 "🔧 Step 5: Google MCP 서버 설정 (선택사항)"

    SETUP_GEMINI=false
    SETUP_STITCH=false
    STITCH_API_KEY=""
    GCP_PROJECT_ID=""

    # Google MCP 설치 여부 확인
    echo ""
    gum style --foreground 252 --italic \
        "Stitch MCP: 디자인 목업 자동 생성" \
        "Gemini MCP: 프론트엔드 디자인 코딩 지원" \
        "" \
        "※ 둘 다 GCP 프로젝트 + gcloud 인증이 필요합니다"
    echo ""

    if ! gum confirm --default=true "Google MCP를 설정하시겠습니까?"; then
        echo -e "${YELLOW}⏭️  Google MCP 설정 건너뜀${NC}"
        return
    fi

    # ─────────────────────────────────────────────────────────────
    # Step 5-1: GCP 프로젝트 ID 입력
    # ─────────────────────────────────────────────────────────────
    echo ""
    gum style --foreground 214 --border-foreground 214 --border rounded \
        --width 65 --padding "1 2" \
        "🌐 Step 5-1: Google Cloud 프로젝트 ID" \
        "" \
        "1. Google Cloud Console에서 프로젝트 ID를 확인하세요" \
        "   👉 https://console.cloud.google.com" \
        "" \
        "2. 상단 프로젝트 선택 → 프로젝트 ID 복사" \
        "   (없으면 '새 프로젝트' 생성)"
    echo ""

    if gum confirm --default=true "브라우저에서 Google Cloud Console을 열까요?"; then
        open "https://console.cloud.google.com" 2>/dev/null || \
        xdg-open "https://console.cloud.google.com" 2>/dev/null || \
        echo -e "${YELLOW}브라우저를 자동으로 열 수 없습니다.${NC}"
    fi

    echo ""
    GCP_PROJECT_ID=$(gum input --placeholder "GCP 프로젝트 ID (예: my-project-123)" --width 60)

    if [[ -z "$GCP_PROJECT_ID" ]]; then
        echo -e "${YELLOW}⚠️  프로젝트 ID 미입력 - Google MCP 설정 건너뜀${NC}"
        return
    fi
    echo -e "${GREEN}✓ 프로젝트 ID: $GCP_PROJECT_ID${NC}"

    # ─────────────────────────────────────────────────────────────
    # Step 5-2: gcloud CLI 설치 및 인증
    # ─────────────────────────────────────────────────────────────
    echo ""
    gum style --foreground 214 --border-foreground 214 --border rounded \
        --width 65 --padding "1 2" \
        "🔐 Step 5-2: gcloud CLI 인증" \
        "" \
        "브라우저에서 Google 계정으로 로그인합니다"
    echo ""

    # gcloud 설치 확인
    if ! command -v gcloud &> /dev/null; then
        echo -e "${YELLOW}gcloud CLI가 설치되어 있지 않습니다.${NC}"
        if gum confirm --default=true "gcloud CLI를 설치하시겠습니까?"; then
            if command -v brew &> /dev/null; then
                echo -e "${CYAN}brew로 gcloud CLI 설치 중...${NC}"
                brew install google-cloud-sdk
            else
                echo -e "${RED}brew가 없어서 자동 설치할 수 없습니다.${NC}"
                echo "https://cloud.google.com/sdk/docs/install 에서 수동 설치하세요."
                return
            fi
        else
            echo -e "${YELLOW}⚠️  gcloud 미설치 - Google MCP 설정 건너뜀${NC}"
            return
        fi
    fi

    # gcloud CLI 인증 (gcloud 명령어 실행용)
    echo -e "${CYAN}gcloud CLI 인증을 시작합니다. 브라우저에서 로그인하세요...${NC}"
    if gcloud auth login --quiet; then
        echo -e "${GREEN}✓ gcloud CLI 인증 완료${NC}"
    else
        echo -e "${RED}✗ gcloud CLI 인증 실패${NC}"
        return
    fi

    # 프로젝트 설정
    echo -e "${CYAN}gcloud 프로젝트 설정 중...${NC}"
    gcloud config set project "$GCP_PROJECT_ID" 2>/dev/null
    echo -e "${GREEN}✓ 프로젝트 설정: $GCP_PROJECT_ID${NC}"

    # ADC 인증 (MCP 서버용)
    echo -e "${CYAN}ADC 인증을 시작합니다. 브라우저에서 로그인하세요...${NC}"
    if gcloud auth application-default login --quiet; then
        echo -e "${GREEN}✓ ADC 인증 완료${NC}"
    else
        echo -e "${RED}✗ ADC 인증 실패${NC}"
        return
    fi

    # Gemini MCP는 여기서 설정 가능
    SETUP_GEMINI=true
    echo -e "${GREEN}✓ Gemini MCP 설정 준비 완료${NC}"

    # ─────────────────────────────────────────────────────────────
    # Step 5-3: Stitch API 활성화
    # ─────────────────────────────────────────────────────────────
    echo ""
    gum style --foreground 214 --border-foreground 214 --border rounded \
        --width 65 --padding "1 2" \
        "🔌 Step 5-3: Stitch API 활성화" \
        "" \
        "GCP 프로젝트에서 Stitch API를 활성화합니다."
    echo ""

    if gum confirm --default=true "Stitch API를 활성화하시겠습니까?"; then
        echo -e "${CYAN}Stitch API 활성화 중...${NC}"
        if gcloud beta services mcp enable stitch.googleapis.com --project="$GCP_PROJECT_ID" 2>/dev/null; then
            echo -e "${GREEN}✓ Stitch API 활성화 완료${NC}"
        else
            # beta 명령어가 없을 경우 일반 services enable 시도
            if gcloud services enable stitch.googleapis.com --project="$GCP_PROJECT_ID" 2>/dev/null; then
                echo -e "${GREEN}✓ Stitch API 활성화 완료${NC}"
            else
                echo -e "${YELLOW}⚠️  Stitch API 활성화 실패 - 수동으로 활성화하세요${NC}"
                echo "   https://console.cloud.google.com/apis/library/stitch.googleapis.com"
            fi
        fi
    else
        echo -e "${YELLOW}⏭️  Stitch API 활성화 건너뜀${NC}"
    fi

    # ─────────────────────────────────────────────────────────────
    # Step 5-4: IAM 권한 부여
    # ─────────────────────────────────────────────────────────────
    echo ""
    gum style --foreground 214 --border-foreground 214 --border rounded \
        --width 65 --padding "1 2" \
        "🔑 Step 5-4: IAM 권한 부여" \
        "" \
        "Stitch MCP 사용에 필요한 IAM 권한을 부여합니다." \
        "(roles/serviceusage.serviceUsageConsumer)"
    echo ""

    # 현재 인증된 사용자 이메일 가져오기
    CURRENT_USER=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)

    if [[ -n "$CURRENT_USER" ]]; then
        echo -e "${CYAN}현재 인증된 계정: $CURRENT_USER${NC}"
        if gum confirm --default=true "이 계정에 IAM 권한을 부여하시겠습니까?"; then
            echo -e "${CYAN}IAM 권한 부여 중...${NC}"
            if gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
                --member="user:$CURRENT_USER" \
                --role="roles/serviceusage.serviceUsageConsumer" \
                --quiet 2>/dev/null; then
                echo -e "${GREEN}✓ IAM 권한 부여 완료${NC}"
            else
                echo -e "${YELLOW}⚠️  IAM 권한 부여 실패 - 수동으로 설정하세요${NC}"
                echo "   gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \\"
                echo "     --member=\"user:$CURRENT_USER\" \\"
                echo "     --role=\"roles/serviceusage.serviceUsageConsumer\""
            fi
        else
            echo -e "${YELLOW}⏭️  IAM 권한 부여 건너뜀${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  인증된 계정을 찾을 수 없습니다. 수동으로 IAM 권한을 설정하세요.${NC}"
    fi

    # ─────────────────────────────────────────────────────────────
    # Step 5-5: Stitch API Key (선택)
    # ─────────────────────────────────────────────────────────────
    echo ""
    gum style --foreground 214 --border-foreground 214 --border rounded \
        --width 65 --padding "1 2" \
        "🎨 Step 5-5: Stitch API Key (선택)" \
        "" \
        "Stitch MCP로 디자인 목업을 자동 생성하려면" \
        "API Key가 필요합니다 (없으면 Enter로 건너뛰기)" \
        "" \
        "👉 https://stitch.withgoogle.com/settings"
    echo ""

    if gum confirm --default=true "브라우저에서 Stitch Settings를 열까요?"; then
        open "https://stitch.withgoogle.com/settings" 2>/dev/null || \
        xdg-open "https://stitch.withgoogle.com/settings" 2>/dev/null || \
        echo -e "${YELLOW}브라우저를 자동으로 열 수 없습니다.${NC}"
    fi

    echo ""
    STITCH_API_KEY=$(gum input --placeholder "Stitch API Key (없으면 Enter)" --width 60)

    if [[ -n "$STITCH_API_KEY" ]]; then
        SETUP_STITCH=true
        echo -e "${GREEN}✓ Stitch API Key 입력 완료${NC}"
    else
        echo -e "${YELLOW}⏭️  Stitch API Key 건너뜀 (Gemini MCP만 설정)${NC}"
    fi
}

# ============================================================================
# Installation Logic
# ============================================================================

install_skills() {
    echo ""
    gum style --foreground 39 "⚙️  Installing Skills..."

    mkdir -p "$TARGET_DIR/skills"
    mkdir -p "$TARGET_DIR/agents"
    mkdir -p "$TARGET_DIR/constitutions"
    mkdir -p "$TARGET_DIR/docs"
    mkdir -p "$TARGET_DIR/commands"

    # Determine which skills to install
    INSTALL_ALL=false
    [[ "$CATEGORIES" == *"All"* ]] && INSTALL_ALL=true

    # Copy skills based on selection
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Core"* ]]; then
        gum spin --spinner dot --title "Core 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/socrates/" "$TARGET_DIR/skills/socrates/"
        gum spin --spinner dot --title "Core 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/screen-spec/" "$TARGET_DIR/skills/screen-spec/"
        gum spin --spinner dot --title "Core 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/tasks-generator/" "$TARGET_DIR/skills/tasks-generator/"
    fi

    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Orchestration"* ]]; then
        gum spin --spinner dot --title "Orchestration 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/auto-orchestrate/" "$TARGET_DIR/skills/auto-orchestrate/"
        gum spin --spinner dot --title "Orchestration 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/ultra-thin-orchestrate/" "$TARGET_DIR/skills/ultra-thin-orchestrate/"
    fi

    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Quality"* ]]; then
        gum spin --spinner dot --title "Quality 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/code-review/" "$TARGET_DIR/skills/code-review/"
        gum spin --spinner dot --title "Quality 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/evaluation/" "$TARGET_DIR/skills/evaluation/"
        gum spin --spinner dot --title "Quality 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/guardrails/" "$TARGET_DIR/skills/guardrails/"
        gum spin --spinner dot --title "Quality 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/verification-before-completion/" "$TARGET_DIR/skills/verification-before-completion/"
    fi

    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Debug"* ]]; then
        gum spin --spinner dot --title "Debug 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/systematic-debugging/" "$TARGET_DIR/skills/systematic-debugging/"
        gum spin --spinner dot --title "Debug 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/reflection/" "$TARGET_DIR/skills/reflection/"
        gum spin --spinner dot --title "Debug 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/reasoning/" "$TARGET_DIR/skills/reasoning/"
    fi

    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Reference"* ]]; then
        gum spin --spinner dot --title "Reference 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/fastapi-latest/" "$TARGET_DIR/skills/fastapi-latest/"
        gum spin --spinner dot --title "Reference 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/react-19/" "$TARGET_DIR/skills/react-19/"
        gum spin --spinner dot --title "Reference 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/rag/" "$TARGET_DIR/skills/rag/"
    fi

    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Design"* ]]; then
        gum spin --spinner dot --title "Design 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/movin-design-system/" "$TARGET_DIR/skills/movin-design-system/"
        gum spin --spinner dot --title "Design 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/paperfolio-design/" "$TARGET_DIR/skills/paperfolio-design/"
    fi

    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Utility"* ]]; then
        gum spin --spinner dot --title "Utility 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/memory/" "$TARGET_DIR/skills/memory/"
        gum spin --spinner dot --title "Utility 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/goal-setting/" "$TARGET_DIR/skills/goal-setting/"
        gum spin --spinner dot --title "Utility 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/chrome-browser/" "$TARGET_DIR/skills/chrome-browser/"
        gum spin --spinner dot --title "Utility 스킬 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/skills/deep-research/" "$TARGET_DIR/skills/deep-research/"
    fi

    # Always install remaining essential skills
    for skill in a2a project-bootstrap design-linker kongkong2 ralph-loop; do
        if [[ -d "$SCRIPT_DIR/.claude/skills/$skill" ]]; then
            rsync -a "$SCRIPT_DIR/.claude/skills/$skill/" "$TARGET_DIR/skills/$skill/" 2>/dev/null || true
        fi
    done

    # Install agents and docs
    gum spin --spinner dot --title "에이전트 설치 중..." -- \
        rsync -a "$SCRIPT_DIR/.claude/agents/" "$TARGET_DIR/agents/"
    gum spin --spinner dot --title "문서 설치 중..." -- \
        rsync -a "$SCRIPT_DIR/.claude/docs/" "$TARGET_DIR/docs/"
    gum spin --spinner dot --title "커맨드 설치 중..." -- \
        rsync -a "$SCRIPT_DIR/.claude/commands/" "$TARGET_DIR/commands/"

    echo -e "${GREEN}✓ 스킬 설치 완료${NC}"
}

install_constitutions() {
    echo ""
    gum style --foreground 39 "⚙️  Installing Constitutions..."

    mkdir -p "$TARGET_DIR/constitutions"

    INSTALL_ALL_CONST=false
    [[ "$CONSTITUTIONS" == *"All"* ]] && INSTALL_ALL_CONST=true

    if [[ "$INSTALL_ALL_CONST" == true ]] || [[ "$CONSTITUTIONS" == *"FastAPI"* ]]; then
        gum spin --spinner dot --title "FastAPI 헌법 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/constitutions/fastapi/" "$TARGET_DIR/constitutions/fastapi/"
    fi

    if [[ "$INSTALL_ALL_CONST" == true ]] || [[ "$CONSTITUTIONS" == *"Next.js"* ]]; then
        gum spin --spinner dot --title "Next.js 헌법 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/constitutions/nextjs/" "$TARGET_DIR/constitutions/nextjs/"
    fi

    if [[ "$INSTALL_ALL_CONST" == true ]] || [[ "$CONSTITUTIONS" == *"Supabase"* ]]; then
        gum spin --spinner dot --title "Supabase 헌법 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/constitutions/supabase/" "$TARGET_DIR/constitutions/supabase/"
    fi

    if [[ "$INSTALL_ALL_CONST" == true ]] || [[ "$CONSTITUTIONS" == *"Tailwind"* ]]; then
        gum spin --spinner dot --title "Tailwind 헌법 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/constitutions/tailwind/" "$TARGET_DIR/constitutions/tailwind/"
    fi

    if [[ "$INSTALL_ALL_CONST" == true ]] || [[ "$CONSTITUTIONS" == *"Common"* ]]; then
        gum spin --spinner dot --title "Common 헌법 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/.claude/constitutions/common/" "$TARGET_DIR/constitutions/common/"
    fi

    # Always install README
    cp "$SCRIPT_DIR/.claude/constitutions/README.md" "$TARGET_DIR/constitutions/" 2>/dev/null || true

    echo -e "${GREEN}✓ 헌법 설치 완료${NC}"
}

setup_slack_webhook() {
    if [[ "$SETUP_SLACK" == true ]] && [[ -n "$SLACK_WEBHOOK" ]]; then
        echo ""
        gum style --foreground 39 "⚙️  Configuring Slack Webhook..."

        # Create or update settings.json
        SETTINGS_FILE="$TARGET_DIR/settings.json"

        if [[ -f "$SETTINGS_FILE" ]]; then
            # Update existing file
            TMP_FILE=$(mktemp)
            jq --arg webhook "$SLACK_WEBHOOK" '. + {slack_webhook: $webhook}' "$SETTINGS_FILE" > "$TMP_FILE"
            mv "$TMP_FILE" "$SETTINGS_FILE"
        else
            # Create new file
            echo "{\"slack_webhook\": \"$SLACK_WEBHOOK\"}" > "$SETTINGS_FILE"
        fi

        echo -e "${GREEN}✓ Slack 웹훅 설정 완료${NC}"
    fi
}

setup_gemini_mcp() {
    if [[ "$SETUP_GEMINI" == true ]]; then
        echo ""
        gum style --foreground 39 "⚙️  Installing Gemini MCP Server..."

        MCP_DIR="$HOME/.claude/mcp-servers/gemini-mcp"
        mkdir -p "$HOME/.claude/mcp-servers"

        # Clone or update repository
        if [[ -d "$MCP_DIR" ]]; then
            gum spin --spinner dot --title "Gemini MCP 업데이트 중..." -- \
                git -C "$MCP_DIR" pull 2>/dev/null || true
        else
            gum spin --spinner dot --title "Gemini MCP 클론 중..." -- \
                git clone https://github.com/anthropics/anthropic-quickstarts.git "$MCP_DIR" 2>/dev/null || true
        fi

        # Check if custom gemini-mcp exists in this repo
        if [[ -d "$SCRIPT_DIR/mcp-servers/gemini-mcp" ]]; then
            echo -e "${CYAN}로컬 Gemini MCP 사용${NC}"
            rm -rf "$MCP_DIR"
            cp -r "$SCRIPT_DIR/mcp-servers/gemini-mcp" "$MCP_DIR"
        fi

        # Build if package.json exists
        if [[ -f "$MCP_DIR/package.json" ]]; then
            cd "$MCP_DIR"

            echo -e "${CYAN}npm install 실행 중...${NC}"
            npm install 2>&1 | while read line; do
                echo -e "  ${line}"
            done

            echo -e "${CYAN}npm run build 실행 중...${NC}"
            npm run build 2>&1 | while read line; do
                echo -e "  ${line}"
            done || true

            cd - > /dev/null
        fi

        # Run OAuth authentication
        echo ""
        gum style --foreground 212 --bold \
            "🔐 Google OAuth 인증을 시작합니다." \
            "브라우저가 열리면 Google 계정으로 로그인하세요."
        echo ""

        if gum confirm "OAuth 인증을 진행하시겠습니까?"; then
            if [[ -f "$MCP_DIR/dist/index.js" ]]; then
                # Run auth command (this will open browser)
                node "$MCP_DIR/dist/index.js" auth 2>/dev/null || \
                npx @anthropic-ai/claude-code-mcp auth 2>/dev/null || \
                echo -e "${YELLOW}자동 인증 실패. 수동으로 인증해주세요:${NC}"
                echo -e "  cd $MCP_DIR && npm run auth"
            else
                echo -e "${YELLOW}MCP 서버 빌드를 확인해주세요.${NC}"
                echo -e "  cd $MCP_DIR && npm install && npm run build"
            fi
        fi

        # Add to Claude MCP settings
        CLAUDE_SETTINGS="$GLOBAL_CLAUDE_DIR/settings.json"
        if [[ -f "$CLAUDE_SETTINGS" ]]; then
            # Check if jq is available
            if command -v jq &> /dev/null; then
                TMP_FILE=$(mktemp)
                jq --arg path "$MCP_DIR/dist/index.js" \
                   '.mcpServers.gemini = {"command": "node", "args": [$path]}' \
                   "$CLAUDE_SETTINGS" > "$TMP_FILE" 2>/dev/null && mv "$TMP_FILE" "$CLAUDE_SETTINGS"
            fi
        fi

        echo -e "${GREEN}✓ Gemini MCP 설정 완료${NC}"
    fi
}

setup_stitch_mcp() {
    if [[ "$SETUP_STITCH" == true ]] && [[ -n "$GCP_PROJECT_ID" ]]; then
        echo ""
        gum style --foreground 39 "⚙️  Configuring Stitch MCP Server..."

        # Add to Claude MCP settings
        CLAUDE_SETTINGS="$GLOBAL_CLAUDE_DIR/settings.json"
        mkdir -p "$GLOBAL_CLAUDE_DIR"

        # Build stitch config with GCP Project ID and API Key
        if [[ -n "$STITCH_API_KEY" ]]; then
            STITCH_CONFIG='{"command": "npx", "args": ["-y", "stitch-mcp"], "env": {"GOOGLE_CLOUD_PROJECT": "'"$GCP_PROJECT_ID"'", "STITCH_API_KEY": "'"$STITCH_API_KEY"'"}}'
        else
            STITCH_CONFIG='{"command": "npx", "args": ["-y", "stitch-mcp"], "env": {"GOOGLE_CLOUD_PROJECT": "'"$GCP_PROJECT_ID"'"}}'
        fi

        if [[ -f "$CLAUDE_SETTINGS" ]] && command -v jq &> /dev/null; then
            TMP_FILE=$(mktemp)
            jq --argjson stitch "$STITCH_CONFIG" '.mcpServers.stitch = $stitch' \
               "$CLAUDE_SETTINGS" > "$TMP_FILE" 2>/dev/null && mv "$TMP_FILE" "$CLAUDE_SETTINGS"
        else
            if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
                cat > "$CLAUDE_SETTINGS" << EOF
{
  "mcpServers": {
    "stitch": $STITCH_CONFIG
  }
}
EOF
            fi
        fi

        STITCH_CONFIGURED=true
        if [[ -n "$STITCH_API_KEY" ]]; then
            echo -e "${GREEN}✓ Stitch MCP 설정 완료 (API Key 포함)${NC}"
        else
            echo -e "${YELLOW}✓ Stitch MCP 등록됨 (API Key 미설정)${NC}"
        fi
    fi
}

show_google_mcp_guide() {
    # Show Gemini ADC setup guide (only for Gemini - Stitch uses API key)
    if [[ "$SETUP_GEMINI" == true ]]; then
        echo ""
        gum style --foreground 214 --border-foreground 214 --border rounded \
            --width 65 --padding "1 2" \
            "⚠️  Gemini MCP 사용 전 ADC 설정 필요" \
            "" \
            "📋 Step 1: gcloud CLI 설치" \
            "   https://cloud.google.com/sdk/docs/install" \
            "" \
            "📋 Step 2: ADC 인증" \
            "   \$ gcloud auth application-default login" \
            "   → 브라우저에서 Google 로그인"
    fi

    # Show Stitch API key guide if not provided during setup
    if [[ "$SETUP_STITCH" == true ]] && [[ -z "$STITCH_API_KEY" ]]; then
        echo ""
        gum style --foreground 214 --border-foreground 214 --border rounded \
            --width 65 --padding "1 2" \
            "⚠️  Stitch MCP API Key 설정 필요" \
            "" \
            "1. https://stitch.withgoogle.com/ 접속" \
            "2. 프로필 → Stitch Settings → API Keys" \
            "3. 'Create Key' 클릭 후 복사" \
            "4. ~/.claude/settings.json 에 추가:" \
            "   \"env\": { \"STITCH_API_KEY\": \"your-key\" }"
    fi
}

# ============================================================================
# Post-installation
# ============================================================================

show_completion() {
    echo ""
    INSTALLED_SKILLS=$(ls -1 "$TARGET_DIR/skills" 2>/dev/null | wc -l | tr -d ' ')
    INSTALLED_CONST=$(find "$TARGET_DIR/constitutions" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

    gum style \
        --foreground 82 --border-foreground 82 --border rounded \
        --align center --width 60 --margin "1 2" --padding "1 2" \
        "✅ 설치 완료!" \
        "" \
        "📦 스킬: $INSTALLED_SKILLS개" \
        "📜 헌법: $INSTALLED_CONST개" \
        "📍 위치: $TARGET_DIR"

    # Show MCP Status Summary
    echo ""
    gum style --foreground 39 "🔧 MCP 설정 상태"
    echo ""

    # Check each MCP status
    MCP_STITCH="❌ 미설정"
    MCP_GEMINI="❌ 미설정"
    MCP_CONTEXT7="❌ 미설정"

    CLAUDE_SETTINGS="$GLOBAL_CLAUDE_DIR/settings.json"
    if [[ -f "$CLAUDE_SETTINGS" ]]; then
        if grep -q '"stitch"' "$CLAUDE_SETTINGS" 2>/dev/null; then
            MCP_STITCH="✅ 설정됨 (OAuth 자동)"
        fi
        if grep -q '"gemini"' "$CLAUDE_SETTINGS" 2>/dev/null; then
            MCP_GEMINI="✅ 설정됨"
        fi
        if grep -q '"context7"' "$CLAUDE_SETTINGS" 2>/dev/null; then
            MCP_CONTEXT7="✅ 설정됨"
        fi
    fi

    gum style \
        --foreground 252 --border-foreground 240 --border normal \
        --width 60 --margin "0 2" --padding "1 2" \
        "🎨 Stitch MCP:   $MCP_STITCH" \
        "   → /screen-spec Phase 5 디자인 자동 생성" \
        "" \
        "🤖 Gemini MCP:   $MCP_GEMINI" \
        "   → 프론트엔드 디자인 코딩 지원" \
        "" \
        "📚 Context7 MCP: $MCP_CONTEXT7" \
        "   → 최신 라이브러리 문서 검색"

    # Show Stitch setup guide (API Key - simple!)
    if [[ "$MCP_STITCH" == "❌ 미설정" ]]; then
        echo ""
        gum style --foreground 214 "💡 Stitch MCP 설정 (API Key로 간단!)"
        echo ""
        gum style \
            --foreground 252 --border-foreground 214 --border rounded \
            --width 65 --margin "0 2" --padding "1 2" \
            "GCP 프로젝트 없이 API Key로 간단 설정!" \
            "" \
            "1. API Key 생성:" \
            "   👉 https://stitch.withgoogle.com/settings" \
            "" \
            "2. 인스톨러 재실행:" \
            "   \$ ./install.sh → Stitch MCP 선택 → API Key 입력"
    fi

    # Show Gemini setup guide (ADC required)
    if [[ "$MCP_GEMINI" == "❌ 미설정" ]]; then
        echo ""
        gum style --foreground 81 "💡 Gemini MCP 설정 가이드 (gcloud 필요)"
        echo ""
        gum style \
            --foreground 252 --border-foreground 81 --border rounded \
            --width 65 --margin "0 2" --padding "1 2" \
            "gcloud CLI로 ADC 인증이 필요합니다." \
            "" \
            "📋 Step 1: gcloud CLI 설치" \
            "   https://cloud.google.com/sdk/docs/install" \
            "" \
            "📋 Step 2: ADC 인증" \
            "   \$ gcloud auth application-default login" \
            "   → 브라우저에서 Google 로그인" \
            "" \
            "📋 Step 3: 인스톨러 재실행" \
            "   \$ ./install.sh → Gemini MCP 선택"
    fi

    # Show Context7 setup guide if not configured
    if [[ "$MCP_CONTEXT7" == "❌ 미설정" ]]; then
        echo ""
        gum style --foreground 81 "💡 Context7 MCP 설정 가이드"
        echo ""
        gum style \
            --foreground 252 --border-foreground 81 --border rounded \
            --width 65 --margin "0 2" --padding "1 2" \
            "최신 라이브러리 문서를 검색하는 RAG MCP입니다." \
            "" \
            "📋 인스톨러 재실행으로 간단히 설정:" \
            "   \$ ./install.sh → Context7 MCP 선택" \
            "" \
            "   또는 수동 설정:" \
            "   ~/.claude/settings.json의 mcpServers에 추가:" \
            "   \"context7\": {" \
            "     \"command\": \"npx\"," \
            "     \"args\": [\"-y\", \"@anthropic-ai/context7-mcp\"]" \
            "   }"
    fi

    echo ""
    gum style --foreground 39 "🚀 다음 단계"
    echo ""

    gum style \
        --foreground 252 --border-foreground 240 --border normal \
        --width 60 --margin "0 2" --padding "1 2" \
        "1. Claude Code 실행:" \
        "   $ claude" \
        "" \
        "2. 소크라테스로 기획 시작:" \
        "   > /socrates" \
        "" \
        "3. 기획 완료 후 화면 명세:" \
        "   > /screen-spec  (→ Phase 5: Stitch 디자인)" \
        "" \
        "4. 태스크 생성 및 실행:" \
        "   > /tasks-generator" \
        "   > /auto-orchestrate"

    echo ""

    # Offer to start socrates
    if gum confirm --default=true "지금 바로 /socrates로 기획을 시작하시겠습니까?"; then
        echo ""
        gum style --foreground 212 "💡 Claude Code에서 다음 명령어를 입력하세요:"
        echo ""
        gum style --foreground 82 --bold "   /socrates"
        echo ""

        # Copy to clipboard if possible
        if command -v pbcopy &> /dev/null; then
            echo "/socrates" | pbcopy
            echo -e "${CYAN}(클립보드에 복사됨)${NC}"
        fi
    fi
}

show_quick_reference() {
    echo ""
    if gum confirm --default=false "스킬 퀵 레퍼런스를 보시겠습니까?"; then
        gum style \
            --foreground 252 --border-foreground 212 --border rounded \
            --width 65 --margin "1 2" --padding "1 2" \
            "📚 주요 스킬 퀵 레퍼런스" \
            "" \
            "/socrates     - 1:1 대화로 서비스 기획 (시작점!)" \
            "/screen-spec  - 화면별 상세 명세 생성" \
            "/tasks-generator - TASKS.md 생성" \
            "/auto-orchestrate - 태스크 자동 실행" \
            "" \
            "/code-review  - 코드 품질 검토" \
            "/systematic-debugging - 버그 근본 원인 분석" \
            "" \
            "/deep-research - 5개 검색 API 병렬 리서치" \
            "/chrome-browser - 브라우저 자동화"
    fi
}

# ============================================================================
# Main
# ============================================================================

main() {
    check_gum
    clear
    print_banner

    select_install_scope
    select_skill_categories
    select_constitutions
    configure_slack_webhook
    configure_google_mcp

    echo ""
    gum style --foreground 39 "📋 설치 요약"
    echo ""
    echo "  위치: $TARGET_DIR"
    echo "  카테고리: $(echo "$CATEGORIES" | tr '\n' ', ' | sed 's/,$//')"
    echo "  헌법: $(echo "$CONSTITUTIONS" | tr '\n' ', ' | sed 's/,$//')"
    [[ "$SETUP_SLACK" == true ]] && echo "  Slack: 설정됨"
    [[ "$SETUP_GEMINI" == true ]] && echo "  Gemini MCP: 설치 예정"
    [[ "$SETUP_STITCH" == true ]] && echo "  Stitch MCP: 등록 예정"
    echo ""

    if gum confirm "설치를 진행하시겠습니까?"; then
        echo ""
        install_skills
        install_constitutions
        setup_slack_webhook
        setup_gemini_mcp
        setup_stitch_mcp
        show_google_mcp_guide
        show_completion
        show_quick_reference
    else
        echo -e "${YELLOW}설치가 취소되었습니다.${NC}"
        exit 0
    fi
}

# Run
main "$@"
