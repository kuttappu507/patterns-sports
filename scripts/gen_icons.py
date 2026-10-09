#!/usr/bin/env python3
"""Generate PS-AMS Tauri app icons (PIL) — volleyball motif on navy gradient."""
from PIL import Image, ImageDraw
import os

OUT = "/home/z/my-project/src-tauri/icons"
os.makedirs(OUT, exist_ok=True)

TOP = (15, 59, 102)      # #0F3B66
BOT = (31, 111, 178)     # #1F6FB2
WHITE = (255, 255, 255)


def base_canvas(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), TOP)
    dr = ImageDraw.Draw(img)
    # vertical gradient
    for y in range(size):
        t = y / max(size - 1, 1)
        c = tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3))
        dr.line([(0, y), (size, y)], fill=c)
    # rounded-corner mask
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=255)
    img.putalpha(mask)
    return img


def draw_ball(img: Image.Image) -> None:
    size = img.size[0]
    dr = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = size * 0.30
    lw = max(int(size * 0.045), 2)
    box = [cx - r, cy - r, cx + r, cy + r]
    # ball
    dr.ellipse(box, fill=WHITE)
    # seam arcs (volleyball style) in navy
    navy = TOP
    dr.arc(box, start=200, end=340, fill=navy, width=lw)
    dr.arc([cx - r, cy - r * 0.2, cx + r, cy + r * 1.8], start=180, end=360, fill=navy, width=lw)
    dr.arc([cx - r * 1.2, cy - r, cx + r * 0.4, cy + r], start=300, end=90, fill=navy, width=lw)
    dr.arc([cx - r * 0.4, cy - r, cx + r * 1.2, cy + r], start=90, end=240, fill=navy, width=lw)


def save_sizes() -> None:
    master = base_canvas(512)
    draw_ball(master)
    master.save(os.path.join(OUT, "icon.png"), "PNG")
    for name, px in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)]:
        master.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, name), "PNG")
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    master.save(os.path.join(OUT, "icon.ico"), sizes=[(s, s) for s in ico_sizes])
    print("icons written:", sorted(os.listdir(OUT)))


save_sizes()
