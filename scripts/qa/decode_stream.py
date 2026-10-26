#!/usr/bin/env python3
"""Phase 4 producer half: decodes each image, resizes it to the SAME analysisWidth the production
app uses (IMAGE_QUALITY_CONFIG.analysisWidth, mirrored below as it's a TS const we can't import
into Python — kept in sync by the caller passing --width), converts to RGBA, and streams the raw
pixels to stdout in a simple length-framed binary protocol that benchmark-quality.ts reads. This
mirrors production's `ImageManipulator.manipulateAsync(uri, [{resize:{width}}])` step (aspect-ratio
preserving resize) — only the codec differs (PIL decoding a PNG here vs jpeg-js decoding a JPEG on
device), which does not affect the pixel-math being benchmarked.

Frame format per image, all integers little-endian uint32:
  [name_len][name utf8][width][height][origWidth][origHeight][RGBA bytes, width*height*4]
"""
import struct
import sys
from pathlib import Path

from PIL import Image


def stream_image(path: Path, target_long_edge: int, out):
    with Image.open(path) as im:
        orig_w, orig_h = im.size
        # Mirrors resizeActionForAnalysis() in src/services/imageQuality/qualityCheck.ts: always
        # constrain the LONGER edge to target_long_edge, regardless of orientation. See that
        # function's doc comment for the bug this fixes (portrait photos previously resized by
        # width alone got analyzed at a very different, often-upscaled effective resolution).
        if orig_w >= orig_h:
            width = target_long_edge
            height = max(1, round(orig_h * (target_long_edge / orig_w)))
        else:
            height = target_long_edge
            width = max(1, round(orig_w * (target_long_edge / orig_h)))
        resized = im.convert("RGBA").resize((width, height), Image.BILINEAR)
        data = resized.tobytes()  # RGBA, row-major — matches DecodedImage.data contract exactly

    name_bytes = path.name.encode("utf-8")
    out.write(struct.pack("<I", len(name_bytes)))
    out.write(name_bytes)
    out.write(struct.pack("<IIII", width, height, orig_w, orig_h))
    out.write(data)


def main():
    target_width = int(sys.argv[1])
    list_path = sys.argv[2]  # file with one image path per line
    paths = [Path(p) for p in Path(list_path).read_text(encoding="utf-8").splitlines() if p.strip()]

    out = sys.stdout.buffer
    ok, failed = 0, 0
    for p in paths:
        try:
            stream_image(p, target_width, out)
            ok += 1
        except Exception as e:
            print(f"SKIP {p.name}: {e}", file=sys.stderr)
            failed += 1
    out.flush()
    print(f"streamed {ok} images, {failed} failed", file=sys.stderr)


if __name__ == "__main__":
    main()
