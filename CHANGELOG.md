# Changelog

> 모든 주요 변경사항이 이 파일에 기록됩니다.

---

## [v1.7.6] - 2026-01-29

### 🧪 Claude Labs 브랜딩 + Eureka 아이디에이션 + PowerQA 자동 QA 사이클링 + Stitch MCP 인스톨러 개선

> **프로젝트명 변경: "Claude Code Skills Pack" → "Claude Labs"**
> 바이브랩스 채널과 일관된 브랜딩으로 통일

---

### 브랜딩 변경

| 항목 | 이전 | 이후 |
|------|------|------|
| 프로젝트명 | Claude Code Skills Pack | **Claude Labs** |
| 슬로건 | AI 코딩 에이전트를 위한 스킬 & 헌법 모음 | **아이디어만으로 풀스택 웹앱을 완성하는 AI 개발 파트너** |
| ZIP 파일 | claude-skills-v*.zip | **claude-labs-v*.zip** |

---

### Eureka 아이디에이션 + PowerQA 자동 QA 사이클링

> **추상적 아이디어 → AI 재귀적 사고 → 3-4개 구체적 MVP 제안 → 자동 개발 진행**

---

### 핵심 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│  Eureka - AI 재귀적 사고 기반 아이디에이션                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /eureka "여행 일정 공유 서비스"                                │
│       ↓                                                         │
│  AI 재귀적 사고 (Expand → Research → Evolve → Validate)        │
│       ↓                                                         │
│  3-4개 구체적 MVP 제안 카드 (⭐ MVP 추천 포함)                  │
│       ↓                                                         │
│  사용자 선택 → /screen-spec → /tasks-generator 자동 진행       │
│                                                                 │
│  특징:                                                          │
│  ├── WebSearch로 실시간 시장 조사                               │
│  ├── 기존 솔루션 분석 및 차별점 도출                            │
│  ├── 복잡도 기반 MVP 추천                                       │
│  └── 선택 후 개발 파이프라인 자동 연결                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PowerQA - 자동 QA 사이클링 워크플로우                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /powerqa --tests    → 테스트 통과까지 자동 수정                │
│  /powerqa --build    → 빌드 성공까지 자동 수정                  │
│  /powerqa --lint     → 린트 에러 0까지 자동 수정                │
│  /powerqa --all      → 전부 통과까지 자동 수정                  │
│                                                                 │
│  특징:                                                          │
│  ├── 최대 5사이클 (무한루프 방지)                               │
│  ├── 동일 실패 3회 시 조기 종료                                 │
│  ├── 언어/프레임워크 자동 감지                                  │
│  └── 기존 specialist 에이전트 활용                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 새로운 스킬

| 스킬 | 설명 |
|------|------|
| `/eureka` | AI 재귀적 사고로 추상적 아이디어를 구체적 MVP 제안으로 변환 |
| `/powerqa` | 자동 QA 사이클링 - 테스트, 빌드, 린트, 타입체크 자동화 |

### screen-spec 자동 모드

| 기능 | 설명 |
|------|------|
| 자동 모드 (기본) | 중간 질문 없이 전체 프로세스 완료 |
| 대화형 모드 | `--interactive` 플래그로 각 단계 확인 |

### tasks-generator 워크플로우 연결 (버그 수정)

| 수정 | 설명 |
|------|------|
| 다음 단계 제안 추가 | TASKS.md 생성 후 `/project-bootstrap` 또는 `/auto-orchestrate` 선택 제안 |
| 권장 워크플로우 명시 | `/socrates` → `/screen-spec` → `/tasks-generator` → `/project-bootstrap` → `/auto-orchestrate` |

### 스킬 슬림화 (Skill Slimming)

> **SKILL.md 파일 크기를 60-70% 감소시켜 Claude가 워크플로우 연결을 놓치지 않도록 개선**

| 스킬 | 변경 전 | 변경 후 | 감소율 |
|------|---------|---------|--------|
| `socrates` | 849줄 | 178줄 | **79%** |
| `screen-spec` | 408줄 | 162줄 | **60%** |
| `tasks-generator` | 436줄 | 151줄 | **65%** |
| `project-bootstrap` | 580줄 | 166줄 | **71%** |

**슬림화 전략:**
- SKILL.md: 워크플로우 개요 + 핵심 원칙 + 다음 단계만 유지
- 상세 내용: `references/phase-details.md`로 분리
- 워크플로우 허브: `.claude/docs/workflow-chain.md` 신규 생성

### 새로운 파일

| 파일 | 내용 |
|------|------|
| `docs/workflow-chain.md` | 스킬 간 워크플로우 연결 허브 |
| `skills/socrates/references/phase-details.md` | Phase별 상세 가이드 (분리) |
| `skills/screen-spec/references/phase-details.md` | Phase별 상세 가이드 (분리) |
| `skills/tasks-generator/references/phase-details.md` | Phase별 상세 가이드 (분리) |
| `skills/project-bootstrap/references/phase-details.md` | 단계별 상세 가이드 (분리) |
| `skills/eureka/SKILL.md` | Eureka 아이디에이션 메인 스킬 |
| `skills/eureka/references/thinking-process.md` | 재귀적 사고 프로세스 상세 |
| `skills/eureka/references/proposal-template.md` | 제안 카드 템플릿 및 출력 포맷 |
| `skills/powerqa/SKILL.md` | PowerQA 메인 스킬 |
| `skills/powerqa/references/verification-commands.md` | 언어별 검증 명령어 |
| `skills/powerqa/references/error-patterns.md` | 에러 패턴 매핑 |

---

### Stitch MCP 인스톨러 워크플로우 개선

> **3단계 가이드로 Stitch MCP 설정 완전 자동화 (Mac/Windows 모두 지원)**

