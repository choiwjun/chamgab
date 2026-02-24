"""네이버 로그인 검수용 캡처파일 생성 - 로그인 이용 절차"""
from PIL import Image, ImageDraw, ImageFont
import os

# 폰트 로드
BOLD = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 20)
REGULAR = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 16)
SMALL = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 13)
TITLE = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 28)
HEADING = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 24)
LOGO_FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 36)
BTN_FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 15)
TINY = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 11)

# 색상
WHITE = "#FFFFFF"
BG = "#F9FAFB"
TEXT_DARK = "#191F28"
TEXT_MID = "#4E5968"
TEXT_LIGHT = "#8B95A1"
BLUE = "#3182F6"
BORDER = "#E5E8EB"
NAVER_GREEN = "#03C75A"
KAKAO_YELLOW = "#FEE500"
GOOGLE_BORDER = "#DADCE0"
RED_ACCENT = "#F04452"

W = 900
H = 2400

img = Image.new("RGB", (W, H), WHITE)
draw = ImageDraw.Draw(img)

y = 30

# ========== 제목 ==========
draw.text((W // 2, y), "참값(Chamgab) 네이버 로그인 이용 절차", fill=TEXT_DARK, font=TITLE, anchor="mt")
y += 40
draw.text((W // 2, y), "AI 기반 부동산 가격 분석 서비스 | https://chamgab.vercel.app", fill=TEXT_MID, font=SMALL, anchor="mt")
y += 15
draw.line([(40, y + 10), (W - 40, y + 10)], fill=BORDER, width=2)
y += 30


# ========== STEP 1: 로그인 페이지 ==========
def draw_step_header(y, step_num, title):
    # 파란 원 번호
    cx, cy = 60, y + 14
    draw.ellipse([(cx - 14, cy - 14), (cx + 14, cy + 14)], fill=BLUE)
    draw.text((cx, cy), str(step_num), fill=WHITE, font=BOLD, anchor="mm")
    draw.text((85, y), title, fill=TEXT_DARK, font=HEADING)
    return y + 45


def draw_phone_frame(x, y, w, h):
    """모바일 프레임 그리기"""
    r = 20
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=r, outline="#C4C4C4", width=2)
    # 상단 바
    draw.rectangle([(x + 1, y + 1), (x + w - 1, y + 35)], fill="#F5F5F5")
    draw.text((x + w // 2, y + 18), "chamgab.vercel.app", fill=TEXT_LIGHT, font=TINY, anchor="mm")
    return x, y + 36


y = draw_step_header(y, 1, "참값 로그인 페이지 접속")
draw.text((60, y), "사용자가 참값 서비스의 로그인 페이지에서 '네이버로 계속하기' 버튼을 클릭합니다.", fill=TEXT_MID, font=REGULAR)
y += 35

# 로그인 페이지 모바일 프레임
phone_x, phone_w, phone_h = 250, 400, 520
fx, fy = draw_phone_frame(phone_x, y, phone_w, phone_h)
inner_x = fx + 30
inner_y = fy + 20

# 로고
draw.text((fx + phone_w // 2, inner_y + 10), "참값", fill=TEXT_DARK, font=LOGO_FONT, anchor="mt")
inner_y += 55
draw.text((fx + phone_w // 2, inner_y), "AI가 분석하는 부동산의 진짜 가치", fill=TEXT_MID, font=SMALL, anchor="mt")
inner_y += 40

# 소셜 버튼들
btn_w = phone_w - 60
btn_h = 42

# Google
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + btn_h)],
                        radius=8, outline=GOOGLE_BORDER, width=1)
draw.text((inner_x + btn_w // 2, inner_y + btn_h // 2), "Google로 계속하기", fill=TEXT_MID, font=BTN_FONT, anchor="mm")
inner_y += btn_h + 10

# Kakao
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + btn_h)],
                        radius=8, fill=KAKAO_YELLOW)
draw.text((inner_x + btn_w // 2, inner_y + btn_h // 2), "카카오로 계속하기", fill="#191919", font=BTN_FONT, anchor="mm")
inner_y += btn_h + 10

# Naver (강조 - 빨간 화살표)
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + btn_h)],
                        radius=8, fill=NAVER_GREEN)
draw.text((inner_x + btn_w // 2, inner_y + btn_h // 2), "네이버로 계속하기", fill=WHITE, font=BTN_FONT, anchor="mm")

# 강조 화살표
arrow_x = inner_x + btn_w + 15
arrow_y = inner_y + btn_h // 2
draw.text((arrow_x, arrow_y), "← 클릭", fill=RED_ACCENT, font=BOLD, anchor="lm")

inner_y += btn_h + 25

# 구분선 "또는"
line_y = inner_y + 8
draw.line([(inner_x, line_y), (inner_x + btn_w // 2 - 25, line_y)], fill=BORDER, width=1)
draw.text((inner_x + btn_w // 2, line_y), "또는", fill=TEXT_LIGHT, font=SMALL, anchor="mm")
draw.line([(inner_x + btn_w // 2 + 25, line_y), (inner_x + btn_w, line_y)], fill=BORDER, width=1)
inner_y += 30

# 이메일 입력
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + 38)],
                        radius=8, outline=BORDER, width=1)
draw.text((inner_x + 12, inner_y + 19), "email@example.com", fill="#C4C4C4", font=SMALL, anchor="lm")
inner_y += 48

# 비밀번호 입력
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + 38)],
                        radius=8, outline=BORDER, width=1)
draw.text((inner_x + 12, inner_y + 19), "비밀번호 입력", fill="#C4C4C4", font=SMALL, anchor="lm")
inner_y += 52

# 로그인 버튼
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + btn_h)],
                        radius=8, fill=BLUE)
draw.text((inner_x + btn_w // 2, inner_y + btn_h // 2), "로그인", fill=WHITE, font=BTN_FONT, anchor="mm")

y += phone_h + 40

# 화살표 (다음 단계)
draw.text((W // 2, y), "▼", fill=BLUE, font=HEADING, anchor="mt")
y += 45

# ========== STEP 2: 네이버 인증 ==========
y = draw_step_header(y, 2, "네이버 로그인 인증")
draw.text((60, y), "네이버 로그인 페이지로 이동하여 사용자가 네이버 계정으로 인증합니다.", fill=TEXT_MID, font=REGULAR)
y += 35

fx, fy = draw_phone_frame(phone_x, y, phone_w, phone_h - 80)
inner_x = fx + 30
inner_y = fy + 25

# 네이버 로그인 화면
draw.text((fx + phone_w // 2, inner_y), "NAVER", fill=NAVER_GREEN, font=HEADING, anchor="mt")
inner_y += 45
draw.text((fx + phone_w // 2, inner_y), "네이버 로그인", fill=TEXT_DARK, font=BOLD, anchor="mt")
inner_y += 40

# 아이디 입력
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + 38)],
                        radius=6, outline=BORDER, width=1)
draw.text((inner_x + 12, inner_y + 19), "아이디", fill="#C4C4C4", font=SMALL, anchor="lm")
inner_y += 48

# 비밀번호 입력
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + 38)],
                        radius=6, outline=BORDER, width=1)
draw.text((inner_x + 12, inner_y + 19), "비밀번호", fill="#C4C4C4", font=SMALL, anchor="lm")
inner_y += 55

# 로그인 버튼
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + btn_h)],
                        radius=6, fill=NAVER_GREEN)
draw.text((inner_x + btn_w // 2, inner_y + btn_h // 2), "로그인", fill=WHITE, font=BTN_FONT, anchor="mm")
inner_y += btn_h + 25

# 안내 텍스트
draw.text((fx + phone_w // 2, inner_y), "※ 네이버 자체 로그인 페이지에서 진행", fill=TEXT_LIGHT, font=SMALL, anchor="mt")
inner_y += 20
draw.text((fx + phone_w // 2, inner_y), "(nid.naver.com)", fill=TEXT_LIGHT, font=SMALL, anchor="mt")

y += phone_h - 80 + 40

# 화살표
draw.text((W // 2, y), "▼", fill=BLUE, font=HEADING, anchor="mt")
y += 45

# ========== STEP 3: 동의 화면 ==========
y = draw_step_header(y, 3, "개인정보 제공 동의")
draw.text((60, y), "최초 로그인 시 이메일, 프로필 정보 제공에 동의합니다.", fill=TEXT_MID, font=REGULAR)
y += 35

fx, fy = draw_phone_frame(phone_x, y, phone_w, 350)
inner_x = fx + 30
inner_y = fy + 25

draw.text((fx + phone_w // 2, inner_y), "참값에 제공되는 정보", fill=TEXT_DARK, font=BOLD, anchor="mt")
inner_y += 40

# 동의 항목
items = [
    ("필수", "이메일 주소", "계정 식별 및 로그인에 사용"),
    ("선택", "프로필 이미지", "사용자 프로필 표시"),
    ("선택", "별명(닉네임)", "서비스 내 표시 이름"),
]
for req, name, desc in items:
    # 체크박스
    cb_y = inner_y + 2
    draw.rounded_rectangle([(inner_x, cb_y), (inner_x + 18, cb_y + 18)], radius=3, fill=NAVER_GREEN)
    draw.text((inner_x + 9, cb_y + 9), "✓", fill=WHITE, font=SMALL, anchor="mm")

    # 필수/선택 배지
    badge_color = RED_ACCENT if req == "필수" else TEXT_LIGHT
    draw.text((inner_x + 28, inner_y), f"[{req}]", fill=badge_color, font=SMALL)
    draw.text((inner_x + 70, inner_y), name, fill=TEXT_DARK, font=REGULAR)
    draw.text((inner_x + 28, inner_y + 22), desc, fill=TEXT_LIGHT, font=TINY)
    inner_y += 48

inner_y += 10
# 동의 버튼
draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + btn_h)],
                        radius=6, fill=NAVER_GREEN)
draw.text((inner_x + btn_w // 2, inner_y + btn_h // 2), "동의하기", fill=WHITE, font=BTN_FONT, anchor="mm")

y += 350 + 40

# 화살표
draw.text((W // 2, y), "▼", fill=BLUE, font=HEADING, anchor="mt")
y += 45

# ========== STEP 4: 로그인 완료 ==========
y = draw_step_header(y, 4, "로그인 완료 및 서비스 이용")
draw.text((60, y), "인증 완료 후 참값 서비스로 자동 리다이렉트되어 로그인 상태로 이용합니다.", fill=TEXT_MID, font=REGULAR)
y += 35

fx, fy = draw_phone_frame(phone_x, y, phone_w, 300)
inner_x = fx + 30
inner_y = fy + 25

# 메인 페이지 요약
draw.text((fx + phone_w // 2, inner_y), "참값", fill=BLUE, font=LOGO_FONT, anchor="mt")
inner_y += 55

draw.text((fx + phone_w // 2, inner_y), "✓ 로그인 완료", fill="#00C471", font=BOLD, anchor="mt")
inner_y += 40

# 서비스 카드들
cards = ["🏠 아파트 참값 분석", "🏪 상권 성공률 분석", "🏫 학군 분석"]
for card_text in cards:
    draw.rounded_rectangle([(inner_x, inner_y), (inner_x + btn_w, inner_y + 38)],
                            radius=8, outline=BORDER, width=1, fill=BG)
    draw.text((inner_x + 15, inner_y + 19), card_text, fill=TEXT_DARK, font=REGULAR, anchor="lm")
    inner_y += 48

y += 300 + 50

# ========== 하단 요약 ==========
draw.line([(40, y), (W - 40, y)], fill=BORDER, width=2)
y += 20

draw.text((60, y), "※ 수집 정보 및 이용 목적", fill=TEXT_DARK, font=BOLD)
y += 30

info_items = [
    "• 이메일 주소 (필수): 회원 식별, 로그인 인증, 서비스 관련 안내",
    "• 프로필 이미지 (선택): 사용자 프로필 페이지 표시",
    "• 별명 (선택): 서비스 내 사용자 표시 이름",
    "",
    "• 수집된 정보는 서비스 이용 목적으로만 사용되며, 회원 탈퇴 시 즉시 삭제됩니다.",
    "• 서비스 URL: https://chamgab.vercel.app",
]

for item in info_items:
    if item:
        draw.text((60, y), item, fill=TEXT_MID, font=SMALL)
    y += 22

# 최종 이미지 크롭
final_h = y + 30
img_cropped = img.crop((0, 0, W, final_h))

out_path = os.path.join("c:/Users/wj941/Downloads", "chamgab_naver_login_flow.png")
img_cropped.save(out_path, "PNG", optimize=True)

file_size = os.path.getsize(out_path)
print(f"Saved: {out_path}")
print(f"Size: {file_size} bytes ({file_size/1024:.1f} KB)")
print(f"Dimensions: {img_cropped.size}")
