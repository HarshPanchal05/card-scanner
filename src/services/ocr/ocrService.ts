import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { OCR_CONFIG } from '../../constants/config';
import type { OcrResult, OcrBlock, OcrLine } from '../../types/extraction';

/**
 * OCR engine: Google ML Kit Text Recognition v2 (Latin), via @react-native-ml-kit/text-recognition.
 * See docs/OCR.md for why this was chosen over Tesseract/PaddleOCR/cloud OCR.
 *
 * This is a native module and does NOT run inside Expo Go — it requires a development build
 * (`npx expo prebuild` + `eas build --profile development`, or `expo run:android`).
 */

export class OcrUnavailableError extends Error {
  constructor() {
    super(
      'On-device text recognition is not available in this build. This app must be run as a ' +
        'development build (not Expo Go) — see docs/OCR.md.'
    );
    this.name = 'OcrUnavailableError';
  }
}

export class OcrTimeoutError extends Error {
  constructor() {
    super('Text recognition took too long and was cancelled.');
    this.name = 'OcrTimeoutError';
  }
}

/** A genuine on-device recognition failure (bad image data, an ML Kit runtime error, a file the
 *  native side couldn't read, etc.) — distinct from the module simply not being linked. Callers
 *  should treat this the same as "couldn't read this card", not as a build-configuration problem. */
export class OcrRecognitionError extends Error {
  constructor(cause: string) {
    super(`Text recognition failed: ${cause}`);
    this.name = 'OcrRecognitionError';
  }
}

// The exact substring @react-native-ml-kit/text-recognition's Proxy throws when the native module
// isn't linked (see its index.ts LINKING_ERROR). Only this specific failure should be reported as
// "unavailable" — anything else is a real recognition error and must not be misreported as one.
const LINKING_ERROR_SIGNATURE = "doesn't seem to be linked";

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Runs OCR on a single card side. Throws OcrUnavailableError if the native module isn't linked
 *  (Expo Go) and OcrTimeoutError if recognition doesn't finish within OCR_CONFIG.timeoutMs —
 *  callers must catch both and let the user retake/retry rather than letting the app hang. */
export async function recognizeCardSide(imageUri: string, side: 'front' | 'back'): Promise<OcrResult> {
  let raw;
  try {
    raw = await withTimeout(
      TextRecognition.recognize(imageUri, TextRecognitionScript.LATIN),
      OCR_CONFIG.timeoutMs,
      () => new OcrTimeoutError()
    );
  } catch (err) {
    if (err instanceof OcrTimeoutError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(LINKING_ERROR_SIGNATURE)) throw new OcrUnavailableError();
    // A real failure (bad image, ML Kit runtime error, unreadable file) — surface it as such
    // rather than the misleading "you need a development build" message.
    throw new OcrRecognitionError(message);
  }

  const blocks: OcrBlock[] = raw.blocks.map((block) => ({
    text: block.text,
    frame: block.frame
      ? { x: block.frame.left, y: block.frame.top, width: block.frame.width, height: block.frame.height }
      : null,
  }));

  // Block-level frames are too coarse for spatial reasoning (ML Kit frequently groups several
  // visually distinct lines into one block) — flatten out the per-line frames too, which the
  // multi-representative clustering pass needs to tell which phone number sits closest to which
  // person's name on a card that lists more than one representative.
  const lines: OcrLine[] = raw.blocks.flatMap((block) =>
    block.lines.map((line) => ({
      text: line.text,
      frame: line.frame
        ? { x: line.frame.left, y: line.frame.top, width: line.frame.width, height: line.frame.height }
        : null,
      side,
    }))
  );

  return { fullText: raw.text, blocks, lines, side };
}

export function combineOcrResults(front: OcrResult, back: OcrResult | null): string {
  if (!back) return front.fullText;
  return `${front.fullText}\n\n${back.fullText}`;
}

export function combineOcrLines(front: OcrResult, back: OcrResult | null): OcrLine[] {
  if (!back) return front.lines;
  return [...front.lines, ...back.lines];
}
