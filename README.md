# 🧪 Claude Labs

> **코딩 경험 없이도 아이디어만으로 풀스택 웹앱을 완성하는 AI 개발 파트너 시스템**

**버전**: 1.7.6 | **최종 업데이트**: 2026-01-27

---

## v1.7.6 주요 변경

- **소크라테스 개인화 강화**: 사용자 프로필 시스템으로 반복 질문 제거
- **user-profile.md**: 레벨, 선호, 히스토리 저장 → 다음 세션에 즉시 적용
- **기존 사용자 인식**: "다시 만나서 반가워요!" - 레벨 재측정 없이 바로 기획 시작

<details>
<summary>v1.7.5 변경사항 보기</summary>

- **화면 단위 태스크 시스템**: `P{Phase}-S{Screen}-T{Task}` 구조 도입
- **Screen Spec 스킬**: `/screen-spec` - 화면별 YAML v2.0 명세 생성
- **Google Stitch MCP 연동**: YAML 명세 → 디자인 목업 자동 생성 (선택)
- **Constitutions 시스템**: 프레임워크별 헌법으로 반복 실수 방지
- **TUI 인스톨러**: Mac/Linux/Windows 인터랙티브 설치

</details>

---

## 스킬 한눈에 보기

| 스킬 | 명령어 | 한 줄 설명 |
|------|--------|-----------|
| **Deep Research** | `/deep-research` | 5개 검색 API 병렬 실행, 15분 리서치를 30초로 |
| **Socrates** | `/socrates` | 21개 질문으로 아이디어를 6개 기획 문서로 변환 |
| **Screen Spec** | `/screen-spec` | 화면별 상세 명세(YAML v2.0) 생성 **(NEW!)** |
| **Tasks Generator** | `/tasks-generator` | 화면 단위 + 연결점 검증 TASKS.md 생성 |
| **Design Linker** | `/design-linker` | 목업 디자인을 태스크에 자동 연결 |
| **Project Bootstrap** | `/project-bootstrap` | 원클릭 에이전트 팀 + 풀스택 프로젝트 셋업 |
| **Auto Orchestrate** | `/auto-orchestrate` | 완전 자동화 개발 + Phase Checkpoint |
| **Chrome Browser** | `/chrome-browser` | 브라우저 제어 및 웹앱 테스트 자동화 |

---

