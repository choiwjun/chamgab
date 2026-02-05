# API Documentation

## Overview

This document provides comprehensive API documentation for the Chamgab (참값) real estate analysis platform.

## Base URLs

- **Frontend API**: `http://localhost:3000/api` (dev) / `https://chamgab.vercel.app/api` (prod)
- **ML API**: `http://localhost:8002` (dev) / `https://chamgab-ml.railway.app` (prod)

---

## Authentication

All authenticated endpoints require a valid Supabase session token in the Authorization header:

```
Authorization: Bearer <supabase_jwt_token>
```

---

## ML API Endpoints

### 1. Price Prediction

#### `POST /predict`

Predict apartment price using XGBoost model.

**Request Body:**

```json
{
  "region": "서울특별시 강남구 역삼동",
  "area_m2": 84.5,
  "floor": 10,
  "total_floors": 20,
  "building_year": 2010,
  "brand": "래미안"
}
```

**Response:**

```json
{
  "predicted_price": 1250000000,
  "price_per_m2": 14792899,
  "confidence_interval": {
    "lower": 1180000000,
    "upper": 1320000000
  },
  "model_version": "1.0.0"
}
```

---

### 2. SHAP Analysis

#### `GET /factors/{property_id}`

Get SHAP-based price factor analysis.

**Parameters:**

- `property_id` (string): Property UUID

**Response:**

```json
{
  "property_id": "uuid",
  "factors": [
    {
      "feature": "region",
      "contribution": 74.2,
      "value": "서울특별시 강남구",
      "impact": "+185000000"
    },
    {
      "feature": "area_m2",
      "contribution": 18.5,
      "value": 84.5,
      "impact": "+46250000"
    }
  ],
  "base_value": 800000000,
  "predicted_value": 1250000000
}
```

---

### 3. Similar Transactions

#### `GET /similar/{property_id}`

Find similar transactions for comparison.

**Parameters:**

- `property_id` (string): Property UUID
- `limit` (int, optional): Number of results (default: 5)

**Response:**

```json
{
  "similar_properties": [
    {
      "property_id": "uuid",
      "address": "서울특별시 강남구 역삼동",
      "area_m2": 82.0,
      "price": 1180000000,
      "similarity_score": 0.95,
      "transaction_date": "2024-01-15"
    }
  ]
}
```

---

## Commercial Analysis Endpoints

### 4. Success Probability

#### `GET /api/business/success-probability`

Calculate business success probability for a district and industry.

**Query Parameters:**

- `district_code` (string): Commercial district code (e.g., "11680-001")
- `industry_code` (string): Industry classification code (e.g., "I56111")

**Response:**

```json
{
  "district_code": "11680-001",
  "district_name": "역삼역 상권",
  "industry_code": "I56111",
  "industry_name": "한식 음식점",
  "success_probability": 75.5,
  "rating": "high",
  "factors": {
    "foot_traffic_score": 88,
    "sales_density": 12500000,
    "competition_level": "medium",
    "growth_rate": 5.2
  },
  "recommendations": [
    "높은 유동인구로 인한 안정적 고객 확보 가능",
    "경쟁 밀집도 적절하여 시장 포화도 낮음"
  ]
}
```

---

### 5. Demographics Analysis

#### `GET /api/business/demographics`

Get age and gender demographics for a commercial district.

**Query Parameters:**

- `district_code` (string): Commercial district code

**Response:**

```json
{
  "district_code": "11680-001",
  "total_population": 45000,
  "age_distribution": [
    {
      "age_group": "20대",
      "percentage": 25.5,
      "count": 11475,
      "trend": "increasing"
    },
    {
      "age_group": "30대",
      "percentage": 32.8,
      "count": 14760
    }
  ],
  "gender_distribution": {
    "male": 48.5,
    "female": 51.5
  },
  "dominant_segment": "30대 여성",
  "analysis": "젊은 직장인 중심 상권"
}
```

---

### 6. Peak Hours Analysis

#### `GET /api/business/peak-hours`

Analyze hourly foot traffic patterns.

**Query Parameters:**

- `district_code` (string): Commercial district code

**Response:**

```json
{
  "district_code": "11680-001",
  "hourly_data": [
    {
      "hour": 12,
      "foot_traffic": 8500,
      "day_type": "weekday",
      "intensity": "peak"
    }
  ],
  "peak_hours": [12, 13, 18, 19],
  "off_peak_hours": [3, 4, 5],
  "recommendation": "점심시간(12-13시)과 저녁시간(18-19시) 집중 운영 권장"
}
```

---

### 7. Weekend vs Weekday Analysis

#### `GET /api/business/weekend-analysis`

Compare weekend and weekday patterns.

**Query Parameters:**

- `district_code` (string): Commercial district code

**Response:**

