"""참값 네이버 로그인 로고 생성 (140x140 PNG)"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 140
BG_COLOR = "#3182F6"       # 브랜드 블루
TEXT_COLOR = "#FFFFFF"      # 흰색 텍스트
ACCENT_COLOR = "#FFFFFF"

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 둥근 사각형 배경 (rounded rect)
radius = 28
draw.rounded_rectangle(
    [(0, 0), (SIZE - 1, SIZE - 1)],
    radius=radius,
    fill=BG_COLOR,
)

# 텍스트: "참값" 중앙 배치
# Windows에서 사용 가능한 한글 폰트 찾기
font_candidates = [
    "C:/Windows/Fonts/malgunbd.ttf",    # 맑은 고딕 Bold
    "C:/Windows/Fonts/malgun.ttf",       # 맑은 고딕
    "C:/Windows/Fonts/NanumGothicBold.ttf",
    "C:/Windows/Fonts/gulim.ttc",
]

font = None
for fp in font_candidates:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 52)
            print(f"Using font: {fp}")
            break
        except Exception:
            continue

if font is None:
    font = ImageFont.load_default()
    print("Warning: using default font")

# "참값" 텍스트
text = "참값"
bbox = draw.textbbox((0, 0), text, font=font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]

# 중앙 정렬 (살짝 위로)
x = (SIZE - tw) // 2
y = (SIZE - th) // 2 - 8

draw.text((x, y), text, fill=TEXT_COLOR, font=font)

# 하단에 작은 서브텍스트 "AI 부동산"
sub_font = None
for fp in font_candidates:
    if os.path.exists(fp):
        try:
            sub_font = ImageFont.truetype(fp, 16)
            break
        except Exception:
            continue

if sub_font:
    sub_text = "AI 부동산"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    stw = sub_bbox[2] - sub_bbox[0]
    sx = (SIZE - stw) // 2
    sy = y + th + 12
    draw.text((sx, sy), sub_text, fill="#FFFFFFCC", font=sub_font)

# 저장
out_path = os.path.join(os.path.dirname(__file__), "..", "public", "naver-logo-140.png")
out_path = os.path.abspath(out_path)
img.save(out_path, "PNG", optimize=True)

file_size = os.path.getsize(out_path)
print(f"Saved: {out_path}")
print(f"Size: {file_size} bytes ({file_size/1024:.1f} KB)")
print(f"Dimensions: {img.size}")
