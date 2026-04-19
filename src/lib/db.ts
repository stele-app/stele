/**
 * Database connection singleton.
 *
 * Uses @tauri-apps/plugin-sql when running inside Tauri,
 * falls back to null for browser-only dev mode.
 */

import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;
let initPromise: Promise<Database | null> | null = null;

export async function getDb(): Promise<Database | null> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      db = await Database.load('sqlite:atelier.db');
      return db;
    } catch (e) {
      console.warn('[db] SQLite not available, using in-memory fallback:', e);
      return null;
    }
  })();

  return initPromise;
}
