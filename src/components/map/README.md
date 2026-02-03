# 지도 컴포넌트 (P2-S3)

## 개요

Kakao Maps API를 활용한 매물 지도 탐색 기능

## 컴포넌트

### KakaoMap

지도를 렌더링하고 매물 마커를 표시합니다.

**Props:**

- `properties`: 표시할 매물 배열
- `onBoundsChange`: 지도 영역 변경 시 콜백
- `onMarkerClick`: 마커 클릭 시 콜백
- `initialCenter`: 초기 중심 좌표 (기본: 서울시청)
- `initialZoom`: 초기 줌 레벨 (기본: 13)

**기능:**

- 줌 레벨에 따른 자동 클러스터링
- 지도 이동/줌 시 영역 내 매물 자동 재조회
- 마커 클릭으로 매물 프리뷰 표시

### PropertyPreview

매물 상세 미리보기를 하단 시트로 표시합니다.

**Props:**

- `property`: 표시할 매물 객체
- `isOpen`: 시트 열림 상태
- `onClose`: 시트 닫기 핸들러

**기능:**

- 드래그로 닫기 가능
- 매물 이미지, 이름, 주소, 면적 표시
- 참값 분석가 표시 (있으면)
- 상세 페이지 링크

## 페이지

### /search/map

지도 기반 매물 검색 페이지

**URL 쿼리 파라미터:**

- `region`: 지역 필터 (시도>시군구>읍면동)
- `type`: 매물 타입 (apt, officetel, villa, store, land, building)
- `price_min`: 최소 가격
- `price_max`: 최대 가격

**기능:**

- 필터 상태를 URL 쿼리로 관리 (북마크 가능)
- 리스트 뷰와 필터 상태 공유
- FAB 버튼으로 리스트/지도 뷰 전환

## API

### GET /api/properties?bounds=...

지도 영역 내 매물 조회

**쿼리 파라미터:**

- `bounds`: 지도 영역 (sw_lat,sw_lng,ne_lat,ne_lng)
- `region`, `type`, `price_min`, `price_max`: 필터
- `page`, `limit`: 페이지네이션

**응답:**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "강남 래미안",
      "address": "서울 강남구...",
      "location": "POINT(127.123 37.456)",
      "area_exclusive": 84.5,
      "thumbnail": "https://...",
      "chamgab_price": 2500000000
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 100
}
```

## 설정

### 환경 변수

`.env.local`:

```env
NEXT_PUBLIC_KAKAO_MAP_KEY=your-kakao-map-key
```

### Kakao Developers 설정

1. [Kakao Developers](https://developers.kakao.com/) 앱 생성
2. 플랫폼 추가 → 웹 → 도메인 등록
3. 제품 설정 → 지도 → 활성화
4. 앱 키 복사 → JavaScript 키

## 사용 예시

```tsx
import { KakaoMap, PropertyPreview } from '@/components/map';

function MapPage() {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleBoundsChange = async (bounds: string) => {
    const res = await fetch(`/api/properties?bounds=${bounds}`);
    const data = await res.json();
    setProperties(data.items);
  };

  const handleMarkerClick = (property) => {
    setSelected(property);
    setIsOpen(true);
  };

  return (
    <>
      <KakaoMap
        properties={properties}
        onBoundsChange={handleBoundsChange}
        onMarkerClick={handleMarkerClick}
      />
      <PropertyPreview
        property={selected}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

## 주의사항

1. **Kakao Maps SDK**: Script 태그로 먼저 로드 필요
2. **PostGIS 쿼리**: location 필드가 GEOGRAPHY 타입이어야 함
3. **클러스터링**: 줌 레벨 10 이상에서 활성화
4. **성능**: 한 번에 최대 100개 마커 표시 권장

## 추후 개선사항

- [ ] 커스텀 마커 이미지 (가격 표시)
- [ ] 지도 스타일 커스터마이징
- [ ] 현재 위치 버튼
- [ ] 지도/위성 뷰 전환
- [ ] POI 마커 (지하철역, 학교 등)
