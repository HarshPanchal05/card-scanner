import { computePixelMetrics, toGrayscale, type DecodedImage } from '../../src/services/imageQuality/pixelAnalysis';

function makeFlatImage(width: number, height: number, gray: number): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function makeCheckerboardImage(width: number, height: number): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isLight = (x + y) % 2 === 0;
      const value = isLight ? 255 : 0;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('toGrayscale', () => {
  it('converts a flat white image to uniform luminance 255', () => {
    const image = makeFlatImage(4, 4, 255);
    const gray = toGrayscale(image);
    expect(Array.from(gray).every((v) => v === 255)).toBe(true);
  });
});

describe('computePixelMetrics', () => {
  it('reports near-zero blur variance for a perfectly flat (blurry/blank) image', () => {
    const image = makeFlatImage(40, 40, 128);
    const metrics = computePixelMetrics(image);
    expect(metrics.blurVariance).toBeCloseTo(0, 5);
    expect(metrics.contentCoverage).toBeCloseTo(0, 5);
  });

  it('reports high blur variance for a sharp checkerboard pattern', () => {
    const image = makeCheckerboardImage(40, 40);
    const metrics = computePixelMetrics(image);
    expect(metrics.blurVariance).toBeGreaterThan(1000);
    expect(metrics.contentCoverage).toBeGreaterThan(0.5);
  });

  it('reports correct mean brightness for a flat mid-gray image', () => {
    const image = makeFlatImage(10, 10, 100);
    const metrics = computePixelMetrics(image);
    expect(metrics.brightness).toBeCloseTo(100, 0);
    expect(metrics.contrast).toBeCloseTo(0, 5);
  });
});
