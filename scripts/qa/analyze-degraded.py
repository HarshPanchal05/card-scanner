#!/usr/bin/env python3
"""Phases 6/7/8 — groups the degraded-quality.csv benchmark results by transform type (parsed from
the `<original>__<transform>.<ext>` filename convention degrade.py uses) so pass/reject rates and
metric shifts can be read per-degradation-type instead of as one undifferentiated pile.
"""
import csv
import statistics
from collections import defaultdict
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[2] / "qa-results" / "degraded-quality.csv"

rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8")))


def transform_of(filename: str) -> str:
    # <stem>__<transform>.<ext>
    stem = filename.rsplit(".", 1)[0]
    return stem.split("__", 1)[1] if "__" in stem else "unknown"


groups = defaultdict(list)
for r in rows:
    groups[transform_of(r["file"])].append(r)

print(f"{'transform':<26}{'n':>5}{'pass%':>8}{'blurVar(med)':>14}{'bright(med)':>13}{'contrast(med)':>15}{'coverage(med)':>15}  top issues")
print("-" * 130)
for name, rs in sorted(groups.items()):
    n = len(rs)
    passed = sum(1 for r in rs if r["passed"] == "true")
    pass_pct = 100 * passed / n
    blur_med = statistics.median(float(r["blurVariance"]) for r in rs)
    bright_med = statistics.median(float(r["brightness"]) for r in rs)
    contrast_med = statistics.median(float(r["contrast"]) for r in rs)
    coverage_med = statistics.median(float(r["contentCoverage"]) for r in rs)
    issue_counts = defaultdict(int)
    for r in rs:
        for iss in r["issues"].split(";"):
            if iss:
                issue_counts[iss] += 1
    top_issues = ", ".join(f"{k}:{v}" for k, v in sorted(issue_counts.items(), key=lambda x: -x[1])[:3])
    print(f"{name:<26}{n:>5}{pass_pct:>7.1f}%{blur_med:>14.1f}{bright_med:>13.1f}{contrast_med:>15.1f}{coverage_med:>15.4f}  {top_issues}")

# Baseline (undegraded) medians for comparison, from the original full-dataset benchmark.
baseline_csv = Path(__file__).resolve().parents[2] / "qa-results" / "card-quality-baseline.csv"
brows = list(csv.DictReader(open(baseline_csv, encoding="utf-8")))
print("\n--- baseline (undegraded, full 1436) for reference ---")
print(f"pass% = {100 * sum(1 for r in brows if r['passed']=='true') / len(brows):.1f}%")
print(f"blurVariance median = {statistics.median(float(r['blurVariance']) for r in brows):.1f}")
print(f"brightness median = {statistics.median(float(r['brightness']) for r in brows):.1f}")
print(f"contrast median = {statistics.median(float(r['contrast']) for r in brows):.1f}")
print(f"contentCoverage median = {statistics.median(float(r['contentCoverage']) for r in brows):.4f}")
