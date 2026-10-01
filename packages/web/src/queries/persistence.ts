import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

// The data the app has shown, kept on this device (IndexedDB) so the app can
// open and show it without a connection. Cleared on sign-out and whenever a
// different account signs in.

const STORAGE_KEY = 'taskflow-query-cache';

/** How long a saved copy stays usable. */
export const PERSIST_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: STORAGE_KEY,
  throttleTime: 2000,
});

export async function clearPersistedCache(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch {
    /* IndexedDB unavailable (private mode): nothing was saved */
  }
}
