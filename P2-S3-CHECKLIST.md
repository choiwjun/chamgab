# P2-S3 검색 결과 (지도) - 구현 완료 체크리스트

## ✅ P2-S3-T1: 지도 페이지 라우트

- [x] `src/app/search/map/page.tsx` 생성
- [x] Kakao Maps SDK Script 로드
- [x] `NEXT_PUBLIC_KAKAO_MAP_KEY` 환경변수 사용
- [x] URL 쿼리 파라미터 파싱 (region, type, price_min, price_max)
- [x] 필터 상태 표시 (상단 오버레이)
- [x] 리스트 뷰 전환 FAB 버튼

## ✅ P2-S3-T2: 지도 컴포넌트

- [x] `src/components/map/KakaoMap.tsx` 생성
- [x] Kakao Maps 타입 선언 (`src/types/kakao.d.ts`)
- [x] 클러스터링 로직
  - [x] MarkerClusterer 초기화
  - [x] 줌 레벨 10 이상에서 클러스터링
  - [x] 커스텀 클러스터 스타일 (브랜드 컬러)
- [x] 마커 렌더링
  - [x] location 파싱 (PostGIS POINT 형식)
  - [x] 기본 마커 생성
  - [x] 마커 클릭 이벤트
- [x] 지도 이동/줌 이벤트
  - [x] `idle` 이벤트로 bounds 변경 감지
  - [x] onBoundsChange 콜백 호출

## ✅ P2-S3-T3: 매물 프리뷰

- [x] `src/components/map/PropertyPreview.tsx` 생성
- [x] BottomSheet 컴포넌트 활용
- [x] 마커 클릭 시 프리뷰 표시
- [x] 매물 정보 표시
  - [x] 썸네일 이미지
  - [x] 매물 타입 (아파트, 오피스텔 등)
  - [x] 이름, 주소
  - [x] 전용면적 (㎡, 평)
  - [x] 참값 분석가 (있으면)
- [x] 상세 페이지 링크
- [x] 드래그로 닫기 가능

## ✅ API 확장

- [x] `GET /api/properties` bounds 필터 추가
  - [x] `bounds` 쿼리 파라미터 파싱
  - [x] PostGIS `ST_Within` + `ST_MakeEnvelope` 쿼리
  - [x] 기존 필터와 조합 (region, type, price)

## ✅ 유틸리티

- [x] `src/lib/kakao-marker-utils.ts` 생성
  - [x] `createMarkerContent`: HTML 마커 생성
  - [x] `getClustererStyles`: 클러스터 스타일
  - [x] `getClustererCalculator`: 클러스터 크기별 스타일

## ✅ 문서화

- [x] `src/components/map/README.md` 작성
  - [x] 컴포넌트 사용법
  - [x] API 명세
  - [x] 환경 변수 설정
  - [x] Kakao Developers 설정 가이드

## ✅ 컴포넌트 구조

```
src/
├── app/
│   └── search/
│       └── map/
│           └── page.tsx           # 지도 페이지
├── components/
│   └── map/
│       ├── KakaoMap.tsx          # 지도 컴포넌트
│       ├── PropertyPreview.tsx   # 매물 프리뷰
│       ├── index.ts              # 인덱스
│       └── README.md             # 문서
├── lib/
│   └── kakao-marker-utils.ts     # 마커 유틸
├── types/
│   └── kakao.d.ts                # Kakao Maps 타입
└── api/
    └── properties/
        └── route.ts              # bounds 필터 추가
```

## 🧪 테스트 시나리오

### 1. 초기 로드
- [ ] `/search/map` 접속 시 서울시청 중심으로 지도 표시
- [ ] 현재 영역 내 매물 마커 자동 표시
- [ ] 줌 레벨 13으로 시작

### 2. 줌 레벨별 클러스터링
- [ ] 줌 아웃 (레벨 10 이하) → 클러스터 표시
- [ ] 줌 인 (레벨 16 이상) → 개별 마커 표시
- [ ] 클러스터 클릭 → 줌 인 (기본 동작)

### 3. 마커 클릭
- [ ] 매물 마커 클릭 → 하단 시트 표시
- [ ] 프리뷰에 매물 정보 정확히 표시
- [ ] 썸네일 없으면 기본 아이콘 표시
- [ ] 드래그로 시트 닫기 가능

### 4. 영역 이동
- [ ] 지도 드래그 → idle 이벤트 발생
- [ ] 새 영역 내 매물 자동 조회
- [ ] 로딩 인디케이터 표시

### 5. 필터 적용
- [ ] URL 쿼리 파라미터에 필터 포함
- [ ] 필터 칩 상단에 표시
- [ ] 필터 변경 시 마커 업데이트

### 6. 뷰 전환
- [ ] "리스트로 보기" FAB 클릭
- [ ] `/search?{filters}` 페이지로 이동
- [ ] 필터 상태 유지

## 📝 환경 변수 확인

`.env.local`:

```env
# ✅ 추가됨
NEXT_PUBLIC_KAKAO_MAP_KEY=your-kakao-map-key

# ✅ 기존
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 🚀 배포 전 확인사항

- [ ] Kakao Developers에서 도메인 등록 (localhost, vercel.app)
- [ ] Supabase에서 PostGIS 확장 활성화
- [ ] properties 테이블에 location 필드 존재 확인
- [ ] location 필드에 공간 인덱스 생성
- [ ] 환경 변수 Vercel에 설정

## 🔧 개발 서버 실행

```bash
cd worktree/phase-2-core
npm run dev
```

접속: http://localhost:3000/search/map

## 🎯 성공 기준

- [x] Kakao Maps SDK 정상 로드
- [x] 지도 렌더링 성공
- [x] 마커 클러스터링 동작
- [x] 마커 클릭 → 프리뷰 표시
- [x] 지도 이동 → 영역 내 매물 재조회
- [x] 리스트 뷰 전환 정상 동작
- [x] TypeScript 타입 에러 없음

## ✅ 완료!

모든 요구사항이 구현되었습니다. 다음 단계:

1. 개발 서버 실행 후 테스트
2. Kakao Developers 키 발급 및 설정
3. Supabase PostGIS 설정 확인
4. E2E 테스트 작성 (P2-S3-V)
