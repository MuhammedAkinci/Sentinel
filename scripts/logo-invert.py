#!/usr/bin/env python3
"""
Invert the brand logo so it ships as green pixels on a transparent
background instead of black pixels on a green field.

Source:  sentinel.png    720x820, bright-green ground with dark glyph.
Sinks:   packages/frontend/public/
           logo.png            512x512   master mark, transparent ground
           logo-mono.png       512x512   pure-white pixels variant
           apple-touch-icon.png 180x180  iOS home-screen
           icon-512.png        512x512   PWA / og fallback
           icon-256.png        256x256   any-purpose
           icon-32.png         32x32     legacy favicon
           icon-16.png         16x16     legacy favicon
           favicon.ico         multi-res 16/32/48

The classification rule is simple and deterministic: a pixel is
foreground if its luminance is below a small threshold (the dark
pixels of the glyph are visually black), otherwise it is background
(the bright-green field). Antialiased edge pixels keep their
proportional alpha so the result reads as crisp pixels, not haloed
ink.
"""
from __future__ import annotations
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "sentinel.png"
OUT = ROOT / "packages" / "frontend" / "public"
OUT.mkdir(parents=True, exist_ok=True)

BRAND_GREEN = (0, 255, 136)  # #00FF88
WHITE = (255, 255, 255)

LUMA_BG_HIGH = 180  # pixels brighter than this are pure background
LUMA_FG_LOW = 80    # pixels darker than this are pure foreground


def invert(img: Image.Image, fg_rgb: tuple[int, int, int]) -> Image.Image:
    """Replace dark pixels with `fg_rgb` and make the bright-green ground
    transparent. Edge pixels in between map to a proportional alpha so
    the mark stays crisp."""
    img = img.convert("RGB")
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    src = img.load()
    dst = out.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            # Perceived luminance, Rec. 709 weights.
            luma = int(0.2126 * r + 0.7152 * g + 0.0722 * b)
            if luma <= LUMA_FG_LOW:
                alpha = 255
            elif luma >= LUMA_BG_HIGH:
                alpha = 0
            else:
                # Linear ramp between FG_LOW and BG_HIGH.
                alpha = int(255 * (LUMA_BG_HIGH - luma) / (LUMA_BG_HIGH - LUMA_FG_LOW))
            if alpha > 0:
                dst[x, y] = (fg_rgb[0], fg_rgb[1], fg_rgb[2], alpha)
    return out


def square_centered(img: Image.Image) -> Image.Image:
    """Pad to a square canvas keeping the source centered, transparent fill."""
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def trim_alpha(img: Image.Image, padding: int = 24) -> Image.Image:
    """Crop transparent margins and re-pad to a square with `padding` px
    on every side. Produces a tighter logo than the raw source's
    generous whitespace."""
    bbox = img.getbbox()
    if bbox is None:
        return img
    trimmed = img.crop(bbox)
    w, h = trimmed.size
    side = max(w, h) + padding * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(trimmed, ((side - w) // 2, (side - h) // 2), trimmed)
    return canvas


def export(img: Image.Image, name: str, size: int) -> None:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    path = OUT / name
    resized.save(path, "PNG")
    print(f"  wrote {path.relative_to(ROOT)}  ({size}x{size})")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")

    print(f"reading {SRC.relative_to(ROOT)}")
    src = Image.open(SRC)

    green_glyph = trim_alpha(invert(src, BRAND_GREEN))
    print("brand-green variant:")
    export(green_glyph, "logo.png", 512)
    export(green_glyph, "icon-512.png", 512)
    export(green_glyph, "icon-256.png", 256)
    export(green_glyph, "apple-touch-icon.png", 180)
    export(green_glyph, "icon-32.png", 32)
    export(green_glyph, "icon-16.png", 16)

    print("white-mono variant:")
    mono_glyph = trim_alpha(invert(src, WHITE))
    export(mono_glyph, "logo-mono.png", 512)

    # Multi-resolution favicon.ico (16, 32, 48).
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_path = OUT / "favicon.ico"
    green_glyph.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"  wrote {ico_path.relative_to(ROOT)}  ({', '.join(f'{w}x{h}' for w, h in ico_sizes)})")


if __name__ == "__main__":
    main()
