#!/usr/bin/env python3
"""Phase 2 — dataset inventory for the Kaggle "Indian Business cards sample images" QA/calibration
pass. Reads every image in the dataset directory, records format/resolution/orientation/aspect
ratio and a handful of cheap heuristics (mean brightness, luminance std-dev as a contrast proxy)
so we can pick a genuinely diverse benchmark subset in the next phase rather than guessing.

Read-only: never modifies the source dataset. Output is a single JSON manifest under qa-results/.
"""
import json
import statistics
import sys
from pathlib import Path

from PIL import Image
import numpy as np

DATASET_DIR = Path(r"C:\Users\admin\Downloads\archive\scraped_images_bcards")
OUT_PATH = Path(__file__).resolve().parents[2] / "qa-results" / "dataset-inventory.json"


def analyze(path: Path) -> dict | None:
    try:
        with Image.open(path) as im:
            width, height = im.size
            fmt = im.format
            # Cheap downsized grayscale pass for brightness/contrast heuristics only — not the
            # production blur metric (that happens in Phase 4 against the real algorithm).
            small = im.convert("L").resize((160, max(1, round(160 * height / width))))
            arr = np.asarray(small, dtype=np.float32)
            brightness = float(arr.mean())
            contrast = float(arr.std())
        return {
            "file": path.name,
            "format": fmt,
            "width": width,
            "height": height,
            "orientation": "landscape" if width >= height else "portrait",
            "aspect_ratio": round(width / height, 3) if height else None,
            "brightness_mean": round(brightness, 1),
            "contrast_std": round(contrast, 1),
        }
    except Exception as e:  # corrupt/unreadable file — record and move on
        return {"file": path.name, "error": str(e)}


def main():
    files = sorted(DATASET_DIR.glob("*"))
    files = [f for f in files if f.is_file()]
    print(f"Found {len(files)} files in {DATASET_DIR}", file=sys.stderr)

    records = []
    for i, f in enumerate(files):
        rec = analyze(f)
        if rec:
            records.append(rec)
        if (i + 1) % 200 == 0:
            print(f"  ...{i + 1}/{len(files)}", file=sys.stderr)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2)

    ok = [r for r in records if "error" not in r]
    errs = [r for r in records if "error" in r]

    formats = {}
    orientations = {"landscape": 0, "portrait": 0}
    widths, heights, aspects, brightness, contrast = [], [], [], [], []
    dark_count = 0
    light_count = 0
    low_contrast_count = 0

    for r in ok:
        formats[r["format"]] = formats.get(r["format"], 0) + 1
        orientations[r["orientation"]] += 1
        widths.append(r["width"])
        heights.append(r["height"])
        aspects.append(r["aspect_ratio"])
        brightness.append(r["brightness_mean"])
        contrast.append(r["contrast_std"])
        if r["brightness_mean"] < 80:
            dark_count += 1
        if r["brightness_mean"] > 200:
            light_count += 1
        if r["contrast_std"] < 25:
            low_contrast_count += 1

    summary = {
        "total_files": len(files),
        "readable": len(ok),
        "unreadable": len(errs),
        "formats": formats,
        "orientations": orientations,
        "width_min": min(widths) if widths else None,
        "width_max": max(widths) if widths else None,
        "width_median": statistics.median(widths) if widths else None,
        "height_min": min(heights) if heights else None,
        "height_max": max(heights) if heights else None,
        "height_median": statistics.median(heights) if heights else None,
        "aspect_ratio_min": min(aspects) if aspects else None,
        "aspect_ratio_max": max(aspects) if aspects else None,
        "aspect_ratio_median": statistics.median(aspects) if aspects else None,
        "brightness_mean_of_means": round(statistics.mean(brightness), 1) if brightness else None,
        "dark_cards_brightness_lt_80": dark_count,
        "light_cards_brightness_gt_200": light_count,
        "low_contrast_std_lt_25": low_contrast_count,
        "errors": [r["file"] for r in errs],
    }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