```
┌─────────────────────────────────────────────────────────────────┐
│  기존: API Key만 입력 → Stitch MCP 연결 실패                    │
│  개선: 5단계 워크플로우 → 완벽한 설정 가이드                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 5-1: GCP 프로젝트 ID 입력                                │
│     → console.cloud.google.com 링크 안내                       │
│                                                                 │
│  Step 5-2: gcloud CLI 설치 + ADC 인증                          │
│     → Mac: brew install google-cloud-sdk                       │
│     → Windows: winget install Google.CloudSDK                  │
│     → gcloud auth application-default login 실행               │
│                                                                 │
│  Step 5-3: Stitch API 활성화 (NEW!)                            │
│     → gcloud beta services mcp enable stitch.googleapis.com    │
│                                                                 │
│  Step 5-4: IAM 권한 부여 (NEW!)                                │
│     → roles/serviceusage.serviceUsageConsumer 자동 부여        │
│                                                                 │
│  Step 5-5: Stitch API Key 입력 (선택)                          │
│     → stitch.withgoogle.com/settings 링크 안내                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**변경된 파일:**

| 파일 | 변경 내용 |
|------|----------|
| `install.sh` | 3단계 Stitch MCP 워크플로우 + gcloud 자동 설치 (Mac/Linux) |
| `install.ps1` | 3단계 Stitch MCP 워크플로우 + winget/choco gcloud 설치 (Windows) |

**해결된 문제:**

| 문제 | 해결 |
|------|------|
| API Key만으로 Stitch 연결 안 됨 | GCP Project ID + ADC 인증 추가 |
| gcloud 미설치 시 인증 실패 | 자동 설치 가이드 추가 |
| 설정 과정 불명확 | 단계별 안내 메시지 추가 |

**MCP 설정 결과:**

```json
"stitch": {
  "command": "npx",
  "args": ["-y", "stitch-mcp"],
  "env": {
    "GOOGLE_CLOUD_PROJECT": "your-project-id",
    "STITCH_API_KEY": "your-api-key"
  }
}
```

---

## [v1.7.5] - 2026-01-26

### 소크라테스 개인화 기능 강화

> **사용자 프로필 시스템 도입으로 반복 질문 제거**

---

### 핵심 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│  문제: 매 세션마다 레벨 측정 질문(3개) 반복 → 사용자 피로감     │
│  해결: 사용자 프로필 시스템으로 학습 정보 영속화                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Before:                                                        │
│  ❌ 매번 "프로그래밍 경험이 있으신가요?" 질문                   │
│  ❌ 매번 "기획 경험은요?" 질문                                  │
│  ❌ 사용자 정보가 세션 간 유지되지 않음                         │
│                                                                 │
│  After:                                                         │
│  ✅ 첫 세션에서 레벨 측정 → 프로필 저장                         │
│  ✅ 다음 세션부터 "다시 만나서 반가워요!" 인사                  │
│  ✅ 레벨 재측정은 사용자 요청 시에만                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 새로운 기능

| 기능 | 설명 |
|------|------|
| `user-profile.md` | 사용자 레벨, 선호, 히스토리 저장 |
| 기존 사용자 인식 | 프로필 확인 후 레벨 측정 스킵 |
| 레벨 재측정 옵션 | 사용자가 원할 때만 재측정 |
| 프로젝트 히스토리 | 이전 프로젝트 기록 및 이어하기 |

---

### 사용자 프로필 구조

```markdown
.claude/memory/user-profile.md

# User Profile

## 기본 정보
| 항목 | 값 |
|------|-----|
| 사용자명 | 철수 |
| 첫 만남 | 2026-01-15 |
| 마지막 세션 | 2026-01-27 |

## 레벨 정보
| 항목 | 점수 | 선택 |
|------|------|------|
| IT 경험 | 2 | 조금 경험 |
| 기획 경험 | 1 | 처음이에요 |
| 동기 명확성 | 3 | 꽤 명확해요 |
| **레벨** | L2 | 일반인 |

## 히스토리
| 날짜 | 프로젝트 | 상태 |
|------|----------|------|
| 2026-01-15 | 가계부 앱 | 완료 |
```

---

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `socrates/SKILL.md` | Phase 0에 프로필 확인 로직 추가 |
| `socrates/references/level-assessment.md` | 프로필 시스템 전체 명세 |
| `socrates/references/conversation-rules.md` | v2.1 - 개인화 규칙 추가 |
| `memory/SKILL.md` | user-profile.md 구조 추가 |
| `memory/references/templates.md` | user-profile.md 템플릿 추가 |

---

### 워크플로우 변경

```
Before:
/socrates 시작 → 레벨 측정 (3개 질문) → 기획 시작

After:
/socrates 시작
    ↓
┌─────────────────────────────┐
│ .claude/memory/user-profile.md │
│ 존재 + 레벨 유효?            │
└─────────────────────────────┘
    ↓ Yes              ↓ No
"다시 만나서        레벨 측정 (3개 질문)
반가워요!"              ↓
    ↓               프로필 저장
바로 기획 시작          ↓
                   기획 시작
