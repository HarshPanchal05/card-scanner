import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { STORAGE_CONFIG, IMAGE_QUALITY_CONFIG } from '../../constants/config';
import { logError } from '../../utils/logger';

const MONTH_NAMES = [
  '01-January', '02-February', '03-March', '04-April', '05-May', '06-June',
  '07-July', '08-August', '09-September', '10-October', '11-November', '12-December',
];

function rootDir(): Directory {
  return new Directory(Paths.document, STORAGE_CONFIG.rootFolderName);
}

export function cardsRootDir(): Directory {
  return new Directory(rootDir(), STORAGE_CONFIG.cardsFolderName);
}

export function reportsDir(): Directory {
  return new Directory(rootDir(), STORAGE_CONFIG.reportsFolderName);
}

export function backupsDir(): Directory {
  return new Directory(rootDir(), STORAGE_CONFIG.backupsFolderName);
}

export function tempDir(): Directory {
  return new Directory(rootDir(), STORAGE_CONFIG.tempFolderName);
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

/** Creates the CardScanner/Cards, Reports, Backups, Temp folder tree. Safe to call repeatedly. */
export function ensureAppFolders(): void {
  ensureDir(rootDir());
  ensureDir(cardsRootDir());
  ensureDir(reportsDir());
  ensureDir(backupsDir());
  ensureDir(tempDir());
}

export function cardFolder(displayId: string, capturedAt: Date = new Date()): Directory {
  const year = String(capturedAt.getFullYear());
  const month = MONTH_NAMES[capturedAt.getMonth()];
  const day = String(capturedAt.getDate()).padStart(2, '0');
  const dir = new Directory(cardsRootDir(), year, month, day, displayId);
  ensureDir(dir);
  return dir;
}

export interface PersistedImage {
  uri: string;
  /** Null if thumbnail generation failed — callers fall back to the original for list/preview
   *  rendering. The original photo is never lost just because this cosmetic step failed. */
  thumbnailUri: string | null;
}

/** Copies a freshly-captured camera image into the card's permanent folder as the untouched
 *  original, and generates a compressed thumbnail alongside it for list views. The original is
 *  never re-encoded — it is a byte-for-byte copy of what the camera produced. */
export async function persistCapturedImage(input: {
  tempUri: string;
  cardDisplayId: string;
  side: 'front' | 'back';
  capturedAt?: Date;
}): Promise<PersistedImage> {
  const folder = cardFolder(input.cardDisplayId, input.capturedAt);
  const originalName = `original_${input.side}.jpg`;
  const thumbName = `thumb_${input.side}.jpg`;

  const destOriginal = new File(folder, originalName);
  if (destOriginal.exists) destOriginal.delete();
  const sourceFile = new File(input.tempUri);
  await sourceFile.copy(destOriginal);

  // Thumbnail generation is a cosmetic optimization, not part of the capture's success/failure —
  // a device low on storage/memory during resize should still keep the original photo the user
  // just took, falling back to it directly for list rendering (see CardListItem/getCardImages).
  let thumbnailUri: string | null = null;
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      destOriginal.uri,
      [{ resize: { width: IMAGE_QUALITY_CONFIG.thumbnailWidth } }],
      { compress: IMAGE_QUALITY_CONFIG.thumbnailQuality, format: ImageManipulator.SaveFormat.JPEG }
    );
    const destThumb = new File(folder, thumbName);
    if (destThumb.exists) destThumb.delete();
    await new File(manipulated.uri).copy(destThumb);
    thumbnailUri = destThumb.uri;
  } catch (err) {
    logError('fileStorage.persistCapturedImage.thumbnail', err);
  }

  return { uri: destOriginal.uri, thumbnailUri };
}

export function deleteFileIfExists(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone or inaccessible — nothing to clean up.
  }
}

export function deleteCardFolder(displayId: string, capturedAt: Date): void {
  try {
    const folder = cardFolder(displayId, capturedAt);
    if (folder.exists) folder.delete();
  } catch {
    // Folder already removed.
  }
}

export interface StorageUsage {
  cardsBytes: number;
  reportsBytes: number;
  backupsBytes: number;
  totalBytes: number;
}

export function getStorageUsage(): StorageUsage {
  const cardsBytes = safeDirSize(cardsRootDir());
  const reportsBytes = safeDirSize(reportsDir());
  const backupsBytes = safeDirSize(backupsDir());
  return {
    cardsBytes,
    reportsBytes,
    backupsBytes,
    totalBytes: cardsBytes + reportsBytes + backupsBytes,
  };
}

function safeDirSize(dir: Directory): number {
  try {
    return dir.exists ? dir.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

export function clearTempFolder(): void {
  try {
    const dir = tempDir();
    if (dir.exists) dir.delete();
    ensureDir(tempDir());
  } catch {
    // Best-effort cleanup.
  }
}
