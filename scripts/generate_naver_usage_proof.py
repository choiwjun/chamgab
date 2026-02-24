"""네이버 검수용 - 이메일/이름 활용 사례 캡처 이미지 생성"""
from PIL import Image, ImageDraw, ImageFont
import os

BOLD = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 20)
REGULAR = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 16)
SMALL = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 13)
TITLE = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 28)
HEADING = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 22)
LOGO_FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 30)
BTN_FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 15)
TINY = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 11)
LABEL_FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 13)

WHITE = "#FFFFFF"
BG = "#F9FAFB"
TEXT_DARK = "#191F28"
TEXT_MID = "#4E5968"
TEXT_LIGHT = "#8B95A1"
BLUE = "#3182F6"
BORDER = "#E5E8EB"
RED = "#F04452"
GREEN = "#00C471"

W = 900
H = 3200
img = Image.new("RGB", (W, H), WHITE)
draw = ImageDraw.Draw(img)

y = 30

# 제목
draw.text((W // 2, y), "참값(Chamgab) - 네이버 제공 정보 활용 사례", fill=TEXT_DARK, font=TITLE, anchor="mt")
y += 40
draw.text((W // 2, y), "이메일, 이름(닉네임) 정보의 서비스 내 실제 활용 화면", fill=TEXT_MID, font=SMALL, anchor="mt")
y += 15
draw.line([(40, y + 10), (W - 40, y + 10)], fill=BORDER, width=2)
y += 35


def draw_step_header(y, num, title):
    cx, cy = 60, y + 14
    draw.ellipse([(cx - 14, cy - 14), (cx + 14, cy + 14)], fill=BLUE)
    draw.text((cx, cy), str(num), fill=WHITE, font=BOLD, anchor="mm")
    draw.text((85, y), title, fill=TEXT_DARK, font=HEADING)
    return y + 40


def draw_phone_frame(x, y, w, h, url="chamgab.vercel.app"):
    r = 20
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=r, outline="#C4C4C4", width=2)
    draw.rectangle([(x + 1, y + 1), (x + w - 1, y + 35)], fill="#F5F5F5")
    draw.text((x + w // 2, y + 18), url, fill=TEXT_LIGHT, font=TINY, anchor="mm")
    return x, y + 36


def draw_red_box(x1, y1, x2, y2, label=""):
    draw.rectangle([(x1, y1), (x2, y2)], outline=RED, width=3)
    if label:
        # label background
        lbbox = draw.textbbox((0, 0), label, font=LABEL_FONT)
        lw = lbbox[2] - lbbox[0] + 10
        lh = lbbox[3] - lbbox[1] + 6
        draw.rectangle([(x2 + 5, y1), (x2 + 5 + lw, y1 + lh)], fill=RED)
        draw.text((x2 + 10, y1 + 3), label, fill=WHITE, font=LABEL_FONT)


# ============================================================
# 사례 1: 마이페이지 - 이메일, 이름 표시
# ============================================================
y = draw_step_header(y, 1, "마이페이지 - 회원 프로필 정보 표시")
draw.text((60, y), "네이버 로그인 후 마이페이지에서 이메일과 이름(닉네임)이 표시됩니다.", fill=TEXT_MID, font=REGULAR)
y += 30
draw.text((60, y), "→ 회원 식별 및 프로필 관리 목적으로 활용", fill=BLUE, font=REGULAR)
y += 40

phone_x, phone_w, phone_h = 200, 500, 480
fx, fy = draw_phone_frame(phone_x, y, phone_w, phone_h, "chamgab.vercel.app/mypage")
ix = fx + 30
iy = fy + 20

# 헤더
draw.text((fx + phone_w // 2, iy), "마이페이지", fill=TEXT_DARK, font=HEADING, anchor="mt")
iy += 45

# 프로필 카드
card_x, card_y = ix, iy
card_w, card_h = phone_w - 60, 160
draw.rounded_rectangle([(card_x, card_y), (card_x + card_w, card_y + card_h)],
                        radius=12, fill=BG, outline=BORDER, width=1)

# 프로필 아바타 (원)
avatar_cx = card_x + 45
avatar_cy = card_y + 50
draw.ellipse([(avatar_cx - 30, avatar_cy - 30), (avatar_cx + 30, avatar_cy + 30)], fill="#D4E3FF")
draw.text((avatar_cx, avatar_cy), "홍", fill=BLUE, font=HEADING, anchor="mm")

# 이름
name_x = card_x + 90
draw.text((name_x, card_y + 25), "홍길동", fill=TEXT_DARK, font=BOLD)
# 이름 강조 박스
draw_red_box(name_x - 3, card_y + 22, name_x + 80, card_y + 50, "이름 활용")

# 이메일
draw.text((name_x, card_y + 58), "hong@naver.com", fill=TEXT_MID, font=REGULAR)
# 이메일 강조 박스
draw_red_box(name_x - 3, card_y + 55, name_x + 180, card_y + 80, "이메일 활용")

# 등급 뱃지
draw.rounded_rectangle([(name_x, card_y + 95), (name_x + 80, card_y + 118)],
                        radius=10, fill="#E8FAF0")
draw.text((name_x + 40, card_y + 106), "Free 등급", fill=GREEN, font=TINY, anchor="mm")

# 크레딧 정보
draw.text((name_x + 95, card_y + 100), "크레딧: 18 / 20", fill=TEXT_MID, font=SMALL)

iy = card_y + card_h + 20

# 메뉴 목록
menus = ["분석 내역", "관심 매물", "알림 설정", "이용약관", "로그아웃"]
for menu in menus:
    draw.rounded_rectangle([(ix, iy), (ix + card_w, iy + 38)],
                            radius=8, outline=BORDER, width=1)
    draw.text((ix + 15, iy + 19), menu, fill=TEXT_DARK, font=REGULAR, anchor="lm")
    draw.text((ix + card_w - 15, iy + 19), ">", fill=TEXT_LIGHT, font=REGULAR, anchor="rm")
    iy += 46

y += phone_h + 50

# 설명
draw.text((W // 2, y), "▲ 네이버에서 제공받은 이름과 이메일이 마이페이지 프로필에 표시됨", fill=TEXT_MID, font=SMALL, anchor="mt")
y += 40

# 화살표
draw.text((W // 2, y), "▼", fill=BLUE, font=HEADING, anchor="mt")
y += 45


# ============================================================
# 사례 2: 회원가입 완료 시 이메일 자동 연동
# ============================================================
y = draw_step_header(y, 2, "회원가입 - 네이버 정보 자동 연동")
draw.text((60, y), "네이버 로그인 시 이메일과 이름이 자동으로 회원 정보에 등록됩니다.", fill=TEXT_MID, font=REGULAR)
y += 30
draw.text((60, y), "→ 별도 입력 없이 네이버 계정 정보로 간편 가입", fill=BLUE, font=REGULAR)
y += 40

phone_h2 = 380
fx, fy = draw_phone_frame(phone_x, y, phone_w, phone_h2, "chamgab.vercel.app/auth/callback")
ix = fx + 30
iy = fy + 25

draw.text((fx + phone_w // 2, iy), "참값", fill=BLUE, font=LOGO_FONT, anchor="mt")
iy += 50

draw.text((fx + phone_w // 2, iy), "회원가입이 완료되었습니다!", fill=GREEN, font=BOLD, anchor="mt")
iy += 45

# 정보 표
card_w2 = phone_w - 60
info_items = [
    ("연동 계정", "네이버", GREEN),
    ("이름", "홍길동", RED),
    ("이메일", "hong@naver.com", RED),
    ("등급", "Free (무료)", TEXT_MID),
    ("일일 크레딧", "20회", TEXT_MID),
]
for label, value, color in info_items:
    draw.text((ix + 10, iy), label, fill=TEXT_LIGHT, font=SMALL)
    draw.text((ix + card_w2 - 10, iy), value, fill=color if color != RED else TEXT_DARK, font=REGULAR, anchor="rt")
    if color == RED:
        # 강조 표시
        vbbox = draw.textbbox((0, 0), value, font=REGULAR)
        vw = vbbox[2] - vbbox[0]
        draw_red_box(ix + card_w2 - 12 - vw, iy - 2, ix + card_w2 - 8, iy + 22,
                     "이름" if label == "이름" else "이메일")
    iy += 32
    draw.line([(ix, iy), (ix + card_w2, iy)], fill=BORDER, width=1)
    iy += 10

iy += 15
draw.rounded_rectangle([(ix, iy), (ix + card_w2, iy + 42)],
                        radius=8, fill=BLUE)
draw.text((ix + card_w2 // 2, iy + 21), "서비스 시작하기", fill=WHITE, font=BTN_FONT, anchor="mm")

y += phone_h2 + 50
draw.text((W // 2, y), "▲ 네이버에서 제공받은 이름/이메일이 회원 정보로 자동 연동됨", fill=TEXT_MID, font=SMALL, anchor="mt")
y += 40

draw.text((W // 2, y), "▼", fill=BLUE, font=HEADING, anchor="mt")
y += 45


# ============================================================
# 사례 3: 개인정보처리방침 - 수집/이용 목적 명시
# ============================================================
y = draw_step_header(y, 3, "개인정보처리방침 - 수집 목적 명시")
draw.text((60, y), "개인정보처리방침에 이메일/이름의 수집 목적이 명시되어 있습니다.", fill=TEXT_MID, font=REGULAR)
y += 30
draw.text((60, y), "→ 법적 근거에 따른 투명한 정보 수집·이용", fill=BLUE, font=REGULAR)
y += 40

phone_h3 = 420
fx, fy = draw_phone_frame(phone_x, y, phone_w, phone_h3, "chamgab.vercel.app/terms/privacy")
ix = fx + 30
iy = fy + 20

draw.text((fx + phone_w // 2, iy), "개인정보처리방침", fill=TEXT_DARK, font=HEADING, anchor="mt")
iy += 45

draw.text((ix, iy), "1. 수집하는 개인정보 항목", fill=TEXT_DARK, font=BOLD)
iy += 30

draw.text((ix, iy), "나. 소셜 로그인 시 (Google, 카카오, 네이버)", fill=TEXT_DARK, font=REGULAR)
iy += 28

items_privacy = [
    ("• 필수: 이메일 주소 (소셜 계정에 등록된 이메일)", True),
    ("• 선택: 프로필 이미지, 닉네임", True),
]
for text, highlight in items_privacy:
    draw.text((ix + 10, iy), text, fill=TEXT_MID, font=SMALL)
    if highlight and "이메일" in text:
        draw_red_box(ix + 8, iy - 2, ix + 350, iy + 18, "이메일 수집 근거")
    if highlight and "닉네임" in text:
        draw_red_box(ix + 8, iy - 2, ix + 280, iy + 18, "이름 수집 근거")
    iy += 25

iy += 15
draw.text((ix, iy), "2. 개인정보의 수집 및 이용 목적", fill=TEXT_DARK, font=BOLD)
iy += 30

purposes = [
    "• 회원 가입 의사 확인 및 회원 식별·인증",
    "• 서비스 제공: 아파트 참값 분석, 상권 분석,",
    "  학군 분석, 관심 매물 관리",
    "• 서비스 관련 공지사항 및 알림 전달",
]
for text in purposes:
    draw.text((ix + 10, iy), text, fill=TEXT_MID, font=SMALL)
    iy += 22

iy += 10
# 요약 박스
draw.rounded_rectangle([(ix, iy), (ix + phone_w - 60, iy + 50)],
                        radius=8, fill="#FFF5F5", outline=RED, width=1)
draw.text((ix + (phone_w - 60) // 2, iy + 12), "이메일: 회원 식별·인증·알림 전달", fill=RED, font=SMALL, anchor="mt")
draw.text((ix + (phone_w - 60) // 2, iy + 32), "이름: 프로필 표시·서비스 내 사용자 식별", fill=RED, font=SMALL, anchor="mt")

y += phone_h3 + 50
draw.text((W // 2, y), "▲ 개인정보처리방침에 이메일/이름 수집 목적이 법적으로 명시됨", fill=TEXT_MID, font=SMALL, anchor="mt")
y += 40

draw.text((W // 2, y), "▼", fill=BLUE, font=HEADING, anchor="mt")
y += 45

# ============================================================
# 사례 4: 분석 리포트 - 이메일로 결과 안내
# ============================================================
y = draw_step_header(y, 4, "서비스 알림 - 이메일 기반 알림 전달")
draw.text((60, y), "분석 결과, 가격 변동 등 서비스 알림을 회원 이메일로 안내합니다.", fill=TEXT_MID, font=REGULAR)
y += 30
draw.text((60, y), "→ 이메일은 서비스 관련 중요 알림 전달 채널로 활용", fill=BLUE, font=REGULAR)
y += 40

phone_h4 = 300
fx, fy = draw_phone_frame(phone_x, y, phone_w, phone_h4, "chamgab.vercel.app/mypage")
ix = fx + 30
iy = fy + 20

draw.text((fx + phone_w // 2, iy), "알림 설정", fill=TEXT_DARK, font=HEADING, anchor="mt")
iy += 45

# 알림 항목들
notifs = [
    ("관심 매물 가격 변동 알림", True),
    ("분석 리포트 완료 알림", True),
    ("서비스 공지사항", True),
]
card_w3 = phone_w - 60
for text, enabled in notifs:
    draw.rounded_rectangle([(ix, iy), (ix + card_w3, iy + 44)],
                            radius=8, outline=BORDER, width=1)
    draw.text((ix + 15, iy + 22), text, fill=TEXT_DARK, font=REGULAR, anchor="lm")
    # 토글
    toggle_x = ix + card_w3 - 50
    toggle_y = iy + 14
    if enabled:
        draw.rounded_rectangle([(toggle_x, toggle_y), (toggle_x + 40, toggle_y + 20)],
                                radius=10, fill=BLUE)
        draw.ellipse([(toggle_x + 22, toggle_y + 2), (toggle_x + 38, toggle_y + 18)], fill=WHITE)
    iy += 52

iy += 10
draw.rounded_rectangle([(ix, iy), (ix + card_w3, iy + 36)],
                        radius=8, fill="#F0F4FF")
draw.text((ix + card_w3 // 2, iy + 18), "알림 수신 이메일: hong@naver.com", fill=BLUE, font=SMALL, anchor="mm")
draw_red_box(ix - 2, iy - 2, ix + card_w3 + 2, iy + 38, "이메일 활용")

y += phone_h4 + 50
draw.text((W // 2, y), "▲ 서비스 알림이 네이버에서 제공받은 이메일로 전달됨", fill=TEXT_MID, font=SMALL, anchor="mt")
y += 50

# ========== 하단 요약 ==========
draw.line([(40, y), (W - 40, y)], fill=BORDER, width=2)
y += 25

draw.text((60, y), "※ 네이버 제공 정보 활용 요약", fill=TEXT_DARK, font=BOLD)
y += 35

summary = [
    ("정보", "활용 목적", "활용 화면"),
]
# 테이블 헤더
col_x = [60, 200, 500]
draw.rectangle([(50, y - 5), (W - 50, y + 25)], fill=BG)
for i, h in enumerate(["제공 정보", "활용 목적", "활용 화면"]):
    draw.text((col_x[i], y), h, fill=TEXT_DARK, font=LABEL_FONT)
y += 30
draw.line([(50, y), (W - 50, y)], fill=BORDER, width=1)
y += 10

rows = [
    ("이메일", "회원 식별·인증, 알림 전달", "마이페이지, 알림 설정"),
    ("이름(닉네임)", "프로필 표시, 사용자 식별", "마이페이지 프로필"),
]
for col1, col2, col3 in rows:
    draw.text((col_x[0], y), col1, fill=TEXT_DARK, font=REGULAR)
    draw.text((col_x[1], y), col2, fill=TEXT_MID, font=SMALL)
    draw.text((col_x[2], y), col3, fill=TEXT_MID, font=SMALL)
    y += 28
    draw.line([(50, y), (W - 50, y)], fill=BORDER, width=1)
    y += 10

y += 15
draw.text((60, y), "• 수집된 정보는 서비스 이용 목적으로만 사용되며, 회원 탈퇴 시 즉시 삭제됩니다.", fill=TEXT_MID, font=SMALL)
y += 20
draw.text((60, y), "• 서비스 URL: https://chamgab.vercel.app", fill=TEXT_MID, font=SMALL)

# 크롭
final_h = y + 40
img_cropped = img.crop((0, 0, W, final_h))

out_path = "c:/Users/wj941/Downloads/chamgab_naver_usage_proof.png"
img_cropped.save(out_path, "PNG", optimize=True)

file_size = os.path.getsize(out_path)
print(f"Saved: {out_path}")
print(f"Size: {file_size} bytes ({file_size/1024:.1f} KB)")
print(f"Dimensions: {img_cropped.size}")
