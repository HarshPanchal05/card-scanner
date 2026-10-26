import { getDb } from './db';

/** Table names in dependency order (parents before children) — used both when dumping (order
 *  doesn't matter for SELECT) and restoring (order matters so foreign keys resolve). */
export const BACKUP_TABLES = [
  'events',
  'categories',
  'companies',
  'representatives',
  'phone_numbers',
  'emails',
  'company_categories',
  'cards',
  'card_images',
  'card_representatives',
  'app_settings',
  'id_counters',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export type DatabaseDump = Record<BackupTableName, any[]>;

export async function dumpDatabase(): Promise<DatabaseDump> {
  const db = await getDb();
  const dump = {} as DatabaseDump;
  for (const table of BACKUP_TABLES) {
    dump[table] = await db.getAllAsync<any>(`SELECT * FROM ${table};`);
  }
  return dump;
}

/** Restores a dump using INSERT OR REPLACE, so restoring is safe to re-run and merges cleanly
 *  with any rows created after the backup was taken (by primary key). Runs inside a single
 *  transaction — if anything fails, nothing is partially applied.
 *
 *  `id_counters` is a deliberate exception: blindly overwriting it with the backup's value could
 *  make it go *backwards* (e.g. restoring a backup taken when the last card was CARD-000050 onto
 *  a device that has since scanned up to CARD-000080) — the next scan would then generate
 *  CARD-000051, colliding with the UNIQUE `cards.display_id` constraint on an existing card and
 *  breaking capture entirely. Counters are merged to whichever value is higher instead. */
export async function restoreDatabase(dump: DatabaseDump): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    for (const table of BACKUP_TABLES) {
      if (table === 'id_counters') continue; // handled after, merged by max()
      const rows = dump[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`;
        await db.runAsync(sql, ...columns.map((c) => row[c]));
      }
    }
    for (const row of dump.id_counters ?? []) {
      await db.runAsync(
        `INSERT INTO id_counters (name, value) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value);`,
        row.name,
        row.value
      );
    }
    await db.execAsync('PRAGMA foreign_keys = ON;');
  });
}
