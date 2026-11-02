import type { ParseOpts } from '../types';

export type ParseCacheMetadata = { key: string; bytes: number; accessedAt: number };
export type ParseCacheRecord<T> = { value: T; bytes: number };

/** Small persistence seam: production uses IndexedDB; Node tests use an in-memory fake. */
export interface ParseCacheStorage<T> {
  read(key: string): Promise<ParseCacheRecord<T> | undefined>;
  touch(metadata: ParseCacheMetadata): Promise<void>;
  write(metadata: ParseCacheMetadata, value: T): Promise<void>;
  metadata(): Promise<ParseCacheMetadata[]>;
  remove(keys: readonly string[]): Promise<void>;
}

/**
 * Failure-is-a-miss cache with a byte cap and true LRU recency.
 *
 * Values and recency live separately in IndexedDB: touching a hit must not structured-clone its
 * megabytes of geometry a second time. Every storage call is contained here so private mode,
 * quota errors, blocked upgrades, or a corrupt database only cost the ordinary parse path.
 */
export class ParseCache<T> {
  constructor(
    private readonly storage: ParseCacheStorage<T>,
    private readonly maxBytes: number,
    private readonly now: () => number = Date.now,
  ) {}

  async read(key: string): Promise<T | undefined> {
    try {
      const hit = await this.storage.read(key);
      if (!hit) return undefined;
      try {
        await this.storage.touch({ key, bytes: hit.bytes, accessedAt: this.now() });
      } catch {
        // Recency is disposable; a valid value remains a hit even when its touch fails.
      }
      return hit.value;
    } catch {
      return undefined;
    }
  }

  async write(key: string, value: T, bytes: number): Promise<void> {
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > this.maxBytes) return;
    try {
      const entries = await this.storage.metadata();
      const others = entries.filter((entry) => entry.key !== key);
      let total = others.reduce((sum, entry) => sum + entry.bytes, 0);
      const remove: string[] = [];
      for (const entry of [...others].sort(
        (a, b) => a.accessedAt - b.accessedAt || a.key.localeCompare(b.key),
      )) {
        if (total + bytes <= this.maxBytes) break;
        remove.push(entry.key);
        total -= entry.bytes;
      }
      if (remove.length > 0) await this.storage.remove(remove);
      await this.storage.write({ key, bytes, accessedAt: this.now() }, value);
    } catch {
      // Cache population is best-effort; the caller already owns the parsed value.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.storage.remove([key]);
    } catch {
      // A bad cache record becomes a miss even when cleanup is unavailable.
    }
  }
}

const CACHE_KEY_SCHEMA = 1;

/** URL + all parse semantics + build identity; no deploy can read an older parser's geometry. */
export function parseCacheKey(url: string, opts: ParseOpts, parserVersion: string): string {
  return JSON.stringify([CACHE_KEY_SCHEMA, parserVersion, url, opts.unit, opts.tol, opts.tolChain]);
}

type StoredValue<T> = { key: string; value: T };

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed'));
  });

const DB_NAME = 'grbpwr-dxf-parse-cache';
const DB_VERSION = 1;
const VALUES = 'values';
const RECENCY = 'recency';
const OPEN_TIMEOUT_MS = 1_000;

/** IndexedDB adapter. Construction is safe in Node; the first operation reports a cache miss. */
export class IndexedDbParseCacheStorage<T> implements ParseCacheStorage<T> {
  private database: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        reject(new Error('IndexedDB open timed out'));
      }, OPEN_TIMEOUT_MS);
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('IndexedDB open failed'));
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(VALUES)) db.createObjectStore(VALUES, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(RECENCY))
          db.createObjectStore(RECENCY, { keyPath: 'key' });
      };
      request.onblocked = () => fail(new Error('IndexedDB open blocked'));
      request.onerror = () => fail(request.error ?? new Error('IndexedDB open failed'));
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        clearTimeout(timeout);
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
    return this.database;
  }

  async read(key: string): Promise<ParseCacheRecord<T> | undefined> {
    const db = await this.open();
    const tx = db.transaction([VALUES, RECENCY], 'readonly');
    const valueRequest = tx.objectStore(VALUES).get(key) as IDBRequest<StoredValue<T> | undefined>;
    const metaRequest = tx.objectStore(RECENCY).get(key) as IDBRequest<
      ParseCacheMetadata | undefined
    >;
    const [stored, metadata] = await Promise.all([
      requestResult(valueRequest),
      requestResult(metaRequest),
      transactionDone(tx),
    ]);
    if (!stored) return undefined;
    return { value: stored.value, bytes: metadata?.bytes ?? 1 };
  }

  async touch(metadata: ParseCacheMetadata): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(RECENCY, 'readwrite');
    tx.objectStore(RECENCY).put(metadata);
    await transactionDone(tx);
  }

  async write(metadata: ParseCacheMetadata, value: T): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([VALUES, RECENCY], 'readwrite');
    tx.objectStore(VALUES).put({ key: metadata.key, value } satisfies StoredValue<T>);
    tx.objectStore(RECENCY).put(metadata);
    await transactionDone(tx);
  }

  async metadata(): Promise<ParseCacheMetadata[]> {
    const db = await this.open();
    const tx = db.transaction(RECENCY, 'readonly');
    const request = tx.objectStore(RECENCY).getAll() as IDBRequest<ParseCacheMetadata[]>;
    const [entries] = await Promise.all([requestResult(request), transactionDone(tx)]);
    return entries;
  }

  async remove(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const db = await this.open();
    const tx = db.transaction([VALUES, RECENCY], 'readwrite');
    for (const key of keys) {
      tx.objectStore(VALUES).delete(key);
      tx.objectStore(RECENCY).delete(key);
    }
    await transactionDone(tx);
  }
}
