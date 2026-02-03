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
