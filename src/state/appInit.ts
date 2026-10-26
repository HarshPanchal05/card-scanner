import { getDb } from '../database/db';
import { seedDefaultCategories } from '../repositories/categoriesRepo';
import { getDefaultEvent, createEvent } from '../repositories/eventsRepo';
import { ensureAppFolders } from '../services/storage/fileStorage';
import type { EventRow } from '../types/models';

/** Runs once at app start: applies DB migrations, seeds the category master list, creates the
 *  on-device folder tree, and guarantees at least one event exists so scanning never has nowhere
 *  to attach a card to. Safe to call multiple times. */
export async function initializeApp(): Promise<EventRow> {
  await getDb();
  ensureAppFolders();
  await seedDefaultCategories();

  const existing = await getDefaultEvent();
  if (existing) return existing;

  return createEvent({ name: 'General Scanning', makeDefault: true });
}
