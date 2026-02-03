# 전체 스킬 워크플로우 가이드

> Claude Code AI 에이전트 팀 스킬 시스템의 전체 동작 흐름

**버전**: 1.7.5 | **최종 업데이트**: 2026-01-26

---

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        사용자 요청                                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 1: 기획 (Planning)                                           │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐      │
│  │ /socrates   │ ──▶ │ /screen-spec │ ──▶ │/tasks-generator │      │
│  │ (21개 질문) │     │ (화면 명세)  │     │ (태스크 생성)   │      │
│  └─────────────┘     └──────────────┘     └─────────────────┘      │
│                                                   │                 │
│                                           ┌───────┴────────┐        │
│                                           │ /design-linker │        │
│                                           │ (목업 연결)    │        │
│                                           └────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 2: 프로젝트 셋업 (Setup)                                     │
│  ┌───────────────────┐                                              │
│  │ /project-bootstrap │ ─── 에이전트 팀 + MCP 설정 + 프로젝트 환경  │
│  └───────────────────┘                                              │
│        │                                                            │
│        ├── .claude/agents/ (전문가 에이전트)                        │
│        ├── .claude/commands/ (오케스트레이터)                       │
│        ├── .claude/constitutions/ (프레임워크 헌법) ← NEW!          │
│        ├── .mcp.json (Gemini OAuth)                                 │
│        ├── backend/ (FastAPI, Express 등)                           │
│        ├── frontend/ (React, Next.js 등)                            │
│        └── docker-compose.yml                                       │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 3: 개발 실행 (Execution)                                     │
│  ┌────────────────┐                                                 │
│  │ /orchestrate   │ ─── 반자동화 / 완전 자동화 선택                 │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          ├── 반자동화 ───▶ 태스크별 사용자 지시                     │
│          │                                                          │
│          └── 완전 자동화 (/auto-orchestrate)                        │
│                   │                                                 │
│                   ├── 화면 단위 태스크 분석 ← NEW!                  │
│                   ├── 병렬 실행 (Task 도구 동시 호출)               │
│                   ├── 연결점 검증 태스크 자동 실행                  │
│                   └── Phase 완료 → main 자동 병합                   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  전문가 에이전트 (Specialists)                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  backend-   │ │  frontend-  │ │  database-  │ │    test-    │   │
│  │ specialist  │ │ specialist  │ │ specialist  │ │ specialist  │   │
│  └──────┬──────┘ └──────┬──────┘ └─────────────┘ └─────────────┘   │
│         │               │                                           │
│         │               └── Gemini (디자인 AI) + OAuth              │
│         │                                                           │
│         └── Contract-First TDD + Constitutions 준수                 │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 4: 품질 검증 (Quality)                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ /vercel-review  │  │ /code-review    │  │/verification-before │ │
│  │ (성능/접근성)   │  │ (2단계 리뷰)   │  │    -completion      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. 기획 스킬 (`/socrates`)

### 목적
아이디어를 21개 질문으로 정제하여 6개 기획 문서 생성

### v1.7.5 주요 변경
- **레벨별 기술 스택 제안**: 입문자/중급자/고급자에 따라 다른 방식으로 기술 스택 제안
- **동적 질문 구성**: 사용자 레벨에 맞춰 질문 깊이 조절

### 트리거
```
"기획 시작해줘"
"프로젝트 기획해줘"
/socrates
```

### 워크플로우
```
1. 환경 체크 (Git, curl)
       ↓
2. 슬랙 웹훅 URL 질문 (선택)
       ↓
3. Q1~Q21 순차 질문 (AskUserQuestion)
   └── Q3: 사용자 레벨 파악 (입문/중급/고급)
       ↓
4. Q7 완료 후 세렌디피티 (랜덤 도메인 연결 제안)
       ↓
5. Q21 완료 후 심층 인터뷰 (Deep Dive)
       ↓
6. 6개 문서 생성 (docs/planning/)
   └── 06-screens.md (화면 중심 기획) ← NEW!
       ↓
7. /screen-spec 자동 호출 ← NEW!
       ↓
8. /tasks-generator 자동 호출
```

### 생성 문서
```
docs/planning/
├── 01-prd.md              # 제품 요구사항 정의서
├── 02-trd.md              # 기술 요구사항 정의서
├── 03-user-flow.md        # 사용자 흐름도
├── 04-database-design.md  # 데이터베이스 설계
├── 05-design-system.md    # 디자인 시스템
├── 06-screens.md          # 화면 목록 (NEW!)
└── project-summary.md     # 프로젝트 요약
```

---

## 2. 화면 명세 스킬 (`/screen-spec`) - NEW!

### 목적
소크라테스 결과를 기반으로 화면별 상세 명세(YAML v2.0) 생성