```

---

## [v1.7.5] - 2026-01-26

### 화면 중심 태스크 구조 + Constitutions 시스템 + TUI 인스톨러

> **vibeShop 실패 사례를 기반으로 연결점 검증 강화, 프레임워크별 헌법 추가, 인터랙티브 설치 지원**

---

### 핵심 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│  문제: 각 파트는 개별 작동하지만, 파트 간 연결점 검증 안 됨     │
│  해결: 화면 중심 태스크 구조 + 연결점 검증 태스크 자동 생성     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  프런트엔드 디지안 적용 실패 사례:                                      │
│  ❌ Auth 불일치: NextAuth + Supabase Auth 혼용 → 500 에러       │
│  ❌ Seed-Schema 불일치: UUID 형식 오류 → Zod 검증 실패          │
│  ❌ Link-Page 불일치: Footer 13개 링크, 0개 페이지 구현         │
│                                                                 │
│  해결책:                                                        │
│  ✅ 화면 단위 태스크: Frontend + Backend + Integration 묶음     │
│  ✅ 연결점 검증 태스크: API/네비게이션/Auth/타입 자동 검증      │
│  ✅ Constitutions: 프레임워크별 필수 규칙 위반 사전 방지        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 새로운 스킬

| 스킬 | 설명 |
|------|------|
| `/screen-spec` | 화면별 상세 명세(YAML) 생성 - 컴포넌트, API, 연결점 정의 + **Stitch MCP 연동** |

---

### Google Stitch MCP 연동 (NEW!)

> YAML 화면 명세에서 AI 디자인 목업을 자동 생성

**주요 기능:**

| 도구 | 설명 |
|------|------|
| `generate_screen_from_text` | YAML → Stitch 프롬프트 → 디자인 생성 |
| `fetch_screen_image` | PNG 목업 이미지 추출 |
| `fetch_screen_code` | HTML/CSS 코드 추출 |
| `analyze_accessibility` | WCAG 2.1 접근성 검사 |
| `generate_design_tokens` | 디자인 토큰 자동 생성 (CSS/Tailwind) |

**워크플로우:**

```
/screen-spec Phase 5: Stitch 디자인 생성 (선택)
    ↓
1️⃣ YAML → Stitch 프롬프트 변환
2️⃣ 디자인 목업 자동 생성
3️⃣ 결과 추출 (PNG, HTML, 토큰)
4️⃣ YAML에 design_reference 추가
    ↓
