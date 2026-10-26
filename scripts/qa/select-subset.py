#!/usr/bin/env python3
"""Phase 3 — selects a diverse ~80-image representative subset from the Phase 4 baseline CSV,
stratified across brightness terciles x contrast terciles x pass/reject status, so the synthetic
degradation phase (5) exercises genuinely varied starting material instead of cherry-picked easy
cards. Deterministic (fixed seed) so the selection is reproducible.
"""
import csv
import random
from collections import defaultdict
from pathlib import Path

BASELINE_CSV = Path(__file__).resolve().parents[2] / "qa-results" / "card-quality-baseline.csv"
OUT_LIST = Path(__file__).resolve().parents[2] / "qa-results" / "subset-80.txt"
DATASET_DIR = Path(r"C:\Users\admin\Downloads\archive\scraped_images_bcards")

random.seed(42)

rows = list(csv.DictReader(open(BASELINE_CSV, encoding="utf-8")))
brightness_vals = sorted(float(r["brightness"]) for r in rows)
contrast_vals = sorted(float(r["contrast"]) for r in rows)


def tercile(sorted_vals, v):
    n = len(sorted_vals)
    lo = sorted_vals[n // 3]
    hi = sorted_vals[2 * n // 3]
    return "low" if v < lo else ("high" if v > hi else "mid")


buckets = defaultdict(list)
for r in rows:
    b = tercile(brightness_vals, float(r["brightness"]))
    c = tercile(contrast_vals, float(r["contrast"]))
    status = "pass" if r["passed"] == "true" else "reject"
    buckets[(b, c, status)].append(r["file"])

# Aim for ~4-5 per bucket (3x3x2 = 18 buckets -> ~80 total), falling back gracefully if a bucket
# is small (e.g. reject buckets in the "high brightness" tercile are naturally sparse).
selected = []
per_bucket = 5
for key, files in sorted(buckets.items()):
    random.shuffle(files)
    take = files[:per_bucket]
    selected.extend(take)
    print(f"{key}: {len(files)} available, took {len(take)}")

print(f"\nTotal selected: {len(selected)}")

with open(OUT_LIST, "w", encoding="utf-8") as f:
    for name in selected:
        f.write(str(DATASET_DIR / name).replace("\\", "/") + "\n")

print(f"Wrote {OUT_LIST}")
