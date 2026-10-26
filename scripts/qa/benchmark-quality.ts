/**
 * Phase 4 — runs the REAL production `computePixelMetrics` (src/services/imageQuality/
 * pixelAnalysis.ts, zero dependencies, imported directly — not reimplemented) against every image
 * streamed from decode_stream.py, and applies the SAME threshold logic as
 * `evaluateMetrics`/IMAGE_QUALITY_CONFIG in qualityCheck.ts/constants/config.ts.
 *
 * evaluateMetrics() itself can't be imported directly here: the file it lives in
 * (qualityCheck.ts) also exports analyzeImageQuality(), which imports expo-image-manipulator /
 * expo-file-system at module scope — those pull in React Native's Flow-syntax source, which only
 * Metro's Babel transform (not esbuild/tsx/plain Node) can parse. So evaluateMetricsLikeProduction
 * below is a byte-for-byte mirror of evaluateMetrics()'s 5-line threshold comparison (verified
 * against the source at the time of writing) — only the trivial threshold-comparison shell is
 * duplicated; all of the actual pixel-math (Laplacian blur variance, brightness, contrast, content
 * coverage) comes from the real, imported computePixelMetrics().
 *
 * Usage: npx tsx scripts/qa/benchmark-quality.ts <path-list-file> <out-csv> [--degraded]
 * Streams decode_stream.py's stdout directly (spawned as a child process).
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { computePixelMetrics } from '../../src/services/imageQuality/pixelAnalysis';
import { IMAGE_QUALITY_CONFIG } from '../../src/constants/config';

type QualityIssue = 'blurry' | 'too_dark' | 'too_bright' | 'low_contrast' | 'incomplete_card';

/** Mirrors evaluateMetrics() in src/services/imageQuality/qualityCheck.ts exactly — see the
 *  module doc comment above for why it's duplicated here instead of imported. */
function evaluateMetricsLikeProduction(metrics: ReturnType<typeof computePixelMetrics>) {
  const issues: QualityIssue[] = [];
  if (metrics.blurVariance < IMAGE_QUALITY_CONFIG.blurVarianceThreshold) issues.push('blurry');
  if (metrics.brightness < IMAGE_QUALITY_CONFIG.minBrightness) issues.push('too_dark');
  if (metrics.brightness > IMAGE_QUALITY_CONFIG.maxBrightness) issues.push('too_bright');
  if (metrics.contrast < IMAGE_QUALITY_CONFIG.minContrast) issues.push('low_contrast');
  if (metrics.contentCoverage < IMAGE_QUALITY_CONFIG.minContentCoverage) issues.push('incomplete_card');
  return { issues, passed: issues.length === 0 };
}

const [, , listFile, outCsv] = process.argv;
if (!listFile || !outCsv) {
  console.error('Usage: tsx benchmark-quality.ts <path-list-file> <out-csv>');
  process.exit(1);
}

const py = spawn('python3', ['scripts/qa/decode_stream.py', String(IMAGE_QUALITY_CONFIG.analysisWidth), listFile], {
  stdio: ['ignore', 'pipe', 'inherit'],
});

const csv = createWriteStream(outCsv);
csv.write('file,origWidth,origHeight,aspectRatio,blurVariance,brightness,contrast,contentCoverage,passed,issues\n');

let buf = Buffer.alloc(0);
let count = 0;
const summary = {
  total: 0,
  passed: 0,
  rejected: 0,
  byIssue: { blurry: 0, too_dark: 0, too_bright: 0, low_contrast: 0, incomplete_card: 0 } as Record<QualityIssue, number>,
};

function tryParseFrames() {
  for (;;) {
    if (buf.length < 4) return;
    const nameLen = buf.readUInt32LE(0);
    const headerEnd = 4 + nameLen + 16;
    if (buf.length < headerEnd) return;
    const name = buf.toString('utf8', 4, 4 + nameLen);
    const width = buf.readUInt32LE(4 + nameLen);
    const height = buf.readUInt32LE(4 + nameLen + 4);
    const origWidth = buf.readUInt32LE(4 + nameLen + 8);
    const origHeight = buf.readUInt32LE(4 + nameLen + 12);
    const dataLen = width * height * 4;
    const frameEnd = headerEnd + dataLen;
    if (buf.length < frameEnd) return;
    const data = new Uint8Array(buf.buffer, buf.byteOffset + headerEnd, dataLen).slice();

    const metrics = computePixelMetrics({ width, height, data });
    const { issues, passed } = evaluateMetricsLikeProduction(metrics);

    summary.total++;
    if (passed) summary.passed++;
    else {
      summary.rejected++;
      for (const iss of issues) summary.byIssue[iss]++;
    }

    csv.write(
      [
        name,
        origWidth,
        origHeight,
        (origWidth / origHeight).toFixed(3),
        metrics.blurVariance.toFixed(2),
        metrics.brightness.toFixed(2),
        metrics.contrast.toFixed(2),
        metrics.contentCoverage.toFixed(4),
        passed,
        `"${issues.join(';')}"`,
      ].join(',') + '\n'
    );

    count++;
    if (count % 200 === 0) console.error(`  ...${count} analyzed`);
    buf = buf.subarray(frameEnd);
  }
}

py.stdout.on('data', (chunk: Buffer) => {
  buf = Buffer.concat([buf, chunk]);
  tryParseFrames();
});

py.on('close', (code) => {
  tryParseFrames();
  csv.end();
  console.error(`Done. Python exit code: ${code}`);
  console.log(JSON.stringify(summary, null, 2));
});
