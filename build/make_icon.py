"""生成 NekoRePKG 图标（build/icon.ico / build/icon.png）。

运行：E:\\repkg\\.venv\\Scripts\\python.exe build\\make_icon.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
SIZE = 1024


def vertical_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (size, size), top)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        ratio = y / max(1, size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return img


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def ear_points(cx: float, cy: float, w: float, h: float, tilt: float) -> list[tuple[float, float]]:
    base_y = cy + h / 2
    tip = (cx + tilt, cy - h / 2)
    left = (cx - w / 2, base_y)
    right = (cx + w / 2, base_y)
    middle = (cx + tilt * 0.7, cy - h * 0.05)
    return [left, tip, right, middle]


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    scale = 4
    canvas = SIZE * scale
    base = vertical_gradient(canvas, (150, 194, 255), (86, 140, 246)).convert("RGBA")

    glow = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw_glow = ImageDraw.Draw(glow)
    draw_glow.ellipse([canvas * 0.05, canvas * 0.0, canvas * 0.95, canvas * 0.72], fill=(255, 255, 255, 46))
    glow = glow.filter(ImageFilter.GaussianBlur(canvas * 0.06))
    base.alpha_composite(glow)

    layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx = canvas * 0.5
    head_cy = canvas * 0.585
    head_r = canvas * 0.262

    ear_w = canvas * 0.27
    ear_h = canvas * 0.21
    for sign in (-1, 1):
        d.polygon(ear_points(cx + sign * canvas * 0.155, canvas * 0.355, ear_w, ear_h,
                             sign * canvas * 0.025), fill=(255, 253, 250, 255))
    for sign in (-1, 1):
        d.polygon(ear_points(cx + sign * canvas * 0.155, canvas * 0.375, ear_w * 0.58, ear_h * 0.58,
                             sign * canvas * 0.015), fill=(255, 205, 226, 255))

    d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=(255, 253, 250, 255))

    eye_dx = head_r * 0.46
    eye_cy = head_cy + head_r * 0.02
    eye_w = head_r * 0.26
    eye_h = head_r * 0.34
    for sign in (-1, 1):
        ex = cx + sign * eye_dx
        d.ellipse([ex - eye_w / 2, eye_cy - eye_h / 2, ex + eye_w / 2, eye_cy + eye_h / 2],
                  fill=(58, 88, 150, 255))
        d.ellipse([ex - eye_w * 0.10, eye_cy - eye_h * 0.34, ex + eye_w * 0.16, eye_cy - eye_h * 0.02],
                  fill=(255, 255, 255, 235))

    for sign in (-1, 1):
        bx = cx + sign * head_r * 0.72
        by = head_cy + head_r * 0.30
        d.ellipse([bx - head_r * 0.13, by - head_r * 0.08, bx + head_r * 0.13, by + head_r * 0.08],
                  fill=(255, 168, 198, 190))

    nose_y = head_cy + head_r * 0.30
    d.polygon([(cx - head_r * 0.055, nose_y), (cx + head_r * 0.055, nose_y),
               (cx, nose_y + head_r * 0.075)], fill=(255, 150, 183, 255))
    line_w = max(2, int(canvas * 0.008))
    d.arc([cx - head_r * 0.20, nose_y + head_r * 0.04, cx, nose_y + head_r * 0.24],
          start=10, end=85, fill=(120, 140, 190, 255), width=line_w)
    d.arc([cx, nose_y + head_r * 0.04, cx + head_r * 0.20, nose_y + head_r * 0.24],
          start=95, end=170, fill=(120, 140, 190, 255), width=line_w)

    whisker_w = max(2, int(canvas * 0.006))
    for sign in (-1, 1):
        for dy in (-0.10, 0.02, 0.14):
            sx = cx + sign * head_r * 0.82
            sy = head_cy + head_r * (0.18 + dy)
            ex = cx + sign * head_r * 1.22
            ey = head_cy + head_r * (0.14 + dy * 1.6)
            d.line([(sx, sy), (ex, ey)], fill=(255, 255, 255, 160), width=whisker_w)

    layer = layer.resize((SIZE, SIZE), Image.LANCZOS)
    base = base.resize((SIZE, SIZE), Image.LANCZOS)
    base.alpha_composite(layer)
    result = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    result.paste(base, (0, 0), rounded_mask(SIZE, int(SIZE * 0.22)))

    result.save(BUILD / "icon.png")
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    result.save(BUILD / "icon.ico", sizes=sizes)
    print("written:", BUILD / "icon.ico", (BUILD / "icon.ico").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
