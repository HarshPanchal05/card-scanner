/**
 * Regression tests for the camera guide -> image-crop coordinate transform — the fix for a real
 * bug found during Kaggle dataset QA: the on-screen guide rectangle (CardGuideOverlay) was purely
 * visual and never restricted what got captured, so OCR/extraction ran on the ENTIRE photo,
 * including anything visible outside the guide (background text, other objects). See
 * src/utils/cardGuideGeometry.ts and FINAL_DEVICE_QA_REPORT.md's "ROI / Frame-Only OCR Fix"
 * section for the full writeup.
 */
import { getGuideRect, screenRectToImageRect, clampRect, type Rect } from '../../src/utils/cardGuideGeometry';

describe('getGuideRect', () => {
  it('is horizontally and vertically centered on the screen', () => {
    const screenW = 1080;
    const screenH = 2392;
    const rect = getGuideRect(screenW, screenH);
    expect(rect.x).toBeCloseTo((screenW - rect.width) / 2, 5);
    expect(rect.y).toBeCloseTo((screenH - rect.height) / 2, 5);
  });

  it('matches the business card aspect ratio (85.6mm x 54mm)', () => {
    const rect = getGuideRect(1080, 2392);
    expect(rect.width / rect.height).toBeCloseTo(85.6 / 54, 3);
  });

  it('occupies 86% of the screen width', () => {
    const rect = getGuideRect(1000, 2000);
    expect(rect.width).toBeCloseTo(860, 5);
  });

  it('fits entirely within the screen for a range of screen sizes', () => {
    for (const [w, h] of [[1080, 2392], [720, 1600], [1440, 3120], [828, 1792]]) {
      const rect = getGuideRect(w, h);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(w);
      expect(rect.y + rect.height).toBeLessThanOrEqual(h);
    }
  });
});

