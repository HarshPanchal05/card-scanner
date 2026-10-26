import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { DB_NAME, MIGRATIONS } from './schema';
import { logError } from '../utils/logger';

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let currentVersion = row?.user_version ?? 0;

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    await db.execAsync(MIGRATIONS[i]);
    await db.execAsync(`PRAGMA user_version = ${i + 1};`);
    currentVersion = i + 1;
  }

  return db;
}

let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (or returns the already-open) native database, re-running migrations only the first
 *  time. Invalidated by resetting `openPromise` to null — see isStaleHandleError handling below. */
function ensureOpenNativeDb(): Promise<SQLite.SQLiteDatabase> {
  if (!openPromise) {
    openPromise = openAndMigrate().catch((err) => {
      openPromise = null; // allow retry on next call instead of caching a permanent failure
      throw err;
    });
  }
  return openPromise;
}

/** Matches the specific native error expo-sqlite throws when the JS side holds a reference to a
 *  database handle the native side has already torn down — observed on this project after a JS
 *  bundle reload in a dev-client build, where the native module released its handle independently
 *  of our JS-side cache: "Call to function 'NativeDatabase.prepareAsync' has been rejected ...
 *  Cannot use shared object that was already released." Without recovery, this single stale call
 *  would permanently break every database operation in the app — reads, writes, everything — until
 *  a full process restart, which at a live expo means every scan after that moment silently fails
 *  to save. */
function isStaleHandleError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('already released') || message.includes('NativeDatabase');
}

const WRAPPED_METHODS = [
  'execAsync',
  'runAsync',
  'getFirstAsync',
  'getAllAsync',
  'withTransactionAsync',
] as const;

/** A stable object identity that every caller's `const db = await getDb()` holds onto for the
 *  life of the app. Each wrapped method re-fetches the current native connection on every call
 *  (cheap — just an already-resolved promise in the normal case) and, if the native side reports
 *  the handle was released out from under us, transparently reopens a fresh connection and
 *  retries the same call once. Callers never see the recovery happen; they just see the call
 *  eventually succeed instead of the app being permanently broken. */
function createResilientDb(): SQLite.SQLiteDatabase {
  const stable = {} as Record<string, (...args: unknown[]) => unknown>;
  for (const method of WRAPPED_METHODS) {
    stable[method] = async (...args: unknown[]) => {
      const db = await ensureOpenNativeDb();
      try {
        return await (db[method] as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        if (!isStaleHandleError(err)) throw err;
        logError('db.staleHandleRecovery', err);
        openPromise = null;
        const fresh = await ensureOpenNativeDb();
        return (fresh[method] as (...a: unknown[]) => unknown)(...args);
      }
    };
  }
  return stable as unknown as SQLite.SQLiteDatabase;
}

let resilientDb: SQLite.SQLiteDatabase | null = null;

/** Shared singleton connection. Safe to call repeatedly — the underlying open+migrate work only
 *  runs once per process, and every returned reference is resilient to the native handle being
 *  released out from under it (see createResilientDb). */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!resilientDb) resilientDb = createResilientDb();
  return ensureOpenNativeDb().then(() => resilientDb!);
}

export function generateUuid(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
