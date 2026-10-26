#!/usr/bin/env python3
"""Phase 5 — generates reproducible, documented synthetic degradations of the Phase 3 subset, so
Phase 6/7/8 can measure before/after quality-gate behavior against controlled distortions rather
than guessing. Every transform is a standard, well-known operation (Pillow filters/enhance/
transform) with fixed parameters — nothing dataset- or card-specific.

Output: qa-data/kaggle-business-cards/degraded/<original_stem>__<transform>.<ext>
"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

SUBSET_LIST = Path(__file__).resolve().parents[2] / "qa-results" / "subset-80.txt"
OUT_DIR = Path(__file__).resolve().parents[2] / "qa-data" / "kaggle-business-cards" / "degraded"

random.seed(42)


def blur(im, radius):
    return im.filter(ImageFilter.GaussianBlur(radius))


def brightness(im, factor):
    return ImageEnhance.Brightness(im).enhance(factor)


def contrast(im, factor):
    return ImageEnhance.Contrast(im).enhance(factor)


def rotate(im, degrees):
    return im.rotate(degrees, expand=True, fillcolor=(255, 255, 255))


def perspective(im, strength):
    """Mild/moderate perspective skew: shifts the top edge inward by `strength` fraction of width."""
    w, h = im.size
    dx = int(w * strength)
    # Coefficients for PIL's PERSPECTIVE transform, source quad -> dest quad.
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(dx, 0), (w - dx, 0), (w, h), (0, h)]
    coeffs = find_perspective_coeffs(dst, src)
    return im.transform((w, h), Image.PERSPECTIVE, coeffs, fillcolor=(255, 255, 255))


def find_perspective_coeffs(pa, pb):
    import numpy as np

    matrix = []
    for p1, p2 in zip(pa, pb):
        matrix.append([p2[0], p2[1], 1, 0, 0, 0, -p1[0] * p2[0], -p1[0] * p2[1]])
        matrix.append([0, 0, 0, p2[0], p2[1], 1, -p1[1] * p2[0], -p1[1] * p2[1]])
    a = np.array(matrix, dtype=np.float64)
    b = np.array(pa, dtype=np.float64).reshape(8)
    res = np.linalg.solve(a, b)
    return res.tolist()


def crop(im, fraction):
    w, h = im.size
    dx, dy = int(w * fraction / 2), int(h * fraction / 2)
    return im.crop((dx, dy, w - dx, h - dy))


def scale(im, fraction):
    w, h = im.size
    small = im.resize((max(1, int(w * fraction)), max(1, int(h * fraction))), Image.BILINEAR)
    return small.resize((w, h), Image.BILINEAR)  # scale back up to keep comparable dimensions


TRANSFORMS = [
    ("blur_mild", lambda im: blur(im, 1.0), "png"),
    ("blur_medium", lambda im: blur(im, 3.0), "png"),
    ("blur_strong", lambda im: blur(im, 6.0), "png"),
    ("dark_moderate", lambda im: brightness(im, 0.7), "png"),
    ("dark_strong", lambda im: brightness(im, 0.5), "png"),
    ("overexposed_moderate", lambda im: brightness(im, 1.3), "png"),
    ("overexposed_strong", lambda im: brightness(im, 1.5), "png"),
    ("contrast_reduced", lambda im: contrast(im, 0.5), "png"),
    ("rotate_5", lambda im: rotate(im, 5), "png"),
    ("rotate_10", lambda im: rotate(im, 10), "png"),
    ("rotate_20", lambda im: rotate(im, 20), "png"),
    ("rotate_90_portrait_sim", lambda im: rotate(im, 90), "png"),
    ("perspective_mild", lambda im: perspective(im, 0.05), "png"),
    ("perspective_moderate", lambda im: perspective(im, 0.12), "png"),
    ("crop_5pct", lambda im: crop(im, 0.05), "png"),
    ("crop_10pct", lambda im: crop(im, 0.10), "png"),
    ("crop_20pct", lambda im: crop(im, 0.20), "png"),
    ("scale_75pct", lambda im: scale(im, 0.75), "png"),
    ("scale_50pct", lambda im: scale(im, 0.50), "png"),
    ("scale_30pct", lambda im: scale(im, 0.30), "png"),
    ("jpeg_medium", lambda im: im, "jpeg_q40"),  # handled specially below
    ("jpeg_strong", lambda im: im, "jpeg_q15"),
]


def main():
    paths = [Path(p) for p in SUBSET_LIST.read_text(encoding="utf-8").splitlines() if p.strip()]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    for i, path in enumerate(paths):
        with Image.open(path) as im:
            im = im.convert("RGB")
            for name, fn, ext in TRANSFORMS:
                out_path = OUT_DIR / f"{path.stem}__{name}.{'jpg' if ext.startswith('jpeg') else ext}"
                if ext.startswith("jpeg"):
                    quality = int(ext.split("q")[1])
                    im.save(out_path, "JPEG", quality=quality)
                else:
                    result = fn(im)
                    result.save(out_path, "PNG")
                manifest.append({"original": path.name, "transform": name, "output": out_path.name})
        if (i + 1) % 20 == 0:
            print(f"...{i + 1}/{len(paths)} originals processed", file=sys.stderr)

    print(f"Generated {len(manifest)} degraded variants from {len(paths)} originals -> {OUT_DIR}", file=sys.stderr)

    # Write the list of degraded file paths for the benchmark script to consume.
    list_out = Path(__file__).resolve().parents[2] / "qa-results" / "degraded-list.txt"
    with open(list_out, "w", encoding="utf-8") as f:
        for m in manifest:
            f.write(str(OUT_DIR / m["output"]).replace("\\", "/") + "\n")
    print(f"Wrote {list_out}", file=sys.stderr)

    import json
    with open(Path(__file__).resolve().parents[2] / "qa-results" / "degraded-manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


if __name__ == "__main__":
    main()
