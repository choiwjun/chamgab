# 참값(Chamgab) 프로젝트 학습 기록

## 프로젝트 개요

AI 기반 부동산 가격 분석 서비스

- **Frontend**: Next.js 14 + TypeScript + TailwindCSS
- **Backend**: Supabase (PostgreSQL + PostGIS) + FastAPI (ML API)
- **ML**: XGBoost + SHAP

## 핵심 기획 문서

- `docs/planning/01-prd.md` - 제품 요구사항
- `docs/planning/02-trd.md` - 기술 요구사항
- `specs/domain/resources.yaml` - 도메인 리소스 정의
- `specs/screens/*.yaml` - 화면 명세

## 개발 진행 상황

### Phase 0: 프로젝트 셋업

- [x] Next.js 프로젝트 생성
- [x] FastAPI ML API 구조 생성
- [x] Docker Compose 설정
- [ ] 나머지 태스크 진행 중...

## Lessons Learned

### [2026-02-04] Phase 4: 비교하기 화면 구현

**문제**: Next.js TypedRoutes + 동적 쿼리 파라미터 타입 충돌
**원인**: `router.replace(\`/compare?ids=${ids}\`)` 형태의 동적 쿼리가 TypedRoutes와 호환되지 않음
**해결**: `@ts-expect-error` 주석으로 타입 체크 우회
**교훈**: TypedRoutes는 정적 경로만 지원하므로, 동적 쿼리 파라미터 사용 시 타입 단언 필요

**문제**: framer-motion 의존성 누락 에러
**원인**: node_modules 미설치 상태
**해결**: `npm install` 재실행
**교훈**: 프로젝트 체크아웃 후 반드시 의존성 설치 확인

**문제**: Supabase 환경변수 누락으로 빌드 실패
**원인**: .env 파일 미존재 (gitignore 대상)
**해결**: .env.example 복사하여 .env 생성 (mock 값 사용)
**교훈**: 프로젝트 초기 설정 시 환경변수 파일 확인 필수

### [2026-02-03] 프로젝트 부트스트랩

- 기획 문서가 잘 정리되어 있어 Domain-Guarded 구조 적용
- Supabase + FastAPI 조합으로 서버리스 + ML API 분리 아키텍처

## 실패한 태스크

| 태스크 | 에러 | 시도 | 상태 |
|--------|------|------|------|
| - | - | - | - |

## 주의사항

1. **Supabase Auth**: 소셜 로그인 설정 시 Redirect URL 설정 필수
2. **PostGIS**: 공간 쿼리 시 GEOGRAPHY 타입 사용
3. **ML API**: Railway 배포 시 모델 파일 크기 제한 확인
