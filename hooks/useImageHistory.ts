import { openDB, IDBPDatabase } from 'idb';
import { AppMode } from '../types';

export interface HistoryEntry {
  id: string;
  mode: AppMode;
  timestamp: number;
  fileName?: string;
  prompt?: string;
  originalImage?: string; // data URL — may be undefined for GENERATE mode
  resultImage?: string;   // data URL
  resultText?: string;    // for ANALYZE mode
}

const DB_NAME    = 'autoshadow-history';
const STORE      = 'results';
const DB_VERSION = 1;
const MAX_ENTRIES = 20;

let _db: Promise<IDBPDatabase> | null = null;

const getDB = (): Promise<IDBPDatabase> => {
  if (!_db) {
    _db = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      },
    });
  }
  return _db;
};

export const historyDB = {
  /** Persist a new entry and prune oldest beyond MAX_ENTRIES. */
  async save(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<void> {
    const db = await getDB();
    const id = crypto.randomUUID();
    await db.put(STORE, { ...entry, id, timestamp: Date.now() });

    // Prune oldest entries
    const all = await db.getAllFromIndex(STORE, 'timestamp');
    if (all.length > MAX_ENTRIES) {
      const toDelete = all.slice(0, all.length - MAX_ENTRIES);
      await Promise.all(toDelete.map((e: HistoryEntry) => db.delete(STORE, e.id)));
    }
  },

  /** Return all entries sorted newest-first. */
  async getAll(): Promise<HistoryEntry[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex(STORE, 'timestamp');
    return (all as HistoryEntry[]).reverse();
  },

  /** Remove a single entry. */
  async remove(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE, id);
  },

  /** Wipe the entire history. */
  async clear(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE);
  },
};