### 핵심 개념
- **화면이 주도하되, 도메인이 방어한다**
- `data_requirements`로 화면이 필요한 데이터만 선언
- 백엔드 API와 느슨한 결합 유지

### 트리거
```
/socrates 완료 후 자동 호출
/screen-spec
"화면 명세 만들어줘"
```

### 워크플로우
```
1. docs/planning/06-screens.md 읽기
       ↓
2. 화면별 YAML 생성 (100줄/화면 목표)
   ├── data_requirements (필요 데이터)
   ├── components (UI 구성요소)
   └── tests (필수 시나리오 3-5개)
       ↓
3. specs/screens/*.yaml 저장
       ↓
4. [선택] Stitch MCP 연동 ⭐ NEW!
   ├── YAML → Stitch 프롬프트 변환
   ├── 디자인 목업 자동 생성
   ├── 결과 추출 (PNG, HTML, 토큰)
   └── YAML에 design_reference 추가
```

### 생성 파일
```yaml
# specs/screens/product-list.yaml
version: "2.0"
screen:
  name: 상품 목록
  route: /products
  layout: sidebar-main
  auth: false

data_requirements:
  - resource: products
    needs: [id, name, price, thumbnail]

components:
  - id: product_grid
    data_source: { resource: products }
```

---

## 3. 태스크 생성 스킬 (`/tasks-generator`)

### 목적
기획 문서 또는 코드베이스를 분석하여 화면 단위 TASKS.md 생성

### v1.7.5 주요 변경
- **화면 단위 태스크 구조**: `P{Phase}-S{Screen}-T{Task}`
- **연결점 검증 태스크**: `P{Phase}-S{Screen}-V`
- **Domain-Guarded 검증**: 화면 요구사항 vs 리소스 제공 필드 검증

### 트리거
```
/screen-spec 완료 후 자동 호출
/tasks-generator
/tasks-generator analyze
```

### 새 워크플로우 (v1.7.5)
```
Phase 0: Domain Resources 확인
  └── specs/domain/resources.yaml 읽기
       ↓
Phase 1: Screen 명세 + data_requirements 추출
  └── specs/screens/*.yaml 읽기
       ↓
Phase 2: Interface Contract Validation
  └── 화면 요구사항 vs 리소스 필드 검증
  └── 불일치 발견 시 사용자에게 알림
       ↓
Phase 3: Backend Resource 태스크 생성
  └── P{Phase}-R{Resource}-T{Task}
       ↓
Phase 4: Frontend Screen 태스크 생성
  └── P{Phase}-S{Screen}-T{Task}
       ↓
Phase 5: Verification 태스크 생성
  └── P{Phase}-S{Screen}-V
```

### Task ID 형식
| 형식 | 용도 | 예시 |
|------|------|------|
| `P{N}-R{M}-T{X}` | Backend Resource | P2-R1-T1: Products API |
| `P{N}-S{M}-T{X}` | Frontend Screen | P2-S1-T1: Product List UI |
| `P{N}-S{M}-V` | Screen Verification | P2-S1-V: 연결점 검증 |

### 생성 문서
```
docs/planning/
└── 06-tasks.md   # 화면 단위 태스크 + 연결점 검증
```

---

## 4. 디자인 연결 스킬 (`/design-linker`)

### 목적
design/ 폴더의 목업을 TASKS.md의 태스크에 연결

### 트리거
```
"디자인 연결해줘"
"목업 연결해줘"
/design-linker
```

### 워크플로우
```
1. design/ 폴더 스캔
       ↓
2. 목업 파일 분류 (HTML, PNG)
       ↓
3. 06-tasks.md 파싱
       ↓
4. Phase/Task ↔ 목업 매핑
       ↓
5. 레퍼런스 섹션 추가
```

---

## 5. 프로젝트 부트스트랩 스킬 (`/project-bootstrap`)

### 목적
AI 에이전트 팀 + 프로젝트 환경 자동 구성

### v1.7.5 주요 변경
- **Constitutions 자동 설치**: 프레임워크별 헌법 파일 복사
- **Gemini OAuth**: API 키 대신 OAuth 인증 사용

### 트리거
```
"에이전트 팀 만들어줘"
"에이전트 팀 구성해줘"
/project-bootstrap
```

### 워크플로우

#### 1단계: 기술 스택 확인
```
기술 스택 명시됨?
    ├── 예 → 2단계로 진행
    └── 아니오 → /socrates 자동 발동
```

