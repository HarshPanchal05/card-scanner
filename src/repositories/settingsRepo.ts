import { getDb } from '../database/db';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?;',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    key,
    value
  );
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Atomically increments and returns the next value of a named counter, starting at 1.
 *  Used to generate sequential, human-readable IDs like CARD-000124. */
export async function nextCounterValue(counterName: string): Promise<number> {
  const db = await getDb();
  let result = 1;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO id_counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1;`,
      counterName
    );
    const row = await db.getFirstAsync<{ value: number }>(
      'SELECT value FROM id_counters WHERE name = ?;',
      counterName
    );
    result = row?.value ?? 1;
  });
  return result;
}

export async function nextCardDisplayId(): Promise<string> {
  const n = await nextCounterValue('card');
  return `CARD-${String(n).padStart(6, '0')}`;
}