describe('clampRect', () => {
  it('leaves an in-bounds rect untouched', () => {
    const rect: Rect = { x: 10, y: 10, width: 50, height: 50 };
    expect(clampRect(rect, { width: 100, height: 100 })).toEqual(rect);
  });

  it('clamps a rect that starts outside the bounds', () => {
    const rect: Rect = { x: -20, y: -30, width: 50, height: 50 };
    const clamped = clampRect(rect, { width: 100, height: 100 });
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it('shrinks a rect that overflows the bounds rather than going negative', () => {
    const rect: Rect = { x: 80, y: 80, width: 50, height: 50 };
    const clamped = clampRect(rect, { width: 100, height: 100 });
    expect(clamped.x).toBe(80);
    expect(clamped.width).toBe(20); // 100 - 80
    expect(clamped.height).toBe(20);
  });

  it('never produces negative width/height for a rect entirely outside the bounds', () => {
    const rect: Rect = { x: 500, y: 500, width: 50, height: 50 };
    const clamped = clampRect(rect, { width: 100, height: 100 });
    expect(clamped.width).toBeGreaterThanOrEqual(0);
    expect(clamped.height).toBeGreaterThanOrEqual(0);
  });
});

describe('screenRectToImageRect', () => {
  it('maps 1:1 when screen and image have the identical size (no scaling, no offset)', () => {
    const screenSize = { width: 1000, height: 2000 };
    const imageSize = { width: 1000, height: 2000 };
    const screenRect: Rect = { x: 100, y: 200, width: 300, height: 400 };
    expect(screenRectToImageRect(screenRect, screenSize, imageSize)).toEqual(screenRect);
  });

  it('maps 1:1 under uniform scaling when screen and image share the same aspect ratio', () => {
    const screenSize = { width: 1000, height: 2000 }; // 0.5 aspect
    const imageSize = { width: 500, height: 1000 }; // same 0.5 aspect, half the size
    const screenRect: Rect = { x: 200, y: 400, width: 200, height: 300 };
    const result = screenRectToImageRect(screenRect, screenSize, imageSize);
    // coverScale = 0.5 uniformly, no crop offset since aspect ratios match exactly.
    expect(result).toEqual({ x: 100, y: 200, width: 100, height: 150 });
  });

  it('a WIDER image than the screen is cropped left/right, centered (height-constrained cover)', () => {
    const screenSize = { width: 1000, height: 2000 }; // 0.5 aspect
    const imageSize = { width: 3000, height: 4000 }; // 0.75 aspect — wider relative to screen
    // coverScale = max(1000/3000, 2000/4000) = max(0.333, 0.5) = 0.5 (height-constrained)
    // displayed: 1500x2000 -> screen shows the center 1000 of that 1500-wide strip
    // offsetX = (1500-1000)/2 = 250 (displayed px) = 500 (image px, /0.5)
    const screenRect: Rect = { x: 0, y: 0, width: 1000, height: 2000 }; // whole screen
    const result = screenRectToImageRect(screenRect, screenSize, imageSize);
    expect(result.x).toBeCloseTo(500, 1); // left 500px of the image is cropped away
    expect(result.width).toBeCloseTo(2000, 1); // 1000 screen px / 0.5 coverScale
    expect(result.y).toBeCloseTo(0, 1);
    expect(result.height).toBeCloseTo(4000, 1); // full image height is visible (no vertical crop)
  });

  it('a TALLER image than the screen is cropped top/bottom, centered (width-constrained cover)', () => {
    const screenSize = { width: 1000, height: 2000 }; // 0.5 aspect
    const imageSize = { width: 800, height: 2000 }; // 0.4 aspect — narrower/taller relative to screen
    // coverScale = max(1000/800, 2000/2000) = max(1.25, 1) = 1.25 (width-constrained)
    // displayed: 1000x2500 -> screen shows the center 2000 of that 2500-tall strip
    // offsetY = (2500-2000)/2 = 250 (displayed px) = 200 (image px, /1.25)
    const screenRect: Rect = { x: 0, y: 0, width: 1000, height: 2000 };
    const result = screenRectToImageRect(screenRect, screenSize, imageSize);
    expect(result.x).toBeCloseTo(0, 1);
    expect(result.width).toBeCloseTo(800, 1); // full image width is visible (no horizontal crop)
    expect(result.y).toBeCloseTo(200, 1); // top 200px of the image is cropped away
    expect(result.height).toBeCloseTo(1600, 1); // 2000 screen px / 1.25 coverScale
  });

  it('the exact real-world case: portrait device screen, landscape card guide, 4:3 photo capture', () => {
    // A realistic device screen (portrait) and a camera capture at the common Android default 4:3
    // ratio (reported here in portrait orientation, matching a real capture seen on-device this
    // session: 3072x4096).
    const screenSize = { width: 1080, height: 2392 };
    const imageSize = { width: 3072, height: 4096 };
    const guideRect = getGuideRect(screenSize.width, screenSize.height);
    const result = screenRectToImageRect(guideRect, screenSize, imageSize);

    // The resulting crop must stay entirely within the captured image...
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(imageSize.width);
    expect(result.y + result.height).toBeLessThanOrEqual(imageSize.height);
    // ...and preserve the guide's landscape card aspect ratio (cover scaling is uniform in both
    // axes, so aspect ratio survives the transform).
    expect(result.width / result.height).toBeCloseTo(guideRect.width / guideRect.height, 2);
    // Roughly centered horizontally within the image (the guide is horizontally centered on
    // screen, and this device's screen is narrower than the cover-scaled image).
    const imageCenterX = imageSize.width / 2;
    const roiCenterX = result.x + result.width / 2;
    expect(Math.abs(roiCenterX - imageCenterX)).toBeLessThan(imageSize.width * 0.05);
  });

  it('clamps the result even if an oversized screen rect is passed in', () => {
    const screenSize = { width: 1000, height: 2000 };
    const imageSize = { width: 1000, height: 2000 };
    const screenRect: Rect = { x: -500, y: -500, width: 5000, height: 5000 };
    const result = screenRectToImageRect(screenRect, screenSize, imageSize);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(imageSize.width);
    expect(result.y + result.height).toBeLessThanOrEqual(imageSize.height);
  });
});