#### 2단계: 세부 질문 (AskUserQuestion)
```
질문 2-1: 데이터베이스 선택
    1. PostgreSQL (권장)
    2. MySQL
    3. SQLite
    4. MongoDB
    5. MariaDB
    6. Supabase
    7. Firebase

질문 2-2: 인증 포함 여부
    1. 예 (권장) - JWT 인증
    2. 아니오

질문 2-3: 추가 기능 선택 (다중)
    1. 벡터 DB (PGVector)
    2. Redis 캐시
    3. 3D 엔진 (Three.js)
    4. 없음

질문 2-4: MCP 서버 선택 (다중)
    1. Gemini (권장) - OAuth 인증
    2. GitHub - API 연동
    3. PostgreSQL - DB 쿼리
    4. 기본값만

질문 3: 프로젝트 셋업 범위
    1. 예 (권장) - 전체 환경
    2. 에이전트 팀만
```

#### 3단계: 자동 생성
```
[에이전트 팀 생성]
    .claude/agents/
        ├── backend-specialist.md
        ├── frontend-specialist.md
        ├── database-specialist.md
        └── test-specialist.md
    .claude/commands/
        ├── orchestrate.md
        └── integration-validator.md

[Constitutions 설치] ← NEW!
    .claude/constitutions/
        ├── fastapi/
        │   ├── dotenv.md
        │   ├── auth.md
        │   └── api-design.md
        ├── nextjs/
        │   └── auth.md
        └── common/
            └── uuid.md

[MCP 설정] (Gemini 선택 시)
    .mcp.json
        └── gemini: OAuth 인증

[Docker Compose]
    docker-compose.yml

[백엔드 생성]
    backend/ (FastAPI, Express 등)

[프론트엔드 생성]
    frontend/ (React+Vite, Next.js 등)

[Git 초기화]
    .gitignore + Initial commit
```

---

## 6. 오케스트레이션 (`/orchestrate`)

### 목적
TASKS.md 기반으로 전문가 에이전트를 조율하여 개발 실행

### 트리거
```
/orchestrate
"개발 시작해줘"
```

### 실행 모드 선택
```
┌─────────────────────────────────────────────┐
│  실행 모드를 선택하세요                       │
│                                             │
│  1. 반자동화 (Recommended)                  │
│     - 태스크별 사용자 지시                  │
│     - 세밀한 제어 가능                      │
│                                             │
│  2. 완전 자동화                             │
│     - 화면 단위 태스크 분석 → 자동 실행     │
│     - Phase 완료 → main 자동 병합           │
└─────────────────────────────────────────────┘
```

### 완전 자동화 모드 (`/auto-orchestrate`)
```
1. TASKS.md 파싱
       ↓
2. 화면 단위 의존성 그래프 구축
       ↓
3. 실행 큐 생성
       ↓
4. Round 실행
    ├── 독립 화면 → 병렬 실행
    └── 의존 화면 → 선행 완료 대기
       ↓
5. 연결점 검증 (P-S-V) 자동 실행 ← NEW!
       ↓
6. Phase 완료
    ├── Constitutions 위반 검사 ← NEW!
    ├── 테스트 실행
    ├── 빌드 확인
    └── main 자동 병합
       ↓
7. 다음 Phase
       ↓
(전체 완료까지 반복)
```

---

## 7. Constitutions 시스템 - NEW!

### 목적
프레임워크별 필수 규칙으로 반복되는 실수 방지

### 헌법 목록
```
.claude/constitutions/
├── fastapi/
│   ├── dotenv.md      # .env 미로드 → 가짜 CORS 에러 방지
│   ├── auth.md        # JWT + OAuth2 패턴
│   └── api-design.md  # Resource-Oriented API Design
├── nextjs/
│   ├── auth.md        # NextAuth.js 단일 인증 레이어
│   └── api-design.md  # 화면 비종속 API
├── supabase/
│   └── rls.md         # Row Level Security 필수
├── tailwind/
│   └── v4-syntax.md   # v4 문법 (v3과 다름!)
└── common/
    ├── uuid.md        # RFC 4122 UUID 준수
    └── seed-validation.md
```

### 동작 방식
```
1. 에이전트가 코드 생성 전 관련 헌법 읽기
       ↓
2. 헌법 규칙에 맞게 코드 생성
       ↓
3. Phase 완료 시 위반 검사
       ↓
4. 위반 발견 시 자동 수정 또는 경고
```

---

## 8. 전문가 에이전트

