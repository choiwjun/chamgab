# -*- coding: utf-8 -*-
"""
API 상태 확인 스크립트

사용법: python check_api_status.py
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

MOLIT_API_KEY = os.getenv("MOLIT_API_KEY", "")
REB_API_KEY = os.getenv("REB_API_KEY", "")


def check_molit_api():
    """국토교통부 API 상태 확인"""
    print("\n[1] 국토교통부 실거래가 API")
    print("-" * 40)

    if not MOLIT_API_KEY:
        print("상태: API 키 없음")
        print("해결: .env 파일에 MOLIT_API_KEY 설정")
        return False

    # 신규 API 엔드포인트 (2024~)
    url = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
    params = {
        "serviceKey": MOLIT_API_KEY,
        "LAWD_CD": "11680",  # 강남구 (테스트용)
        "DEAL_YMD": "202401",  # 2024년 1월
        "pageNo": "1",
        "numOfRows": "5",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)

        if resp.status_code == 200:
            if "resultCode" in resp.text and ">00<" in resp.text:
                print("상태: 정상")
                print("API 키가 승인되었습니다!")
                return True
            elif "SERVICE_ACCESS_DENIED" in resp.text:
                print("상태: 서비스 미등록 (SERVICE_ACCESS_DENIED)")
                print("해결: 아래 URL에서 서비스 신청 필요")
                print("  - https://www.data.go.kr/data/15126468/openapi.do (상세)")
                print("  - https://www.data.go.kr/data/15126469/openapi.do (기본)")
                return False
            elif "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" in resp.text:
                print("상태: 일일 호출량 초과")
                return True  # API 키는 작동함
            else:
                print(f"상태: 알 수 없는 응답")
                print(f"응답: {resp.text[:200]}")
                return False
        elif resp.status_code == 403:
            print("상태: 접근 거부 (403 Forbidden)")
            print("원인: API 키가 해당 서비스에 등록되지 않음")
            print("해결: 아래 URL에서 서비스 활용 신청 필요")
            print("  - https://www.data.go.kr/data/15126468/openapi.do (상세)")
            print("  - https://www.data.go.kr/data/15126469/openapi.do (기본)")
            return False
        else:
            print(f"상태: HTTP {resp.status_code}")
            return False

    except Exception as e:
        print(f"상태: 연결 오류 - {e}")
        return False


def check_reb_api():
    """한국부동산원 API 상태 확인"""
    print("\n[2] 한국부동산원 API")
    print("-" * 40)

    if not REB_API_KEY:
        print("상태: API 키 없음")
        print("해결: .env 파일에 REB_API_KEY 설정")
        return False

    # 공공데이터포털 한국부동산원 API
    url = "http://apis.data.go.kr/1613000/KB_UrbantyAptHousePriceService/getKBUrbantyAptHousePrice"
    params = {
        "serviceKey": REB_API_KEY,
        "numOfRows": "5",
        "pageNo": "1",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)

        if resp.status_code == 200:
            if "resultCode" in resp.text and ">00<" in resp.text:
                print("상태: 정상")
                return True
            else:
                print(f"상태: 응답 오류")
                print(f"응답: {resp.text[:200]}")
                return False
        elif resp.status_code == 403:
            print("상태: 접근 거부 (403 Forbidden)")
            print("원인: API 키가 해당 서비스에 등록되지 않음")
            return False
        else:
            print(f"상태: HTTP {resp.status_code}")
            return False

    except Exception as e:
        print(f"상태: 연결 오류 - {e}")
        print("참고: 한국부동산원 API는 별도 서비스로 전환되었을 수 있음")
        return False


def main():
    print("=" * 50)
    print(" 공공데이터 API 상태 확인")
    print("=" * 50)

    molit_ok = check_molit_api()
    reb_ok = check_reb_api()

    print("\n" + "=" * 50)
    print(" 요약")
    print("=" * 50)
    print(f"국토교통부 API: {'정상' if molit_ok else '확인 필요'}")
    print(f"한국부동산원 API: {'정상' if reb_ok else '확인 필요'}")

    if not molit_ok:
        print("\n[필수 조치]")
        print("1. https://www.data.go.kr 로그인")
        print("2. 마이페이지 > 활용신청 현황 확인")
        print("3. 아래 서비스 신청 (미등록 시):")
        print("   - 국토교통부_아파트 매매 실거래가 자료 (15126469)")
        print("   - 국토교통부_아파트 매매 실거래가 상세 자료 (15126468)")
        print("4. 신청 후 1-2시간 대기 (승인 필요)")


if __name__ == "__main__":
    main()
