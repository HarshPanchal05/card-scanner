/**
 * Pure geometry for mapping the on-screen card guide rectangle to a crop rectangle in the
 * captured photo's own pixel coordinates — no I/O, no React Native imports, fully unit-testable.
 *
 * This is the fix for a real architecture gap: the guide overlay drawn on the camera screen
 * (CardGuideOverlay.tsx) was purely visual — it never restricted what actually got captured, so
 * OCR/extraction ran on the ENTIRE photo, including anything visible outside the guide rectangle
 * (background text, other objects on the table, etc). `getGuideRect` is the single source of
 * truth for the guide's on-screen position (CardGuideOverlay renders from it; ScannerScreen crops
 * from it), and `screenRectToImageRect` converts that screen rectangle into the captured photo's
 * own coordinate space.
 *
 * The conversion assumes the camera preview fills the screen with "cover" scaling: the captured
 * photo (whatever its native sensor aspect ratio — commonly 4:3, independent of the device's own
 * screen aspect ratio) is scaled up until it fully covers the screen in both dimensions, and
 * center-cropped in whichever dimension overflows. This is the standard behavior for a
 * full-screen camera preview with no visible letterbox/pillarbox bars (the near-universal default
 * across camera UI implementations), and matches the fact that expo-camera's CameraView here is
 * rendered as `StyleSheet.absoluteFill` with no configured `resizeMode`.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

// Standard business card aspect ratio (85.6mm x 54mm), drawn as a landscape guide occupying 86%
// of the screen's width — kept in sync with CardGuideOverlay.tsx, which renders exactly this rect.
const GUIDE_WIDTH_FRACTION = 0.86;
const CARD_ASPECT_RATIO = 85.6 / 54;

/** The guide rectangle's position and size in SCREEN coordinates, centered both horizontally and
 *  vertically (matching CardGuideOverlay's flex layout: equal flex:1 dim regions above/below a
 *  fixed-height middle row). */
export function getGuideRect(screenWidth: number, screenHeight: number): Rect {
  const width = screenWidth * GUIDE_WIDTH_FRACTION;
  const height = width / CARD_ASPECT_RATIO;
  return {
    x: (screenWidth - width) / 2,
    y: (screenHeight - height) / 2,
    width,
    height,
  };
}

/** Clamps a rect to lie entirely within [0,0]-[bounds.width,bounds.height], shrinking width/height
 *  as needed rather than ever returning negative dimensions or out-of-bounds coordinates — a crop
 *  request with an out-of-range rect would otherwise throw or silently misbehave. */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const x = Math.max(0, Math.min(rect.x, bounds.width));
  const y = Math.max(0, Math.min(rect.y, bounds.height));
  const width = Math.max(0, Math.min(rect.width, bounds.width - x));
  const height = Math.max(0, Math.min(rect.height, bounds.height - y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Converts a rectangle in SCREEN coordinates (e.g. the guide overlay) into the equivalent
 *  rectangle in the captured IMAGE's own pixel coordinates, given the preview covers the screen
 *  (see module doc comment). Always clamps the result to the image's actual bounds. */
export function screenRectToImageRect(screenRect: Rect, screenSize: Size, imageSize: Size): Rect {
  const coverScale = Math.max(screenSize.width / imageSize.width, screenSize.height / imageSize.height);
  const displayedImageWidth = imageSize.width * coverScale;
  const displayedImageHeight = imageSize.height * coverScale;
  const offsetX = (displayedImageWidth - screenSize.width) / 2;
  const offsetY = (displayedImageHeight - screenSize.height) / 2;

  const imageRect: Rect = {
    x: (screenRect.x + offsetX) / coverScale,
    y: (screenRect.y + offsetY) / coverScale,
    width: screenRect.width / coverScale,
    height: screenRect.height / coverScale,
  };

  return clampRect(imageRect, imageSize);
}
