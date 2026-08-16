"""Regenerate public/og-image-large.png from the title/subtitle below.

Requires Pillow and a Japanese-capable TrueType font (Meiryo on Windows).
Run: python scripts/make_og_image.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = r"C:\Windows\Fonts\meiryo.ttc"
OUT_DIR = Path(__file__).resolve().parent.parent / "public"


def measure(draw, text, font_size):
    font = ImageFont.truetype(FONT_PATH, font_size, index=0)
    b = draw.textbbox((0, 0), text, font=font)
    return font, b


def fit(draw, text, avail_w, start_size, cap=None):
    font_size = start_size if cap is None else min(start_size, cap)
    while font_size > 10:
        font, b = measure(draw, text, font_size)
        if b[2] - b[0] <= avail_w:
            return font, b, font_size
        font_size -= 2
    return font, b, font_size


def make_large():
    w, h = 1200, 630
    pad_x_title, pad_x_sub, gap = 90, 90, 40
    title = "サイドノート資料作成"
    subtitle = "テキストやスクショにサイドノートを置いて整理するアプリです"

    scratch = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    title_font, tb, title_size = fit(scratch, title, w - 2 * pad_x_title, 200)
    sub_font, sb, _ = fit(
        scratch, subtitle, w - 2 * pad_x_sub, 120, cap=round(title_size * 0.38)
    )

    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    total_h = th + gap + sh
    top = (h - total_h) / 2

    img = Image.new("RGB", (w, h), "#000000")
    d = ImageDraw.Draw(img)
    tx = (w - tw) / 2 - tb[0]
    d.text((tx, top - tb[1]), title, font=title_font, fill="#ffffff")
    sx = (w - sw) / 2 - sb[0]
    d.text((sx, top + th + gap - sb[1]), subtitle, font=sub_font, fill="#cfcfcf")

    img.save(OUT_DIR / "og-image-large.png")


if __name__ == "__main__":
    make_large()
    print("wrote", OUT_DIR / "og-image-large.png")
