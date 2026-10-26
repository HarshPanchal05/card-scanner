import JSZip from 'jszip';
import { Directory, File } from 'expo-file-system';
import { dumpDatabase, restoreDatabase, type DatabaseDump } from '../../database/backupIO';
import { backupsDir, cardsRootDir, ensureAppFolders } from '../storage/fileStorage';

const MANIFEST_VERSION = 1;

interface BackupManifest {
  manifestVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
}

function walkFiles(dir: Directory, relativePrefix: string, out: { relativePath: string; file: File }[]): void {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) {
      walkFiles(entry, `${relativePrefix}${entry.name}/`, out);
    } else if (entry instanceof File) {
      out.push({ relativePath: `${relativePrefix}${entry.name}`, file: entry });
    }
  }
}

export interface BackupProgress {
  phase: 'dumping_database' | 'archiving_images' | 'writing_zip';
}

/** Bundles the SQLite data + every card image into a single zip under CardScanner/Backups.
 *  Reports files are intentionally excluded by default — they are regenerable from the database
 *  at any time via the Reports screen, so skipping them keeps backups small. */
export async function exportBackup(onProgress?: (p: BackupProgress) => void): Promise<string> {
  ensureAppFolders();
  onProgress?.({ phase: 'dumping_database' });
  const dump = await dumpDatabase();

  const zip = new JSZip();
  const manifest: BackupManifest = {
    manifestVersion: MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(dump).map(([table, rows]) => [table, rows.length])),
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('database.json', JSON.stringify(dump));

  onProgress?.({ phase: 'archiving_images' });
  const imageFiles: { relativePath: string; file: File }[] = [];
  walkFiles(cardsRootDir(), '', imageFiles);
  const imagesFolder = zip.folder('images');
  for (const { relativePath, file } of imageFiles) {
    const bytes = await file.bytes();
    imagesFolder?.file(relativePath, bytes);
  }

  onProgress?.({ phase: 'writing_zip' });
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });

  const fileName = `CardScanner_Backup_${new Date().toISOString().slice(0, 10)}.zip`;
  const dest = new File(backupsDir(), fileName);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(base64, { encoding: 'base64' });

  return dest.uri;
}

export class InvalidBackupError extends Error {
  constructor(reason: string) {
    super(`This backup file could not be restored: ${reason}`);
    this.name = 'InvalidBackupError';
  }
}

export interface BackupPreview {
  manifest: BackupManifest;
}

/** Reads and validates a backup zip without changing anything on disk — used to show the user
 *  what they're about to restore before they confirm. */
export async function previewBackup(zipUri: string): Promise<{ zip: JSZip; preview: BackupPreview }> {
  const bytes = await new File(zipUri).bytes();
  const zip = await JSZip.loadAsync(bytes);

  const manifestEntry = zip.file('manifest.json');
  const databaseEntry = zip.file('database.json');
  if (!manifestEntry || !databaseEntry) {
    throw new InvalidBackupError('missing manifest.json or database.json');
  }
  const manifest: BackupManifest = JSON.parse(await manifestEntry.async('string'));
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new InvalidBackupError(`unsupported backup format version ${manifest.manifestVersion}`);
  }
  return { zip, preview: { manifest } };
}

/** Restores database rows (INSERT OR REPLACE, additive/merging) and re-extracts every image file
 *  from the zip into the app's document storage. Callers must have already shown the user a
 *  confirmation dialog — this function does not ask again. */
export async function restoreBackup(zipUri: string): Promise<void> {
  const { zip } = await previewBackup(zipUri);

  const databaseEntry = zip.file('database.json');
  const dump: DatabaseDump = JSON.parse(await databaseEntry!.async('string'));
  await restoreDatabase(dump);

  ensureAppFolders();
  const imageEntries = zip.folder('images');
  if (imageEntries) {
    const entries = Object.values(zip.files).filter(
      (f) => f.name.startsWith('images/') && !f.dir
    );
    for (const entry of entries) {
      const relativePath = entry.name.substring('images/'.length);
      const segments = relativePath.split('/');
      const fileName = segments.pop()!;
      let dir = cardsRootDir();
      for (const segment of segments) {
        dir = new Directory(dir, segment);
        if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      }
      const bytes = await entry.async('uint8array');
      const destFile = new File(dir, fileName);
      if (destFile.exists) destFile.delete();
      destFile.create();
      destFile.write(bytes);
    }
  }
}
