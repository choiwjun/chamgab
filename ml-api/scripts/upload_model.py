"""
ML 모델 Supabase Storage 업로드 스크립트
"""
import os
import sys
from pathlib import Path
from datetime import datetime

from supabase import create_client, Client


def upload_model():
    """모델 파일을 Supabase Storage에 업로드"""
    print("=" * 60)
    print("ML 모델 업로드")
    print("=" * 60)

    # Supabase 클라이언트
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not supabase_url or not supabase_key:
        print("경고: Supabase 설정이 없습니다.")
        print("로컬에서만 모델이 저장됩니다.")
        return False

    supabase: Client = create_client(supabase_url, supabase_key)

    # 모델 디렉토리
    models_dir = Path(__file__).parent.parent / "models"

    if not models_dir.exists():
        print(f"모델 디렉토리가 없습니다: {models_dir}")
        return False

    # 업로드할 파일들
    model_files = list(models_dir.glob("*.joblib")) + list(models_dir.glob("*.json"))

    if not model_files:
        print("업로드할 모델 파일이 없습니다.")
        return False

    bucket_name = "ml-models"

    # 버킷 확인/생성
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [b.name for b in buckets]

        if bucket_name not in bucket_names:
            print(f"버킷 생성: {bucket_name}")
            supabase.storage.create_bucket(bucket_name, options={"public": False})
    except Exception as e:
        print(f"버킷 확인 오류: {e}")
        # 계속 진행 (이미 존재할 수 있음)

    # 파일 업로드
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for file_path in model_files:
        try:
            file_name = file_path.name
            storage_path = f"v{timestamp}/{file_name}"

            print(f"\n업로드: {file_name} -> {storage_path}")

            with open(file_path, "rb") as f:
                file_data = f.read()

            # 업로드
            supabase.storage.from_(bucket_name).upload(
                storage_path,
                file_data,
                file_options={"content-type": "application/octet-stream"}
            )

            print(f"  완료!")

        except Exception as e:
            print(f"  오류: {e}")
            continue

    # 메타데이터 저장
    try:
        metadata = {
            "version": timestamp,
            "files": [f.name for f in model_files],
            "uploaded_at": datetime.now().isoformat(),
        }

        supabase.table("model_versions").insert(metadata).execute()
        print(f"\n메타데이터 저장 완료")

    except Exception as e:
        print(f"메타데이터 저장 오류: {e}")

    print("\n업로드 완료!")
    return True


def main():
    upload_model()


if __name__ == "__main__":
    main()
