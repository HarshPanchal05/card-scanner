/**
 * Pure pixel-level analysis functions. Everything here operates on an already-decoded RGBA
 * buffer so it can be unit tested without touching the filesystem or a real image.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

export interface PixelMetrics {
  /** Variance of the Laplacian response over the grayscale image — the standard fast proxy for
   *  sharpness. Low variance = few strong edges = likely blurry. */
  blurVariance: number;
  /** Mean luminance, 0-255. */
  brightness: number;
  /** Standard deviation of luminance, 0-255 range. Low = flat/washed-out image. */
  contrast: number;
  /** Fraction (0-1) of pixels with meaningful edge energy — a rough proxy for "is there actual
   *  printed content filling the frame" vs. mostly blank background/table surface. */
  contentCoverage: number;
}

/** Converts an RGBA buffer to a flat grayscale luminance array using the standard Rec. 601
 *  weights, which is more representative of perceived sharpness than a plain average. */
export function toGrayscale(image: DecodedImage): Float32Array {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return gray;
}

/** 3x3 discrete Laplacian convolution, applied to the interior of the image (1px border is
 *  skipped rather than padded, which is negligible for a downscaled analysis image). */
function laplacianResponse(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    const rowUp = row - width;
    const rowDown = row + width;
    for (let x = 1; x < width - 1; x++) {
      const center = gray[row + x];
      const value =
        gray[rowUp + x] + gray[rowDown + x] + gray[row + x - 1] + gray[row + x + 1] - 4 * center;
      out[row + x] = value;
    }
  }
  return out;
}

function mean(values: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length > 0 ? sum / values.length : 0;
}

function variance(values: Float32Array, avg: number): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - avg;
    sum += d * d;
  }
  return values.length > 0 ? sum / values.length : 0;
}

const EDGE_ENERGY_THRESHOLD = 12; // |laplacian response| above this counts as "content"

export function computePixelMetrics(image: DecodedImage): PixelMetrics {
  const gray = toGrayscale(image);
  const brightness = mean(gray);
  const contrastValue = Math.sqrt(variance(gray, brightness));

  const laplacian = laplacianResponse(gray, image.width, image.height);
  const laplacianMean = mean(laplacian);
  const blurVariance = variance(laplacian, laplacianMean);

  let edgePixels = 0;
  for (let i = 0; i < laplacian.length; i++) {
    if (Math.abs(laplacian[i]) >= EDGE_ENERGY_THRESHOLD) edgePixels++;
  }
  const contentCoverage = laplacian.length > 0 ? edgePixels / laplacian.length : 0;

  return { blurVariance, brightness, contrast: contrastValue, contentCoverage };
}
