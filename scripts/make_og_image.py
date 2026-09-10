"""Regenerate public/og-image-square.png and public/og-image-large.png.

Requires Pillow and a Japanese-capable TrueType font (Meiryo on Windows).
Run: python scripts/make_og_image.py

- 横長（1200x630 / Twitterのlargeカード）は、アプリの実際の画面に寄せた絵にする。
  左＝アプリ名と説明、右＝本文とサイドノートのミニ画面（サイトのヒーローと同じ考え方）。
- 正方形（630x630 / summaryカード・小さいサムネイル）は、小さく出ても読めるよう
  黒地に白抜きの2行だけにする。
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = r"C:\Windows\Fonts\meiryo.ttc"
FONT_BOLD_PATH = r"C:\Windows\Fonts\meiryob.ttc"   # meiryo.ttcのindex1はイタリックなので別ファイル
OUT_DIR = Path(__file__).resolve().parent.parent / "public"

# ---- このアプリ固有の設定（4本のツールで、ここだけが違う） ----
TITLE = "サイドノート作成ツール"
DESC_LINES = ['ありそうで無かった！', '資料の横に注釈を置くツールです。']
SQUARE_LINES = ['サイドノート', '注釈を横に']
MOCK = "plain"            # plain / indent / md / web
URL = "sidenote-pdf.pages.dev"

# ---- 配色（サイトのstyle.cssのトークンと同じ値） ----
BG = "#fafafa"
TEXT = "#0a0a0a"
MUTED = "#4d4d4d"
BORDER = "#e5e5e5"
BODY_BG = "#f2f2f2"
LINE = "#eceef1"
LINE_STRONG = "#d7dade"
NUM = "#ff4b4b"
NOTE_IMPORTANT = "#ffdcdc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD_PATH if bold else FONT_PATH, size, index=0)


def bar(d, x, y, w, h, color=LINE, radius=None):
    d.rounded_rectangle([x, y, x + w, y + h], radius=radius if radius is not None else h / 2, fill=color)


def note_num(d, x, y, text, size=15):
    d.text((x, y), text, font=font(size, bold=True), fill=NUM)


# ---- 右側のミニ画面（本文＋サイドノート） ----
def draw_mock(d):
    x0, y0, x1, y1 = 664, 156, 1144, 466
    d.rounded_rectangle([x0, y0, x1, y1], radius=18, fill="#ffffff", outline=BORDER, width=1)

    # ブラウザのバー
    d.rounded_rectangle([x0, y0, x1, y0 + 46], radius=18, fill="#f3f3f3")
    d.rectangle([x0, y0 + 28, x1, y0 + 46], fill="#f3f3f3")
    d.line([x0, y0 + 46, x1, y0 + 46], fill=BORDER, width=1)
    for i, c in enumerate(("#ff5f57", "#ffbd2e", "#28c840")):
        cx = x0 + 24 + i * 20
        d.ellipse([cx - 6, y0 + 17, cx + 6, y0 + 29], fill=c)
    d.rounded_rectangle([x0 + 92, y0 + 12, x1 - 24, y0 + 34], radius=11, fill="#ffffff", outline=BORDER, width=1)
    d.text((x0 + 106, y0 + 16), URL, font=font(13), fill="#71717a")

    # 本文の紙
    d.rectangle([x0 + 1, y0 + 47, x1 - 1, y1 - 1], fill=BODY_BG)
    px0, py0, px1, py1 = x0 + 22, y0 + 68, x1 - 22, y1 - 22
    d.rounded_rectangle([px0, py0, px1, py1], radius=12, fill="#ffffff", outline=BORDER, width=1)

    left = px0 + 26
    side = px1 - 118          # サイドノート列の左端
    doc_w = side - left - 22
    y = py0 + 26
    pitch = 24

    def line(w_ratio, indent=0, color=LINE, num=None, height=10, num_gap=8):
        nonlocal y
        w = int(doc_w * w_ratio)
        bar(d, left + indent, y, w, height, color)
        if num:
            note_num(d, left + indent + w + num_gap, y - 4, num)
        y += pitch

    if MOCK == "indent":
        # 項番のブロック＋段階的な字下げ＋ぶら下げ行＋下線行
        def numbered(w_ratio, indent, num=None):
            nonlocal y
            bar(d, left + indent, y, 16, 10, "#c9ccd2", radius=3)
            w = int(doc_w * w_ratio)
            bar(d, left + indent + 22, y, w, 10)
            if num:
                note_num(d, left + indent + 22 + w + 8, y - 4, num)
            y += pitch

        line(0.88)
        numbered(0.68, 0)
        line(0.60, 38)                      # ぶら下げの2行目
        numbered(0.56, 26, num="1")
        bar(d, left + 64, y, int(doc_w * 0.46), 10)
        d.line([left + 64, y + 13, left + 64 + int(doc_w * 0.46), y + 13], fill="#b9bdc5", width=2)
        y += pitch
        numbered(0.62, 0, num="2")
    elif MOCK == "md":
        line(0.52, color=LINE_STRONG, height=13)      # 見出し
        line(0.90)
        line(0.62, num="1")
        for w in (0.56, 0.46):                        # 箇条書き
            d.ellipse([left + 4, y + 3, left + 10, y + 9], fill="#b9bdc5")
            bar(d, left + 20, y, int(doc_w * w), 10)
            y += pitch
        d.rounded_rectangle([left, y, left + int(doc_w * 0.86), y + 30], radius=6, fill="#f0f1f3")
        d.rounded_rectangle([left, y, left + 3, y + 30], radius=2, fill=LINE_STRONG)
        y += 44
        line(0.44, num="2")
    elif MOCK == "web":
        # 左にサイト内メニュー、右が本文
        nav_w = 64
        ny = py0 + 30
        for w, c in ((0.8, LINE), (0.64, LINE), (0.74, "#c9ccd2"), (0.56, LINE)):
            bar(d, left, ny, int(nav_w * w), 7, c)
            ny += 18
        left += nav_w + 18
        doc_w = side - left - 22
        line(0.56, color=LINE_STRONG, height=13)
        line(0.92)
        line(0.64, num="1")
        line(0.86)
        line(0.48, num="2")
    else:
        line(0.92)
        line(0.78)
        line(0.60, num="1")
        line(0.85)
        line(0.40, num="2")
        line(0.70)

    # サイドノート2枚（下の1枚は「重要」＝赤）
    for i, (ny, color) in enumerate(((py0 + 30, LINE), (py0 + 30 + 46, NOTE_IMPORTANT))):
        note_num(d, side, ny - 4, str(i + 1))
        bar(d, side + 16, ny - 2, 92, 18, color, radius=5)


def make_large():
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    # 左：アプリ名＋説明（サイトのヒーローと同じ並び）
    title_font = font(44, bold=True)
    tb = d.textbbox((0, 0), TITLE, font=title_font)
    desc_font = font(24)
    line_h = 40
    total = (tb[3] - tb[1]) + 28 + line_h * len(DESC_LINES)
    top = (h - total) / 2
    d.text((72, top - tb[1]), TITLE, font=title_font, fill=TEXT)
    ty = top + (tb[3] - tb[1]) + 28
    for text in DESC_LINES:
        d.text((72, ty), text, font=desc_font, fill=MUTED)
        ty += line_h

    draw_mock(d)
    img.save(OUT_DIR / "og-image-large.png")


def make_square():
    size = 630
    pad_x = 34
    line1, line2 = SQUARE_LINES

    scratch = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    avail_w = size - 2 * pad_x
    font_size = 260
    while font_size > 10:
        f = font(font_size)
        b1 = scratch.textbbox((0, 0), line1, font=f)
        b2 = scratch.textbbox((0, 0), line2, font=f)
        if max(b1[2] - b1[0], b2[2] - b2[0]) <= avail_w:
            break
        font_size -= 2

    h1, h2 = b1[3] - b1[1], b2[3] - b2[1]
    gap = round(font_size * 0.35)
    top = (size - (h1 + h2 + gap)) / 2

    img = Image.new("RGB", (size, size), "#000000")
    d = ImageDraw.Draw(img)
    d.text(((size - (b1[2] - b1[0])) / 2 - b1[0], top - b1[1]), line1, font=f, fill="#ffffff")
    d.text(((size - (b2[2] - b2[0])) / 2 - b2[0], top + h1 + gap - b2[1]), line2, font=f, fill="#ffffff")
    img.save(OUT_DIR / "og-image-square.png")


if __name__ == "__main__":
    make_square()
    make_large()
    print("wrote", OUT_DIR / "og-image-square.png")
    print("wrote", OUT_DIR / "og-image-large.png")
