/** Phase 14 — timing the real computePixelMetrics() at a few representative analysis
 *  resolutions (matching what decode_stream.py actually produces at analysisWidth=480 for
 *  landscape vs. portrait inputs, plus a couple of comparison points). Pure in-memory timing, no
 *  I/O — isolates the pixel-math cost itself from image decode/network/disk cost. */
import { computePixelMetrics } from '../../src/services/imageQuality/pixelAnalysis';

function randomImage(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  return { width, height, data };
}

const sizes: [string, number, number][] = [
  ['landscape analysisWidth=480 (typical, ~804x444 source)', 480, 265],
  ['portrait analysisWidth=480 (typical, ~444x804 source)', 480, 869],
  ['small thumbnail (240 wide)', 240, 133],
  ['large — un-downscaled full capture (3072x4096)', 3072, 4096],
];

for (const [label, w, h] of sizes) {
  const img = randomImage(w, h);
  const runs = w * h > 2_000_000 ? 3 : 20; // fewer reps for the deliberately-oversized case
  const timings: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    computePixelMetrics(img);
    timings.push(performance.now() - t0);
  }
  const median = timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)];
  console.log(`${label}: ${w}x${h} (${(w * h / 1e6).toFixed(2)}MP) — median ${median.toFixed(2)}ms over ${runs} runs`);
}
