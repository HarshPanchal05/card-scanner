import { decode } from 'jpeg-js';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { computePixelMetrics, type PixelMetrics } from './pixelAnalysis';
import { IMAGE_QUALITY_CONFIG } from '../../constants/config';

export type QualityIssue = 'blurry' | 'too_dark' | 'too_bright' | 'low_contrast' | 'incomplete_card';

export interface QualityThresholds {
  blurVarianceThreshold: number;
  minBrightness: number;
  maxBrightness: number;
  minContrast: number;
  minContentCoverage: number;
}

export interface QualityReport {
  metrics: PixelMetrics;
  issues: QualityIssue[];
  passed: boolean;
  message: string;
}

const ISSUE_MESSAGES: Record<QualityIssue, string> = {
  blurry: 'Image is blurry. Please hold the phone steady and retake.',
  too_dark: 'Image is too dark. Move to better lighting and retake.',
  too_bright: 'Too much glare detected. Reduce reflections and retake.',
  low_contrast: 'Card is not fully visible or contrast is too low. Fill the frame with the card.',
  incomplete_card: 'Card is not fully visible. Move the phone closer and align the card inside the frame.',
};

export function evaluateMetrics(metrics: PixelMetrics, thresholds: QualityThresholds): QualityReport {
  const issues: QualityIssue[] = [];

  if (metrics.blurVariance < thresholds.blurVarianceThreshold) issues.push('blurry');
  if (metrics.brightness < thresholds.minBrightness) issues.push('too_dark');
  if (metrics.brightness > thresholds.maxBrightness) issues.push('too_bright');
  if (metrics.contrast < thresholds.minContrast) issues.push('low_contrast');
  if (metrics.contentCoverage < thresholds.minContentCoverage) issues.push('incomplete_card');

  const passed = issues.length === 0;
  const message = passed ? 'Image quality looks good.' : ISSUE_MESSAGES[issues[0]];

  return { metrics, issues, passed, message };
}

/** Picks which dimension to constrain when downscaling a photo for analysis. Always constrains
 *  the LONGER edge to `target`, regardless of orientation — resizing a portrait (taller-than-wide)
 *  photo by its WIDTH would fit it against its *short* edge instead, giving a very different
 *  (often larger, sometimes even upscaled) effective analysis resolution than a landscape photo of
 *  the same real-world size gets. Found via Kaggle dataset QA calibration: a portrait card resized
 *  by width alone was analyzed at ~480x870 (869 rows) vs. a landscape card's ~480x265 — over 3x the
 *  pixel count and a slight *upscale* rather than downscale — which skewed contentCoverage low
 *  enough to false-reject otherwise-fine portrait photos as "incomplete_card". See
 *  docs/DATASET_CALIBRATION.md. */
export function resizeActionForAnalysis(
  width: number,
  height: number,
  target: number
): { width: number } | { height: number } {
  return width >= height ? { width: target } : { height: target };
}

/** Downscales the captured JPEG for fast analysis, decodes it in pure JS (no native canvas
 *  needed), and evaluates it against the configured thresholds. Runs in well under a second on
 *  a mid-range Android device because the analysis image is small (~480px on its longer edge).
 *  `dimensions` should be the camera capture's own reported width/height (always available on
 *  `CameraCapturedPicture`) so the resize can respect orientation — see
 *  `resizeActionForAnalysis`'s doc comment. Falls back to resizing by width alone (the original,
 *  landscape-only-safe behavior) only if dimensions aren't supplied. */
export async function analyzeImageQuality(
  uri: string,
  dimensions?: { width: number; height: number },
  thresholds: QualityThresholds = IMAGE_QUALITY_CONFIG
): Promise<QualityReport> {
  const resizeAction = dimensions
    ? resizeActionForAnalysis(dimensions.width, dimensions.height, IMAGE_QUALITY_CONFIG.analysisWidth)
    : { width: IMAGE_QUALITY_CONFIG.analysisWidth };

  const small = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: resizeAction }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  const bytes = await new File(small.uri).bytes();
  const decoded = decode(bytes, { useTArray: true });

  const metrics = computePixelMetrics({ width: decoded.width, height: decoded.height, data: decoded.data });
  return evaluateMetrics(metrics, thresholds);
}
