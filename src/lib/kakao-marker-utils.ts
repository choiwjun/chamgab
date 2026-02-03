// @TASK P2-S3-T2 - Kakao Maps 마커 유틸리티
// @SPEC specs/screens/search-map.yaml

/**
 * 커스텀 마커 HTML 생성
 * @param price 가격 (옵션)
 */
export function createMarkerContent(price?: number): string {
  if (price) {
    // 가격이 있으면 가격 표시 마커
    const priceText = `${(price / 100000000).toFixed(1)}억`;
    return `
      <div style="
        background: #1E3A5F;
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        white-space: nowrap;
        transform: translateY(-50%);
      ">
        ${priceText}
      </div>
    `;
  } else {
    // 기본 마커 (점)
    return `
      <div style="
        width: 12px;
        height: 12px;
        background: #1E3A5F;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        transform: translateY(-50%);
      "></div>
    `;
  }
}

/**
 * 클러스터 스타일 생성
 */
export function getClustererStyles() {
  return [
    {
      width: '40px',
      height: '40px',
      background: 'rgba(30, 58, 95, 0.9)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center' as const,
      lineHeight: '40px',
      fontSize: '13px',
      fontWeight: 'bold' as const,
      border: '2px solid white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    },
    {
      width: '50px',
      height: '50px',
      background: 'rgba(30, 58, 95, 0.95)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center' as const,
      lineHeight: '50px',
      fontSize: '14px',
      fontWeight: 'bold' as const,
      border: '3px solid white',
      boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
    },
    {
      width: '60px',
      height: '60px',
      background: 'rgba(30, 58, 95, 1)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center' as const,
      lineHeight: '60px',
      fontSize: '16px',
      fontWeight: 'bold' as const,
      border: '4px solid white',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    },
  ];
}

/**
 * 클러스터 크기에 따른 스타일 인덱스 계산
 */
export function getClustererCalculator(size: number): number[] {
  if (size < 10) return [0];
  if (size < 50) return [1];
  return [2];
}