design/screens/*.png     (목업 이미지)
design/html/*.html       (HTML 코드)
specs/design-tokens.yaml (디자인 토큰)
```

**새로운 Reference 파일:**

| 파일 | 설명 |
|------|------|
| `stitch-prompt-builder.md` | YAML → Stitch 프롬프트 변환 규칙 |
| `stitch-integration.md` | MCP 도구 호출 가이드 |

**인스톨러 업데이트:**

- `install.sh` - Stitch MCP npm 설치 + gcloud 인증 설정
- `install.ps1` - Windows용 Stitch MCP 설정

---

### 개선된 스킬

| 스킬 | 변경 내용 |
|------|----------|
| `/socrates` | 화면 중심 기획 + **레벨별 기술 스택 제안** (Phase 2.5 추가) |
| `/tasks-generator` | 화면 단위 태스크 + 연결점 검증(P-S-V) 태스크 자동 생성 |

---

### 레벨별 기술 스택 제안 (NEW!)

사용자 레벨에 따라 기술 스택 결정 방식이 달라집니다:

| 레벨 | 전략 | 설명 |
|------|------|------|
| **L1** | 자동 제안 | AI가 선택, 확인만 요청 |
| **L2** | 추천 + Yes/No | AI 추천 + 간단한 동의 |
| **L3** | 선택지 제공 | 3-4개 옵션 + 장단점 |
| **L4** | 트레이드오프 | 질문으로 시작, 자유 선택 |

**참조 파일:** `socrates/references/tech-stack-recommendation.md`

---

### TUI 인터랙티브 인스톨러 (NEW!)

Mac/Linux와 Windows를 위한 인터랙티브 설치 스크립트:

```bash
# Mac/Linux
./install.sh

# Windows PowerShell
.\install.ps1
```

**기능:**
- 스킬 카테고리 선택 설치 (Core, Orchestration, Quality 등)
- 프레임워크 헌법 선택 설치 (FastAPI, Next.js, Supabase, Tailwind)
- Slack 웹훅 자동 설정
- Gemini MCP OAuth 인증 + 자동 빌드
- `/socrates` 시작 가이드

**설치 방법 3가지:**
1. TUI 인스톨러 실행
2. Claude Code에게 "이거 설치해줘" 요청
3. 수동 복사 (`rsync` 또는 `Copy-Item`)

---

### 새로운 문서

| 문서 | 설명 |
|------|------|
| `.claude/docs/workflow-overview.md` | 전체 워크플로우 작동 체계 문서 |
| `.claude/docs/design-philosophy.md` | Screen-First, Domain-Guarded 설계 철학 |

---

### 새로운 폴더: `.claude/constitutions/`

프레임워크별 필수 규칙(헌법)을 정의하여 반복되는 실수 방지:

```
.claude/constitutions/
├── README.md
├── nextjs/
│   ├── auth.md              # NextAuth.js 단일 인증 레이어
│   └── api-routes.md        # App Router API 규칙
├── supabase/
│   ├── rls.md               # Row Level Security 필수
│   └── auth-integration.md  # 외부 Auth와 통합 시 규칙
├── fastapi/
│   ├── auth.md              # JWT + OAuth2 패턴
│   └── dependencies.md      # Dependency Injection 규칙
└── common/
    ├── uuid.md              # RFC 4122 UUID 준수
    └── seed-validation.md   # Seed ↔ Schema 일치 검증
```

---

### 새로운 파이프라인

```
/socrates → 06-screens.md (화면 중심 기획)
    ↓
/screen-spec → specs/screens/*.yaml (화면별 상세 명세)
    ↓
[선택] Stitch MCP → design/screens/*.png, design/html/*.html
    ↓
/tasks-generator → TASKS.md (화면 단위 태스크 + 검증)
    ↓
/auto-orchestrate → 실행
```

---

### 연결점 검증 유형

| 유형 | 검증 내용 |
|------|----------|
| API 연결 | 엔드포인트 존재, 응답 타입 일치 |
| 네비게이션 | 타겟 라우트 존재, 파라미터 전달 |
| Auth | 인증 라이브러리 일관성 (하나만 사용) |
| 데이터 타입 | TypeScript ↔ Zod ↔ 시드 일치 |
| 공통 컴포넌트 | Header/Footer 렌더링, 내부 링크 유효성 |

---

## [v1.7.4] - 2026-01-25

### Ultra-Thin 모드 무중단 실행 수정

> **`--ultra-thin` 모드에서 Phase 완료 시 사용자에게 묻지 않고 끝까지 자동 실행**

---

### 핵심 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│  문제: Ultra-Thin 모드에서도 Phase 완료 시 AskUserQuestion 호출 │
│  수정: Ultra-Thin은 ALL_DONE까지 무중단 실행                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ❌ 수정 전: Phase 완료 → "다음 Phase 할까요?" 질문             │
│  ✅ 수정 후: Phase 완료 → 바로 다음 Phase 시작 (질문 없음)      │
│                                                                 │
│  Ultra-Thin의 핵심: 200개 태스크도 컴팩팅 없이 자동 완료!       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `auto-orchestrate/SKILL.md` | 모드별 분기 (일반 vs Ultra-Thin) |
| `ultra-thin-orchestrate/SKILL.md` | AskUserQuestion 금지 규칙 명시 |

---

## [v1.7.3] - 2026-01-24

### 소크라테스 스킬 강화: SocratiQ + Roast Me 모드

> **논문 기반 질문 유형 확장 + 직설적 도전 모드 추가**

---

### 핵심 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│  기존: 3가지 기법 (아이러니, 산파술, 논박)                        │
│  변경: 6가지 질문 유형 + Roast Me 모드                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  + 근거 탐색: "그걸 어떻게 아세요?"                              │
│  + 결과 탐색: "그렇다면 어떤 결과가?"                            │
│  + 대안적 관점: "다른 시각에서 보면?"                            │
│  + 🔥 Roast Me: "솔직히 말할게요..."                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 1. SocratiQ 확장 (논문 기반)

> 출처: [Socratic-Tutoring-LLM](https://arxiv.org/html/2409.05511v1)

| # | 유형 | 핵심 | 사용 시점 |
|---|------|------|----------|
| 1 | 아이러니 | 확신 흔들기 | 확신에 찰 때 |
| 2 | 산파술 | 지식 끌어내기 | 모호할 때 |
| 3 | 논박 | 모순 드러내기 | 모순 발견 시 |
| 4 | **근거 탐색** | 증거 요구 | 추측할 때 |
| 5 | **결과 탐색** | 귀결 추적 | 결과를 못 볼 때 |
| 6 | **대안적 관점** | 시야 확장 | 시야가 좁을 때 |

### 2. Roast Me 모드 추가

**활성화 방법:**
```
/socrates Roast me
/socrates 솔직하게 말해줘
/socrates 봐주지 마
```

**톤 변화:**
| 일반 모드 | Roast 모드 |
|----------|-----------|
| "흥미롭네요" | "그래서요?" |
| "좋은 생각이에요" | (칭찬 없음) |
| "모순이 있는 것 같아요" | "말이 안 맞잖아요" |

### 3. 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `socrates/SKILL.md` | 6가지 질문 유형 테이블, Roast Me 모드 섹션 추가 |
| `socrates/references/socratic-method.md` | SocratiQ 확장, Roast Me 상세 패턴 추가 |

---

## [v1.7.0] - 2026-01-21

### Ultra-Thin Orchestrate 모드 추가

> **200개 태스크도 오토 컴팩팅 없이 처리!** 메인 에이전트 컨텍스트 76% 절감

---

### 핵심 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│  기존 방식: 50개 태스크 → 컨텍스트 포화 → /compact 필요         │
│  Ultra-Thin: 200개 태스크 → 38K 토큰만 사용 → 컴팩팅 불필요     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  절감율: 76% (태스크당 3,200 토큰 → 190 토큰)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 1. 새로운 에이전트 2개 추가

| 에이전트 | 역할 | 모델 |
|----------|------|------|
| `task-executor` | 개별 Task 완전 자율 수행, 10회 자동 재시도 | sonnet |
| `dependency-resolver` | TASKS.md 파싱, 의존성 분석, 실행 가능 Task 계산 | haiku |

### 2. 새로운 스킬 추가

| 스킬 | 파일 |
|------|------|
| `ultra-thin-orchestrate` | `.claude/skills/ultra-thin-orchestrate/SKILL.md` |
| 상태 파일 스키마 | `references/state-schema.md` |
| 통신 프로토콜 | `references/protocol.md` |

### 3. 기존 스킬 수정 (최소 변경)

| 파일 | 변경 내용 |
|------|----------|
| `auto-orchestrate/SKILL.md` | `--ultra-thin` 옵션 추가, Ultra-Thin 섹션 추가 |
| `commands/orchestrate.md` | Ultra-Thin 모드 선택 옵션 추가 |

### 4. CLI 옵션

```bash
# 기본 Ultra-Thin 실행
/auto-orchestrate --ultra-thin

# 특정 Phase만 실행
/auto-orchestrate --ultra-thin --phase 2

# 중단 후 재개
/auto-orchestrate --ultra-thin --resume

# 최대 병렬 실행 수 제한
/auto-orchestrate --ultra-thin --parallel 3
```

### 5. 통신 프로토콜 (컨텍스트 절약 핵심)

```
요청: "TASK_ID:T1.3" (15자)
응답: "DONE:T1.3" (10자)

vs 일반 모드:
요청: 2,000+ 토큰 상세 프롬프트
응답: 1,000+ 토큰 상세 보고

→ 99% 절감!
```

### 6. 모드 선택 가이드

| Task 수 | 권장 모드 | 명령어 |
|---------|----------|--------|
| 1-30개 | 일반 모드 | `/auto-orchestrate` |
| 30-50개 | RALPH 모드 | `/auto-orchestrate --ralph` |
| **50-200개** | **Ultra-Thin** | `/auto-orchestrate --ultra-thin` |
| 200개+ | Ultra-Thin + 분할 | `--ultra-thin --phase N` |

### 7. 호환성

```
✅ 기존 전문가 에이전트 7개 → 변경 없음
✅ 기존 TASKS.md 형식 → 그대로 사용
✅ 기존 /auto-orchestrate → 여전히 동작
🆕 --ultra-thin 옵션 → 새 모드 활성화
```

### 8. 파일 구조

```
.claude/
├── agents/
│   ├── task-executor.md       (NEW)
│   └── dependency-resolver.md (NEW)
├── skills/
│   ├── ultra-thin-orchestrate/
│   │   ├── SKILL.md           (NEW)
│   │   └── references/
│   │       ├── state-schema.md (NEW)
│   │       └── protocol.md     (NEW)
│   └── auto-orchestrate/
│       └── SKILL.md           (--ultra-thin 옵션 추가)
├── commands/
│   └── orchestrate.md         (Ultra-Thin 선택 추가)
└── docs/
    └── ULTRA_THIN_USER_MANUAL.md (NEW)
```

### 9. 사용자 매뉴얼

상세 사용법은 `docs/ULTRA_THIN_USER_MANUAL.md` 참조

---

## [v1.6.9] - 2026-01-20

### Demo-Driven Development (DDD) 통합

> 프론트엔드 태스크마다 데모 페이지를 필수화하고, 스크린샷 검증을 통과해야 태스크 완료로 인정

---

### 변경 전 → 변경 후

```
❌ 이전: TDD 통과 ✅ → 빌드 성공 ✅ → 실제 화면? 없음
✅ 현재: TDD 통과 ✅ → 데모 페이지 ✅ → 스크린샷 검증 ✅ → 완료
```

---

### 1. tasks-rules.md

**프론트엔드 태스크 템플릿 확장:**

| 필드 | 설명 | 필수 |
|------|------|------|
| 담당 | frontend-specialist | ✅ |
| 파일 | 테스트 → 구현 경로 | ✅ |
| 스펙 | 구현할 기능 요약 | ✅ |
| **데모** | 데모 페이지 경로 | ✅ 신규 |
| **데모 상태** | 테스트할 상태 목록 | ✅ 신규 |

**체크리스트에 DDD 항목 추가** (섹션 6)

---

### 2. frontend-specialist.md

**📺 데모 페이지 생성 (필수!)** 섹션 추가:

- 데모 페이지 필수 요소 (상태 선택기, 렌더링, 상태 정보)
- 데모 페이지 템플릿 (TSX)
- 데모 폴더 구조
- 체크리스트

---

### 3. auto-orchestrate/SKILL.md

**3-B단계: 스크린샷 검증** 추가:

```
UI 태스크 완료 (테스트 통과)
    ↓
1️⃣ 데모 페이지 존재 확인
2️⃣ 개발 서버 확인
3️⃣ Chrome 스크린샷 검증 (상태별)
4️⃣ 검증 결과 판정
```

**Demo Reflection 루프** (Ralph Wiggum 스타일):
- Critique → Identify → Improve → Re-verify
- 동일 에러 3회 연속 시 중단

---

### 4. chrome-browser/SKILL.md

**📺 데모 페이지 스크린샷 검증** 섹션 추가:

- 검증 워크플로우
- 검증 기준 (렌더링, 레이아웃, 콘솔)
- MCP 도구 호출 순서
- 실패 시 행동

---

### 예상 효과

| Before | After |
|--------|-------|
| TDD만 통과하면 완료 | TDD + 실제 렌더링 확인 |
| 마지막에 빈 화면 발견 | Phase마다 동작 확인 |
| 컴포넌트 문서 없음 | 데모 페이지 = 살아있는 문서 |
| 수동 UI 테스트 | 자동 스크린샷 검증 |

---

## [v1.6.8] - 2026-01-18

### RALPH 루프, Gemini MCP Rust 서버, 슬랙 웹훅 통합

> Geoffrey Huntley의 RALPH 패턴 도입, Gemini MCP 고성능 구현, 슬랙 웹훅 JSON 통합

---

### 0. Gemini MCP Rust 서버 (신규!)

**고성능 Rust 기반 Gemini MCP 서버 추가**

| 항목 | Node.js MCP | Rust MCP |
|------|-------------|----------|
| 바이너리 크기 | ~50MB | **1.0MB** |
| 시작 시간 | ~500ms | **~10ms** |
| 메모리 사용 | ~50-100MB | **~5-10MB** |

**주요 변경:**
- `gemini-mcp-rs/` - Rust MCP 서버 구현
- `--yolo` 플래그로 비대화형 모드 지원
- 모델: `gemini-3-pro-preview` (Context7로 확인)
- `setup_mcp.py` 플랫폼별 자동 감지 (macOS/Windows/Linux)

**빌드:**
```bash
cd gemini-mcp-rs && cargo build --release
```

---

### 1. RALPH 루프 개선 (공식 플러그인 방식!)

**이전 → 현재:**
```
❌ 이전: 3회 실패 → 건너뛰기 → 미완료 태스크 누적
✅ 현재: 50회까지 반복 → 완료될 때까지 → 대부분 완료!
```

**새 CLI 옵션:**
```bash
/auto-orchestrate --ralph --max-iterations 50 --completion-promise "TASK_DONE"
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--max-iterations` | 50 | 최대 반복 횟수 |
| `--completion-promise` | "TASK_DONE" | 완료 신호 텍스트 |

**핵심 메커니즘 (공식 Ralph Wiggum 방식):**
- 이전 출력 → 다음 입력에 포함 (자기 참조)
- AI가 자신의 에러를 읽고 자동 수정
- 완료 신호 나올 때까지 끝까지 반복

---

### 1-1. RALPH 핵심 원칙 (기존)

| 파일 | 변경 내용 |
|------|----------|
| **auto-orchestrate/SKILL.md** | RALPH 패턴 전체 구현 |
| **commands/orchestrate.md** | RALPH 모드 옵션 추가 |

```
┌─────────────────────────────────────────────────────────────────┐
│  RALPH = 매 반복마다 깨끗한 컨텍스트 + 학습 전달                  │
├─────────────────────────────────────────────────────────────────┤
│  1. 단일 태스크 집중: 한 번에 하나의 스토리만 구현               │
│  2. 깨끗한 컨텍스트: 태스크 완료 후 /compact 또는 새 세션       │
│  3. 학습 전달: progress.txt로 이전 반복의 교훈 전달             │
│  4. 상태 추적: TASKS.md [x] 체크 + orchestrate-state.json      │
│  5. 즉각적 검증: 테스트/타입체크 통과해야 커밋                   │
└─────────────────────────────────────────────────────────────────┘
```

**CLI 옵션:**
```bash
/auto-orchestrate --ralph    # RALPH 모드 (태스크별 컴팩팅)
/auto-orchestrate            # 일반 모드 (Phase 단위)
```

### 1-2. 슬랙 웹훅 저장 통합

**변경 사항:**
- 슬랙 웹훅 URL을 `.claude/orchestrate-state.json`에 JSON으로 저장
- 기존 `.claude/slack-webhook-url.txt` 방식 제거

**영향 스킬:**
| 스킬 | 변경 내용 |
|------|----------|
| `socrates` | URL 입력 시 orchestrate-state.json에 저장 |
| `auto-orchestrate` | orchestrate-state.json의 slack_webhook_url 필드에서 읽기 |

**JSON 형식:**
```json
{
  "project": "my-project",
  "slack_webhook_url": "https://hooks.slack.com/services/...",
  "completed_tasks": [...],
  ...
}
```

**해결된 문제:**
- 소크라테스에서 받은 URL이 auto-orchestrate로 전달되지 않던 버그 수정
- 세션 간 슬랙 알림 설정 유지

---

### 2. 대용량 스킬 토큰 최적화

| 스킬 | 이전 | 이후 | 절감률 |
|------|------|------|--------|
| **fastapi-latest** | 64K words | ~500 words | **99%** |
| **react-19** | 16K words | ~500 words | **97%** |

**방법**: 핵심 패턴만 유지 + Context7 MCP로 상세 문서 조회

```
mcp__context7__query-docs({
  libraryId: "/tiangolo/fastapi",  # 또는 "/facebook/react"
  query: "{구체적인 질문}"
})
```

### 3. tasks-generator 6종 문서 레퍼런스 복구

| 추가 섹션 | 파일 |
|----------|------|
| **0. 6종 기획 문서 참조 (필수!)** | tasks-rules.md |
| **🔴 문서 기반 모드** | SKILL.md |

```
Step 1: 모든 기획 문서 읽기
─────────────────────────────────
Read("01-prd.md")       → 기능 목록, 우선순위
Read("02-trd.md")       → 기술 스택, API 설계
Read("03-user-flow.md") → 마일스톤, 의존성
Read("04-database.md")  → DB 태스크
Read("05-design.md")    → UI 태스크
Read("06-convention.md")→ 코딩 규칙
```

### 4. 중복 스킬 정리

| 제거 | 이유 |
|------|------|
| `skills/orchestrate/` | `commands/orchestrate.md`와 중복 |

### 5. progress.txt 학습 전달 시스템

```markdown
# .claude/progress.txt

## 2026-01-18 10:30 - T0.1 완료
- SQLAlchemy async: expire_on_commit=False 필수
- Alembic 마이그레이션 후 서버 재시작 필요

## 2026-01-18 11:15 - T1.1 완료
- JWT 토큰: HttpOnly 쿠키로 저장
- Refresh 토큰 race condition 주의
```

### 6. 파일 구조

```
.claude/
├── skills/
│   ├── fastapi-latest/SKILL.md  (간소화됨)
│   ├── react-19/SKILL.md        (간소화됨)
│   ├── auto-orchestrate/SKILL.md (RALPH 추가)
│   └── tasks-generator/
│       ├── SKILL.md             (6종 문서 참조 추가)
│       └── references/tasks-rules.md
├── commands/
│   └── orchestrate.md           (RALPH 옵션 추가)
└── progress.txt                 (NEW - 학습 전달용)
```

---

## [v1.6.7] - 2026-01-18

### 슬랙 웹훅 파일 기반 저장

> 환경변수 의존성 제거, 파일 기반으로 전환

| 변경 | 내용 |
|------|------|
| 웹훅 URL 저장 | `.claude/slack-webhook-url.txt` 파일 |
| 읽기 방식 | `Read()` → Bash curl에서 직접 사용 |

---

## [v1.6.6] - 2026-01-18

### Superpowers 기반 품질 강화 업데이트

> obra/superpowers 프로젝트 분석 후 핵심 패턴 도입

---

### 1. 새로운 스킬 3개 추가

| 스킬 | 명령어 | 설명 |
|------|--------|------|
| **Systematic Debugging** | `/systematic-debugging` | 4단계 근본 원인 분석 기반 체계적 디버깅 |
| **Verification Before Completion** | 자동 | 완료 주장 전 증거 기반 검증 필수화 |
| **Code Review** | `/code-review` | 2단계 리뷰 시스템 (Spec Compliance → Code Quality) |

### 2. Systematic Debugging 스킬

```
┌─────────────────────────────────────────────────────────────┐
│  ⛔ 철칙: 근본 원인 조사 없이 수정 금지                       │
│                                                              │
│  Phase 1: Root Cause Investigation (근본 원인 조사)         │
│  Phase 2: Pattern Analysis (패턴 분석)                      │
│  Phase 3: Hypothesis Testing (가설 검증)                    │
│  Phase 4: Implementation (구현)                             │
│                                                              │
│  📁 references/root-cause-tracing.md - 역방향 추적 기법     │
│  📁 references/defense-in-depth.md - 4레이어 검증 패턴      │
└─────────────────────────────────────────────────────────────┘
```

### 3. Verification Before Completion 스킬

```
⛔ 새로운 검증 증거 없이 완료 주장 금지

Gate Function:
1. IDENTIFY: 증명 명령어 식별
2. RUN: 전체 명령어 실행
3. READ: 출력, exit code 확인
4. VERIFY: 주장 확인 여부 판정
5. ONLY THEN: 주장하기
```

### 4. Code Review 스킬 (2단계 리뷰 시스템)

```
Stage 1: Spec Compliance Review
├── 요구사항 일치 확인
├── 누락 기능 검사
└── YAGNI 위반 검사

Stage 2: Code Quality Review
├── SOLID 원칙
├── 코드 품질
├── 에러 처리
├── 테스트 커버리지
└── 보안 취약점

이슈 심각도: Critical / Important / Minor
```

### 5. 에이전트 강화

| 에이전트 | 추가 내용 |
|---------|----------|
| **test-specialist** | TDD Anti-Rationalization 패턴 - "너무 단순해서", "나중에" 등 변명 방지 |
| **security-specialist** | Defense-in-Depth 4레이어 검증 패턴 추가 |

### 6. Auto-Orchestrate 강화

```
Phase 완료 → 품질 게이트 통과 → Two-Stage Code Review → main 병합

새로운 4-2단계 추가:
├── Stage 1: Spec Compliance Review
├── Stage 2: Code Quality Review
├── Critical/Important 이슈 → Reflection 루프로 자동 수정
└── 통과 시 main 병합
```

### 7. 파일 구조

```
.claude/
├── skills/
│   ├── systematic-debugging/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── root-cause-tracing.md
│   │       └── defense-in-depth.md
│   ├── verification-before-completion/
│   │   └── SKILL.md
│   ├── code-review/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── review-checklist.md
│   └── auto-orchestrate/
│       └── SKILL.md (Two-Stage Review 추가)
├── agents/
│   ├── test-specialist.md (TDD Anti-Rationalization 추가)
│   └── security-specialist.md (Defense-in-Depth 추가)
```

---

## [v1.6.5] - 2026-01-18

### Socrates 스킬 대규모 업그레이드

> "망하는 기획 4가지 요건" 검증 시스템 추가로 기획 품질 향상

---

### 1. 새로운 Reference 파일

| 파일 | 내용 |
|------|------|
| `failing-planning-checklist.md` | 망하는 기획 4가지 요건 체크리스트 |

### 2. SKILL.md 추가 내용

| 기능 | 설명 |
|------|------|
| 벤치마킹 질문 영역 | 유사 서비스 분석 강제 |
| 검증 질문 영역 | 가설 vs 사실 구분 |
| 타협 추적 질문 영역 | 핵심 가치 보존 확인 |
| 실험 질문 영역 | 빠른 실패 전략 수립 |
| **Phase 3.5 검증 단계** | 문서 생성 후 4요건 자동 검증 |

### 3. PRD 템플릿 필수 섹션 추가

| 섹션 | 목적 |
|------|------|
| 1.5 벤치마킹 분석 | "자기 생각에 대한 애착" 방지 |
| 6.1 가설 vs 사실 | "추측을 통한 의사 결정" 방지 |
| 8. 타협 기록 | "현실적인 타협" 추적 |
| 9. 실패 대응 계획 | "시행착오에 대한 두려움" 극복 |

### 4. 망하는 기획 4요건 체크리스트

```
┌─────────────────────────────────────────────────────────────────┐
│  1️⃣ 자기 생각에 대한 애착                                       │
│     └── 해독제: 벤치마킹 강제 (유사 서비스 3개 분석)             │
│                                                                  │
│  2️⃣ 추측을 통한 의사 결정                                       │
│     └── 해독제: 가설 vs 사실 테이블 필수                         │
│                                                                  │
│  3️⃣ 현실적인 타협                                               │
│     └── 해독제: 타협 기록 + 복구 계획                            │
│                                                                  │
│  4️⃣ 시행착오에 대한 두려움                                      │
│     └── 해독제: MVP 정의 + 피벗 옵션                             │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Phase 3.5 검증 플로우

```
Phase 3 (문서 생성 완료)
    ↓
Phase 3.5 (자동 검증)
    ├── 벤치마킹 검사
    ├── 가설/사실 검사
    ├── 타협 검사
    └── 실험 검사
    ↓
❌ 미충족 → AskUserQuestion 보완
    ↓
✅ 통과 → Phase 4 (tasks-generator)
```

---

## [v1.6.4] - 2026-01-18

### Auto-Orchestrate 대규모 업데이트

> LangGraph/CrewAI 수준의 상태 관리로 100개 이상 태스크도 누락 없이 실행

---

### 1. SKILL.md 추가 내용

| 기능 | 설명 |
|------|------|
| `--phase N` | 특정 Phase만 실행 후 정지 |
| `--verify` | TASKS.md vs 실행 결과 교차 검증 |
| 슬랙 웹훅 설정 가이드 | AskUserQuestion / 환경변수 / 상태파일 |
| 태스크 누락 방지 시스템 | LangGraph/CrewAI 수준 상태 관리 |
| Claude Code vs LangGraph 비교 | 차이점 및 해결책 설명 |

### 2. SKILLS_SUMMARY.md 추가 내용

| 섹션 | 내용 |
|------|------|
| Auto Orchestrate 섹션 | CLI 옵션, 대규모 프로젝트 가이드, Phase Checkpoint |
| **전체 워크플로우 매뉴얼** | 소크라테스 → auto-orchestrate 6단계 가이드 |
| 태스크 수별 실행 전략 | 20/50/100개 기준 권장 방법 |
| 문제 해결 가이드 | 세션 종료, 누락 의심, 컨텍스트 과부하 대응 |

### 3. 전체 워크플로우 요약

```
Step 1: /socrates          → 21개 질문, 6개 문서 생성
Step 2: /tasks-generator   → TASKS.md 자동 생성
Step 3: /design-linker     → 목업 연결 (선택)
Step 4: /project-bootstrap → 에이전트 팀 + 환경 셋업
Step 5: /auto-orchestrate  → 태스크 수에 따라 실행
Step 6: --verify           → 누락 검증
```

### 4. CLI 옵션 상세

```bash
# 전체 자동 실행
/auto-orchestrate

# 특정 Phase만 실행
/auto-orchestrate --phase 2

# 중단된 작업 재개
/auto-orchestrate --resume

# Phase N 중간에서 재개
/auto-orchestrate --phase 2 --resume

# 누락 검증
/auto-orchestrate --verify
```

### 5. 대규모 프로젝트 권장 실행 방법

| 태스크 수 | 권장 방법 |
|----------|----------|
| 1-20개 | `/auto-orchestrate` 한번에 |
| 20-50개 | 자동 + Phase 완료 시 선택적 컴팩팅 |
| 50-100개 | `--phase N` Phase별 실행 |
| **100개+** | **반드시 Phase별 + 매 Phase 컴팩팅** |

### 6. 태스크 누락 방지 시스템

```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code + Phase Checkpoint (이 시스템):                    │
│  ├── orchestrate-state.json으로 영구 저장                       │
│  ├── 태스크 완료 즉시 상태 저장                                 │
│  ├── Phase 단위 체크포인트 + 컴팩팅 권장                        │
│  ├── CLAUDE.md에 진행 상황 기록                                 │
│  ├── --verify로 누락 검증                                       │
│  └── ✅ LangGraph/CrewAI 수준의 안정성 확보                     │
└─────────────────────────────────────────────────────────────────┘
```

### 7. 슬랙 웹훅 설정 방법

| 방법 | 설명 | 우선순위 |
|------|------|----------|
| AskUserQuestion | 시작 시 URL 입력 | 1순위 (권장) |
| orchestrate-state.json | `slack_webhook_url` 필드 | 2순위 |
| 환경변수 | `SLACK_WEBHOOK_URL` | 3순위 |

### 8. Phase Checkpoint 시스템

```
Phase N 완료
    ↓
1️⃣ orchestrate-state.json 저장
    ↓
2️⃣ CLAUDE.md 진행 상황 업데이트
    ↓
3️⃣ 슬랙 알림 (컴팩팅 권장)
    ↓
4️⃣ AskUserQuestion 체크포인트
    ┌─────────────────────────────────┐
    │ [1] /compact 후 계속 (권장)     │
    │ [2] 바로 다음 Phase 시작        │
    │ [3] 여기서 중단                 │
    └─────────────────────────────────┘
```

### 9. 문제 해결 가이드

| 상황 | 해결 방법 |
|------|----------|
| Phase 중간에 세션 종료 | `/auto-orchestrate --resume` |
| 특정 Phase만 다시 실행 | `/auto-orchestrate --phase N` |
| 태스크 누락 의심 | `/auto-orchestrate --verify` |
| 컨텍스트 과부하 | `/compact` 후 `--resume` |
| 슬랙 알림 안 옴 | 웹훅 URL 확인, 환경변수 체크 |

---

## [v1.6.3] - 2026-01-17

### 추가된 기능
- FastAPI Latest, React 19 스킬 문서화 추가
- Agentic Design Patterns 완전 반영 - Reflection 루프 추가 (품질 게이트 실패 시 자동 개선)
- Ralph Wiggum Loop 통일 - frontend-specialist에 누락된 패턴 추가
- A2A 스킬 추가 - 에이전트 간 구조화된 통신 프로토콜
- Reasoning 스킬 추가 - Chain of Thought, Tree of Thought, ReAct 추론 기법
- Goal Setting 스킬 추가 - TASKS.md 기반 목표 관리 및 진행 상황 모니터링
- Evaluation 스킬 추가 - 코드 품질/에이전트 성능/비용 메트릭 측정

---

## [v1.6.2] - 2026-01-17

### 추가된 기능
- 동적 소크라테스 기능
- Git Worktree 통일
- 보안 강화

---

## [v1.6.1] - 2026-01-16

### 추가된 기능
- Memory 스킬 - 세션 간 학습 지속
- Guardrails 스킬 - 입출력 안전 검증
- RAG 스킬 - Context7 MCP 연동
- Reflection 스킬 - 자기 성찰 패턴

---

## [v1.6.0] - 2026-01-15

### 추가된 기능
- 비용 최적화: 에이전트별 모델 배치 (opus/sonnet/haiku)
- MoAI ADK 통합: TAG System 도입
- TRUST 5 품질 원칙 추가
- Security Specialist 신규 생성
- 커버리지 강제 게이트 추가
- 병렬 진단 추가 (3.75배 빠름)
- Vercel Review 스킬 추가
- Frontend Specialist 대폭 업그레이드

---

## [v1.5.0] - 2026-01-14

### 추가된 기능
- Auto Orchestrate 스킬 추가
- 실행 모드 선택 (반자동화 vs 완전 자동화)
- 심층 인터뷰 기능 (Q21 완료 후)
- 세렌디피티 기능 (Q7 완료 후)

---

## [v1.4.0] - 2026-01-12

### 추가된 기능
- Design Linker 스킬 추가
- Chrome Browser 스킬 추가
- 환경 체크 기능 추가
- 크로스 플랫폼 지원
- 슬랙 웹훅 알림 기능

---

## [v1.0.0] - 2026-01-11

### 초기 버전
- Socrates 스킬
- Tasks Generator 스킬
- Project Bootstrap 스킬
- Deep Research 스킬
