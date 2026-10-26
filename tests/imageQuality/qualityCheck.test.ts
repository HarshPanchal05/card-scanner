import { evaluateMetrics, resizeActionForAnalysis } from '../../src/services/imageQuality/qualityCheck';
import { IMAGE_QUALITY_CONFIG } from '../../src/constants/config';

const THRESHOLDS = {
  blurVarianceThreshold: IMAGE_QUALITY_CONFIG.blurVarianceThreshold,
  minBrightness: IMAGE_QUALITY_CONFIG.minBrightness,
  maxBrightness: IMAGE_QUALITY_CONFIG.maxBrightness,
  minContrast: IMAGE_QUALITY_CONFIG.minContrast,
  minContentCoverage: IMAGE_QUALITY_CONFIG.minContentCoverage,
};

const GOOD_METRICS = { blurVariance: 200, brightness: 140, contrast: 40, contentCoverage: 0.3 };

describe('evaluateMetrics', () => {
  it('passes a well-lit, sharp, fully-framed image', () => {
    const report = evaluateMetrics(GOOD_METRICS, THRESHOLDS);
    expect(report.passed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('flags a blurry image and returns the retake message', () => {
    const report = evaluateMetrics({ ...GOOD_METRICS, blurVariance: 5 }, THRESHOLDS);
    expect(report.passed).toBe(false);
    expect(report.issues).toContain('blurry');
    expect(report.message).toMatch(/blurry/i);
  });

  it('flags an image that is too dark', () => {
    const report = evaluateMetrics({ ...GOOD_METRICS, brightness: 10 }, THRESHOLDS);
    expect(report.issues).toContain('too_dark');
  });

  it('flags an image with too much glare', () => {
    const report = evaluateMetrics({ ...GOOD_METRICS, brightness: 250 }, THRESHOLDS);
    expect(report.issues).toContain('too_bright');
  });

  it('flags an incomplete/not-fully-visible card', () => {
    const report = evaluateMetrics({ ...GOOD_METRICS, contentCoverage: 0.01 }, THRESHOLDS);
    expect(report.issues).toContain('incomplete_card');
  });

  it('can report multiple simultaneous issues', () => {
    const report = evaluateMetrics({ blurVariance: 1, brightness: 5, contrast: 1, contentCoverage: 0.001 }, THRESHOLDS);
    expect(report.issues.length).toBeGreaterThan(1);
  });
});

describe('resizeActionForAnalysis', () => {
  // Regression coverage for a real bug found during Kaggle dataset QA calibration: resizing every
  // photo by WIDTH alone (regardless of orientation) analyzed portrait cards at ~3x the pixel
  // count of landscape ones (and slightly upscaled instead of downscaled), which skewed
  // contentCoverage low enough to false-reject fine portrait photos as "incomplete_card". See
  // docs/DATASET_CALIBRATION.md.

  it('constrains width for a landscape photo (wider than tall)', () => {
    expect(resizeActionForAnalysis(804, 444, 480)).toEqual({ width: 480 });
  });

  it('constrains height for a portrait photo (taller than wide)', () => {
    expect(resizeActionForAnalysis(444, 804, 480)).toEqual({ height: 480 });
  });

  it('constrains width for a square photo (no orientation to speak of)', () => {
    expect(resizeActionForAnalysis(500, 500, 480)).toEqual({ width: 480 });
  });

  it('the exact real-world case that motivated the fix: a 90°-rotated landscape card', () => {
    // A card photographed in portrait orientation is dimensionally the landscape card's width and
    // height swapped. Both orientations must now target the same longer-edge pixel count.
    const landscape = resizeActionForAnalysis(804, 444, 480);
    const portrait = resizeActionForAnalysis(444, 804, 480);
    expect(landscape).toEqual({ width: 480 });
    expect(portrait).toEqual({ height: 480 });
    // Neither ever constrains the SHORT edge to the target — that was the bug.
    expect(landscape).not.toEqual({ height: 480 });
    expect(portrait).not.toEqual({ width: 480 });
  });
});
