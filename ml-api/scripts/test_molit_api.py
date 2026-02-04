# -*- coding: utf-8 -*-
"""국토부 API 직접 테스트"""
import os
import requests
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("MOLIT_API_KEY", "")

def test_api():
    """API 직접 호출 테스트"""

    # URL 인코딩된 키 사용
    encoded_key = quote_plus(API_KEY)

    # 공공데이터포털 최신 API (HTTPS 필수)
    url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"

    params = {
        "serviceKey": API_KEY,  # 원본 키
        "LAWD_CD": "41273",
        "DEAL_YMD": "202501",
        "pageNo": "1",
        "numOfRows": "10",
    }

    print(f"API 키 (앞 20자): {API_KEY[:20]}...")
    print(f"URL: {url}")
    print(f"파라미터: LAWD_CD=41273, DEAL_YMD=202501")
    print()

    try:
        # 방법 1: 원본 키
        print("[테스트 1] 원본 키로 호출...")
        resp = requests.get(url, params=params, timeout=30)
        print(f"상태: {resp.status_code}")

        if resp.status_code == 200:
            print("응답 (앞 500자):")
            print(resp.text[:500])

            # XML 파싱
            try:
                root = ET.fromstring(resp.text)
                result_code = root.find(".//resultCode")
                result_msg = root.find(".//resultMsg")

                if result_code is not None:
                    print(f"\nresultCode: {result_code.text}")
                if result_msg is not None:
                    print(f"resultMsg: {result_msg.text}")

                # 데이터 개수
                items = root.findall(".//item")
                print(f"데이터 건수: {len(items)}")

                if items:
                    print("\n첫 번째 데이터:")
                    for child in items[0]:
                        print(f"  {child.tag}: {child.text}")

            except ET.ParseError as e:
                print(f"XML 파싱 오류: {e}")
        else:
            print(f"오류 응답: {resp.text[:200]}")

    except Exception as e:
        print(f"요청 오류: {e}")

    print("\n" + "="*50)

    # 방법 2: 인코딩된 키
    print("\n[테스트 2] URL 인코딩된 키로 호출...")
    params2 = {
        "serviceKey": encoded_key,
        "LAWD_CD": "41273",
        "DEAL_YMD": "202501",
        "pageNo": "1",
        "numOfRows": "10",
    }

    try:
        resp2 = requests.get(url, params=params2, timeout=30)
        print(f"상태: {resp2.status_code}")

        if resp2.status_code == 200:
            root = ET.fromstring(resp2.text)
            result_code = root.find(".//resultCode")
            items = root.findall(".//item")

            if result_code is not None:
                print(f"resultCode: {result_code.text}")
            print(f"데이터 건수: {len(items)}")

    except Exception as e:
        print(f"요청 오류: {e}")


if __name__ == "__main__":
    test_api()