```json
{
  "district_code": "11680-001",
  "weekday": {
    "avg_daily_traffic": 35000,
    "avg_daily_sales": 12000000,
    "peak_time": "12:00-13:00"
  },
  "weekend": {
    "avg_daily_traffic": 28000,
    "avg_daily_sales": 9500000,
    "peak_time": "14:00-16:00"
  },
  "comparison": {
    "traffic_diff_percent": -20.0,
    "sales_diff_percent": -20.8,
    "pattern": "weekday_dominant"
  },
  "analysis": "평일 중심 상권 (오피스 밀집 지역)"
}
```

---

### 8. Industry Recommendation

#### `GET /api/business/industry-recommendation`

Get AI-powered industry recommendations for a district.

**Query Parameters:**

- `district_code` (string): Commercial district code
- `current_industry` (string, optional): Current industry code for comparison

**Response:**

```json
{
  "district_code": "11680-001",
  "recommendations": [
    {
      "industry_code": "I56111",
      "industry_name": "한식 음식점",
      "match_score": 92.5,
      "success_probability": 78.5,
      "reasons": [
        "높은 점심 유동인구 (직장인 밀집)",
        "기존 업종 대비 경쟁 밀집도 낮음"
      ],
      "estimated_monthly_revenue": 15000000
    }
  ],
  "district_characteristics": {
    "type": "business_district",
    "dominant_industries": ["음식점", "카페"],
    "foot_traffic_pattern": "weekday_peak"
  }
}
```

---

## Integrated Analysis Endpoints

### 9. Integrated Investment Analysis

#### `GET /api/integrated/analysis`

Get comprehensive apartment + commercial + convenience analysis.

**Query Parameters:**

- `property_id` (string): Property UUID
- `district_codes` (string[], optional): Nearby commercial districts

**Response:**

```json
{
  "property_analysis": {
    "property_id": "uuid",
    "property_name": "래미안 역삼",
    "address": "서울특별시 강남구 역삼동",
    "investment_score": 85,
    "roi_1year": 5.2,
    "roi_3year": 18.5,
    "jeonse_ratio": 68.5,
    "liquidity_score": 78
  },
  "nearby_districts": [
    {
      "code": "11680-001",
      "name": "역삼역 상권",
      "distance_km": 0.3,
      "success_probability": 75.5,
      "avg_monthly_sales": 15000000,
      "foot_traffic_score": 88
    }
  ],
  "convenience": {
    "total_score": 82.5,
    "transport_score": 90,
    "commercial_score": 85,
    "education_score": 75,
    "medical_score": 80,
    "amenities": {
      "subway_stations": 2,
      "bus_stops": 8,
      "schools": 5,
      "hospitals": 3,
      "parks": 4
    }
  },
  "integrated_score": {
    "total_score": 83.5,
    "apartment_weight": 0.6,
    "convenience_weight": 0.4,
    "rating": "excellent",
    "recommendation": "매우 우수한 투자처입니다. 아파트 투자 가치와 생활 편의성이 모두 높습니다."
  },
  "analyzed_at": "2024-02-01T12:00:00Z"
}
```

---

### 10. Alert Center

#### `GET /api/integrated/alerts/{user_id}`

Get personalized alerts for user's favorite properties and districts.

**Parameters:**

- `user_id` (string): User UUID

**Query Parameters:**

- `alert_type` (string, optional): Filter by type (price_change, district_growth, opportunity)
- `severity` (string, optional): Filter by severity (info, warning, critical)

**Response:**

```json
{
  "alerts": [
    {
      "alert_id": "uuid",
      "alert_type": "price_change",
      "title": "관심 매물 가격 변동",
      "message": "래미안 역삼 84㎡ 가격이 5% 상승했습니다.",
      "severity": "warning",
      "property_id": "uuid",
      "data": {
        "old_price": 1200000000,
        "new_price": 1260000000,
        "change_percent": 5.0
      },
      "created_at": "2024-02-01T09:00:00Z",
      "read": false
    }
  ],
  "unread_count": 3
}
```

---

### 11. Report Generation

#### `POST /api/integrated/reports/generate`

Generate comprehensive PDF investment report.

**Request Body:**

```json
{
  "property_id": "uuid",
  "district_codes": ["11680-001"],
  "sections": [
    {
      "section_type": "apartment",
      "include": true
    },
    {
      "section_type": "commercial",
      "include": true
    },
    {
      "section_type": "integrated",
      "include": true
    },
    {
      "section_type": "risk",
      "include": true
    }
  ],
  "format": "pdf",
  "language": "ko"
}
```

**Response:**

```json
{
  "report_id": "uuid",
  "property_id": "uuid",
  "status": "completed",
  "download_url": "https://storage.example.com/reports/uuid.pdf",
  "share_url": "https://chamgab.com/reports/uuid",
  "expires_at": "2024-02-08T12:00:00Z",
  "created_at": "2024-02-01T12:00:00Z"
}
```

#### `GET /api/integrated/reports/{report_id}`

Get report status and download URL.

**Response:**

```json
{
  "report_id": "uuid",
  "status": "completed",
  "download_url": "https://storage.example.com/reports/uuid.pdf",
  "progress": 100
}
```