### backend-specialist
- **역할**: 서버 사이드 로직, API 엔드포인트, DB 접근
- **도구**: Read, Edit, Write, Bash, Grep, Glob
- **TDD**: Contract-First 워크플로우
- **Constitutions**: fastapi/*.md, common/*.md 준수

### frontend-specialist
- **역할**: UI 컴포넌트, 스타일링, 레이아웃, 애니메이션
- **도구**: Read, Edit, Write, Bash, Grep, Glob, `mcp__gemini__*`
- **Constitutions**: tailwind/*.md, nextjs/*.md 준수
- **하이브리드 모델**:
  ```
  ┌─────────────────────────────────────────┐
  │  Gemini → 디자인 코딩 생성              │
  │       ↓                                 │
  │  Claude → 통합/TDD/품질 검증            │
  │       ↓                                 │
  │  Anti-AI 체크리스트 적용                │
  └─────────────────────────────────────────┘
  ```

### database-specialist
- **역할**: 스키마 설계, 마이그레이션, DB 제약조건
- **도구**: Read, Edit, Write, Bash, Grep, Glob
- **Constitutions**: supabase/*.md, common/*.md 준수

### test-specialist
- **역할**: Contract-First TDD, 테스트 작성, 품질 게이트
- **도구**: Read, Edit, Write, Bash, Grep, Glob
- **Phase 0 담당**: 계약 정의, 테스트 작성, 목 생성

---

## 9. 품질 검증 스킬

### `/code-review` - 2단계 코드 리뷰
- **Stage 1**: Spec Compliance Review (요구사항 일치)
- **Stage 2**: Code Quality Review (SOLID, 테스트, 보안)
- **Constitutions 위반 검사 포함**

### `/vercel-review` - 프론트엔드 품질 보장
- **45개 React/Next.js 성능 규칙** 자동 검사
- **100+ 웹 인터페이스 가이드라인** 준수 확인
- **Anti-Patterns 자동 감지**

### `/verification-before-completion` - 완료 전 검증
- 커밋이나 PR 전에 반드시 검증 명령어 실행
- 출력 확인 후 증거와 함께 결과 보고

---

## 10. 전체 사용 흐름 예시

### 신규 프로젝트 (처음부터)
```
사용자: "에이전트 팀 만들어줘"
    ↓
(기술 스택 없음 → /socrates 자동 발동)
    ↓
[21개 질문 진행 + 레벨별 기술 스택 제안]
    ↓
[6개 기획 문서 생성]
    ↓
[/screen-spec 자동 호출] ← NEW!
    ↓
[화면별 YAML 명세 생성]
    ↓
[/tasks-generator 자동 호출]
    ↓
[화면 단위 TASKS.md 생성]
    ↓
[/project-bootstrap 재개]
    ↓
[질문 2-1 ~ 2-4 진행]
    ↓
[프로젝트 환경 + Constitutions 설치]
    ↓
사용자: "/auto-orchestrate"
    ↓
[완전 자동화 + 연결점 검증]
    ↓
[완료!]
```

### 기존 프로젝트 (코드 분석)
```
사용자: "/tasks-generator analyze"
    ↓
[코드베이스 분석]
    ↓
[화면 단위 TASKS.md 생성]
    ↓
사용자: "/auto-orchestrate"
    ↓
[완전 자동화 실행]
    ↓
[/code-review 호출]
    ↓
[/vercel-review 호출]
    ↓
[완료!]
```

---

## 11. TUI 인스톨러

### 목적
인터랙티브하게 스킬과 Constitutions 설치

### 실행 방법
```bash
# Mac/Linux
chmod +x install.sh
./install.sh

# Windows
.\install.ps1
```

### 기능
- 스킬 카테고리 선택 설치 (Core, Orchestration, Quality 등)
- 프레임워크 Constitutions 선택 설치
- Slack 웹훅 자동 설정
- Gemini MCP OAuth 인증 + 자동 빌드
- `/socrates` 시작 가이드

---

## 12. 파일 구조 요약

```
프로젝트/
├── .claude/
│   ├── agents/              # 전문가 에이전트
│   │   ├── backend-specialist.md
│   │   ├── frontend-specialist.md
│   │   ├── database-specialist.md
│   │   └── test-specialist.md
│   ├── commands/            # 오케스트레이터/검증기
│   │   ├── orchestrate.md
│   │   └── integration-validator.md
│   ├── constitutions/       # 프레임워크 헌법 ← NEW!
│   │   ├── fastapi/
│   │   ├── nextjs/
│   │   ├── supabase/
│   │   └── tailwind/
│   └── settings.json
├── .mcp.json                # MCP 서버 설정 (Gemini OAuth)
├── docs/planning/           # 기획 문서
│   ├── 01-prd.md
│   ├── 02-trd.md
│   ├── 03-user-flow.md
│   ├── 04-database-design.md
│   ├── 05-design-system.md
│   ├── 06-screens.md        # 화면 목록 ← NEW!
│   └── 06-tasks.md          # 화면 단위 태스크
├── specs/                   # 명세 파일 ← NEW!
│   ├── domain/
│   │   └── resources.yaml
│   └── screens/
│       └── *.yaml
├── backend/                 # 백엔드 코드
├── frontend/                # 프론트엔드 코드
├── design/                  # 목업 (Google Stitch)
└── docker-compose.yml
```

---

**문서 생성일**: 2026-01-26
**버전**: 1.7.5 (화면 단위 태스크 + Constitutions + TUI 인스톨러)