## 전체 워크플로우 (v1.7.5)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Claude Labs 워크플로우                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   아이디어                                                                   │
│      │                                                                      │
│      ▼                                                                      │
│   ┌──────────────────┐    "가계부 앱 만들고 싶어요"                          │
│   │  /deep-research  │    ────────────────────────▶  시장 조사, 경쟁사 분석  │
│   └────────┬─────────┘                                                      │
│            │ (선택)                                                          │
│            ▼                                                                │
│   ┌──────────────────┐    21개 질문 + 레벨별                                │
│   │    /socrates     │    기술 스택 제안        ──▶  6개 기획 문서 생성     │
│   └────────┬─────────┘                               (docs/planning/)       │
│            │                                                                │
│            ▼                                                                │
│   ┌──────────────────┐    화면별 상세 명세      ──▶  specs/screens/*.yaml   │
│   │   /screen-spec   │    (YAML v2.0)                                       │
│   └────────┬─────────┘                               ← NEW!                 │
│            │                                                                │
│            ├── (Stitch MCP 연동 시) ──────────────▶  design/screens/*.png   │
│            │                                         design/html/*.html     │
│            ▼                                                                │
│   ┌──────────────────┐    화면 단위 태스크      ──▶  06-tasks.md 생성       │
│   │ /tasks-generator │    + 연결점 검증              (P-S-T + P-S-V)        │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│   ┌──────────────────┐    design/ 폴더 스캔     ──▶  태스크에 목업 연결      │
│   │  /design-linker  │    (있으면 자동 실행)                                 │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│   ┌──────────────────┐    에이전트 팀 생성      ──▶  프로젝트 환경 셋업      │
│   │/project-bootstrap│    + Constitutions             (백엔드/프론트/Docker) │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│   ┌──────────────────┐                                                      │
│   │ /auto-orchestrate│    완전 자동화 개발 + 연결점 검증                     │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│   ┌──────────────────┐                                                      │
│   │ /chrome-browser  │    완성된 앱 테스트 & 검증                            │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│        완성!                                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 빠른 시작

### 1. 아이디어만 있을 때 (권장)

```bash
# 소크라테스와 대화하며 기획 시작
/socrates

# 21개 질문에 답하면:
# → 6개 기획 문서 자동 생성
# → /screen-spec 자동 호출 (화면 명세 생성)
# → /tasks-generator 자동 호출 (화면 단위 태스크)
# → /project-bootstrap으로 개발 환경 셋업
```

### 2. 기술 스택을 알 때

```bash
# 바로 에이전트 팀 생성
"FastAPI + React로 에이전트 팀 만들어줘"

# 질문 3개에 답하면:
# → 에이전트 팀 생성
# → Constitutions 자동 설치
# → 프로젝트 환경 셋업
# → 개발 시작!
```

### 3. 기존 프로젝트가 있을 때

```bash
# 코드 분석 후 남은 작업 파악
/tasks-generator analyze

# → 기존 코드 분석
# → 완료/미완료 태스크 파악
# → 화면 단위 TASKS.md 생성
```

### 4. 완전 자동화 개발

```bash
# TASKS.md 기반 자동 개발
/auto-orchestrate

# → 의존성 분석 → 자동 직렬/병렬 판단
# → 연결점 검증 태스크 자동 실행
# → Phase 완료 → main 자동 병합
```

---

## 핵심 스킬 상세

### `/screen-spec` - 화면 명세 생성 (NEW!)

**"화면이 주도하되, 도메인이 방어한다"**

```yaml
# specs/screens/product-list.yaml
version: "2.0"
screen:
  name: 상품 목록
  route: /products
  layout: sidebar-main

data_requirements:
  - resource: products
    needs: [id, name, price, thumbnail]

components:
  - id: product_grid
    data_source: { resource: products }

tests:
  - name: 초기 로드
    when: 페이지 접속
    then: [상품 12개 표시]
```

**Google Stitch MCP 연동** (선택):
- YAML 명세에서 디자인 목업 자동 생성
- PNG 이미지 + HTML 코드 추출
- WCAG 2.1 접근성 검사
- 디자인 토큰 자동 생성 (CSS/Tailwind)

### `/tasks-generator` - 화면 단위 태스크

**Task ID 형식 (v1.7.5)**

| 형식 | 용도 | 예시 |
|------|------|------|
| `P{N}-R{M}-T{X}` | Backend Resource | P2-R1-T1: Products API |
| `P{N}-S{M}-T{X}` | Frontend Screen | P2-S1-T1: Product List UI |
| `P{N}-S{M}-V` | Verification | P2-S1-V: 연결점 검증 |

---

## Constitutions - 프레임워크 헌법 (NEW!)

**"반복되는 실수를 규칙으로 방지"**

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
    └── uuid.md        # RFC 4122 UUID 준수
```

---

## 지원 기술 스택

### 백엔드

| Framework | 인증 | 설명 |
|-----------|------|------|
| FastAPI | ✅ | Python + SQLAlchemy + JWT + Alembic |
| Express | ✅ | Node.js + TypeScript + JWT |
| Rails 8 | ✅ | Ruby on Rails + SQLite WAL |
| Django | - | Python + DRF |

### 프론트엔드

| Framework | 인증 UI | 설명 |
|-----------|---------|------|
| React+Vite | ✅ | React 19 + Zustand + TailwindCSS |
| Next.js | ✅ | App Router + TailwindCSS |
| SvelteKit | ✅ | Svelte 5 runes + TailwindCSS |
| Remix | ✅ | Loader/Action 패턴 |

### 데이터베이스

| DB | Docker Template |
|----|-----------------|
| PostgreSQL | `postgres` |
| PostgreSQL + PGVector | `postgres-pgvector` |
| MySQL | `mysql` |
| MongoDB | `mongodb` |
| MariaDB | `mariadb` |
| Supabase | 클라우드 |
| Firebase | 클라우드 |

---

## 에이전트 팀 구성

`/project-bootstrap` 실행 시 생성되는 AI 에이전트 팀:

```
.claude/
├── agents/
│   ├── orchestrator.md          # 전략적 판단 & 작업 분해
│   ├── backend-specialist.md    # 백엔드 API 구현
│   ├── frontend-specialist.md   # 프론트엔드 UI 구현
│   ├── 3d-engine-specialist.md  # Three.js, IFC/BIM, 3D 시각화
│   ├── database-specialist.md   # DB 스키마 & 마이그레이션
│   ├── test-specialist.md       # 테스트 작성 & 품질 검증
│   └── security-specialist.md   # OWASP TOP 10 보안 검사
│
├── commands/
│   ├── orchestrate.md           # 작업 분배 & 조율
│   └── integration-validator.md # 통합 검증
│
└── constitutions/               # 프레임워크 헌법 ← NEW!
    ├── fastapi/
    ├── nextjs/
    └── tailwind/
```

### 에이전트 역할

| 에이전트 | 모델 | 역할 | 핵심 패턴 |
|----------|------|------|----------|
| orchestrator | opus | 전략적 판단, 작업 분해 | 병렬 Task 호출 |
| backend-specialist | opus | FastAPI/Express 백엔드 | TDD + Constitutions |
| frontend-specialist | sonnet | React/Next.js 프론트엔드 | TDD + Gemini |
| 3d-engine-specialist | sonnet | Three.js, IFC/BIM 시각화 | WebGL + Dispose 패턴 |
| database-specialist | haiku | DB 스키마, 마이그레이션 | TDD + Alembic |
| test-specialist | haiku | Phase 0 주도, 품질 게이트 | Contract-First |
| security-specialist | opus | OWASP TOP 10 보안 검사 | pip-audit, npm audit |

---

## 설치

### 방법 1: TUI 인터랙티브 설치 (권장)

#### Mac / Linux

```bash
chmod +x install.sh
./install.sh
```

#### Windows (PowerShell)

```powershell
.\install.ps1
```

**TUI 인스톨러 기능:**
- 스킬 카테고리 선택 설치
- 프레임워크 Constitutions 선택 설치
- Slack 웹훅 자동 설정
- Gemini MCP OAuth 인증 + 자동 빌드
- `/socrates` 시작 가이드

### 방법 2: Claude Code에게 맡기기

```bash
# 압축 해제 후 Claude Code 실행
unzip claude-skills-v1.7.5.zip
claude

# Claude Code에게 요청
> 이거 설치해줘
```

### 방법 3: 수동 설치

```bash
# Mac/Linux: 전역 설치
rsync -av .claude/ ~/.claude/

# Windows PowerShell: 전역 설치
Copy-Item -Recurse -Force .\.claude\* $env:USERPROFILE\.claude\
```

### 제거

```bash
# Mac/Linux
./uninstall.sh

# Windows - 수동 삭제
Remove-Item -Recurse -Force $env:USERPROFILE\.claude
```

---

## 환경 요구사항

| 도구 | 용도 | 필수 여부 |
|------|------|----------|
| Claude Code CLI | 스킬 실행 | 필수 |
| Git | 버전 관리 | 필수 |
| Node.js v18+ | MCP 서버 | 필수 |
| Python 3 | 백엔드 | 선택 |
| Docker | 컨테이너 환경 | 선택 |

---

## 문서 구조

```
docs/
├── skills/                    # 스킬별 상세 문서
│   ├── deep-research.md
│   ├── socrates.md
│   ├── screen-spec.md         # NEW!
│   ├── tasks-generator.md
│   ├── design-linker.md
│   ├── project-bootstrap.md
│   └── chrome-browser.md
│
└── planning/                  # /socrates가 생성하는 문서
    ├── 01-prd.md              # 제품 요구사항
    ├── 02-trd.md              # 기술 요구사항
    ├── 03-user-flow.md        # 사용자 흐름
    ├── 04-database-design.md  # DB 설계
    ├── 05-design-system.md    # 디자인 시스템
    ├── 06-screens.md          # 화면 목록 ← NEW!
    ├── 06-tasks.md            # 개발 로드맵 (/tasks-generator)
    └── 07-coding-convention.md # 코딩 컨벤션

specs/                         # /screen-spec이 생성 ← NEW!
├── domain/
│   └── resources.yaml         # 도메인 리소스
└── screens/
    └── *.yaml                 # 화면별 명세
```

---

## 참고 자료

- [SKILLS_SUMMARY.md](SKILLS_SUMMARY.md) - 전체 스킬 상세 요약
- [SKILLS_HIGHLIGHTS.md](SKILLS_HIGHLIGHTS.md) - 스킬 핵심 가치
- [WORKFLOW.md](WORKFLOW.md) - 전체 워크플로우 가이드
- [INSTALL.md](INSTALL.md) - 설치 상세 가이드

---

## 라이선스

MIT License