---

## Frontend API Routes

### 12. Properties

#### `GET /api/properties`

Get property listings with filtering and pagination.

**Query Parameters:**

- `region` (string, optional): Filter by region
- `min_price` (number, optional): Minimum price
- `max_price` (number, optional): Maximum price
- `min_area` (number, optional): Minimum area in m²
- `max_area` (number, optional): Maximum area in m²
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)

**Response:**

```json
{
  "properties": [
    {
      "id": "uuid",
      "name": "래미안 역삼",
      "address": "서울특별시 강남구 역삼동",
      "price": 1250000000,
      "area_m2": 84.5,
      "floor": 10,
      "total_floors": 20,
      "building_year": 2010,
      "brand": "래미안",
      "image_url": "https://...",
      "chamgab_score": 85
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8
  }
}
```

#### `GET /api/properties/{id}`

Get detailed property information.

**Response:**

```json
{
  "id": "uuid",
  "name": "래미안 역삼",
  "address": "서울특별시 강남구 역삼동",
  "price": 1250000000,
  "area_m2": 84.5,
  "floor": 10,
  "total_floors": 20,
  "building_year": 2010,
  "brand": "래미안",
  "images": ["url1", "url2"],
  "description": "...",
  "amenities": ["주차장", "엘리베이터", "헬스장"],
  "nearby_facilities": {
    "subway": [...],
    "schools": [...],
    "hospitals": [...]
  }
}
```

---

### 13. Chamgab Analysis

#### `GET /api/chamgab/{id}`

Get Chamgab (참값) analysis for a property.

**Response:**

```json
{
  "property_id": "uuid",
  "chamgab_price": 1200000000,
  "market_price": 1250000000,
  "price_gap": 50000000,
  "price_gap_percent": 4.0,
  "investment_score": 85,
  "recommendation": "적정가 대비 소폭 높으나 투자 가치 우수",
  "analyzed_at": "2024-02-01T12:00:00Z"
}
```

---

### 14. Favorites

#### `GET /api/favorites`

Get user's favorite properties.

**Auth Required:** Yes

**Response:**

```json
{
  "favorites": [
    {
      "favorite_id": "uuid",
      "property": {
        /* property object */
      },
      "added_at": "2024-01-15T10:00:00Z",
      "notes": "관심 매물 1"
    }
  ]
}
```

#### `POST /api/favorites`

Add property to favorites.

**Auth Required:** Yes

**Request Body:**

```json
{
  "property_id": "uuid",
  "notes": "관심 매물 메모"
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid district code format",
    "details": {
      "field": "district_code",
      "expected": "XXXXX-XXX"
    }
  }
}
```

### Common Error Codes

| Code                  | HTTP Status | Description                       |
| --------------------- | ----------- | --------------------------------- |
| `VALIDATION_ERROR`    | 400         | Invalid request parameters        |
| `UNAUTHORIZED`        | 401         | Missing or invalid authentication |
| `FORBIDDEN`           | 403         | Insufficient permissions          |
| `NOT_FOUND`           | 404         | Resource not found                |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests                 |
| `INTERNAL_ERROR`      | 500         | Server error                      |

---

## Rate Limiting

- **Public endpoints**: 60 requests/minute
- **Authenticated endpoints**: 300 requests/minute
- **ML API**: 30 predictions/minute

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 250
X-RateLimit-Reset: 1706780400
```

---

## Webhook Events

Subscribe to real-time updates via Supabase Realtime:

### Property Price Change

```json
{
  "event": "property_price_changed",
  "property_id": "uuid",
  "old_price": 1200000000,
  "new_price": 1250000000,
  "change_percent": 4.16
}
```

### New Alert

```json
{
  "event": "new_alert",
  "alert": {
    /* alert object */
  }
}
```

---

## SDK Usage Examples

### JavaScript/TypeScript

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Get property analysis
async function getPropertyAnalysis(propertyId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_ML_API_URL}/api/integrated/analysis?property_id=${propertyId}`
  )
  return response.json()
}

// Subscribe to price changes
supabase
  .channel('price_changes')
  .on('broadcast', { event: 'property_price_changed' }, (payload) => {
    console.log('Price changed:', payload)
  })
  .subscribe()
```

### Python

```python
import httpx

ML_API_URL = "http://localhost:8002"

async def predict_price(region: str, area_m2: float, **kwargs):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ML_API_URL}/predict",
            json={
                "region": region,
                "area_m2": area_m2,
                **kwargs
            }
        )
        return response.json()
```

---

## Testing

API documentation is auto-generated and available at:

- **ML API Swagger UI**: `http://localhost:8002/docs`
- **ML API ReDoc**: `http://localhost:8002/redoc`

Use Postman collection: [Download](./postman_collection.json)

---

## Support

For API support and questions:

- GitHub Issues: [chamgab/issues](https://github.com/chamgab/issues)
- Email: support@chamgab.com
