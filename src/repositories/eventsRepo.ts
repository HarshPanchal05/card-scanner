import { getDb, generateUuid, nowIso } from '../database/db';
import type { EventRow } from '../types/models';
export type { EventRow } from '../types/models';

export async function listEvents(includeArchived = false): Promise<EventRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    includeArchived
      ? 'SELECT * FROM events ORDER BY created_at DESC;'
      : 'SELECT * FROM events WHERE is_archived = 0 ORDER BY created_at DESC;'
  );
  return rows.map(mapEvent);
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM events WHERE id = ?;', id);
  return row ? mapEvent(row) : null;
}

export async function getDefaultEvent(): Promise<EventRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM events WHERE is_default = 1 ORDER BY created_at DESC LIMIT 1;'
  );
  return row ? mapEvent(row) : null;
}

export async function createEvent(input: {
  name: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  makeDefault?: boolean;
}): Promise<EventRow> {
  const db = await getDb();
  const id = generateUuid();
  const createdAt = nowIso();

  await db.withTransactionAsync(async () => {
    if (input.makeDefault) {
      await db.runAsync('UPDATE events SET is_default = 0;');
    }
    await db.runAsync(
      `INSERT INTO events (id, name, location, start_date, end_date, is_archived, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
      id,
      input.name,
      input.location ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      input.makeDefault ? 1 : 0,
      createdAt
    );
  });

  const created = await getEvent(id);
  if (!created) throw new Error('Failed to create event');
  return created;
}

export async function renameEvent(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE events SET name = ? WHERE id = ?;', name, id);
}

export async function setDefaultEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE events SET is_default = 0;');
    await db.runAsync('UPDATE events SET is_default = 1 WHERE id = ?;', id);
  });
}

export async function archiveEvent(id: string, archived: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE events SET is_archived = ? WHERE id = ?;', archived ? 1 : 0, id);
}

function mapEvent(row: any): EventRow {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    startDate: row.start_date,
    endDate: row.end_date,
    isArchived: row.is_archived,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}
