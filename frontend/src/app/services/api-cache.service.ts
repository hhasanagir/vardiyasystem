import { Injectable } from '@angular/core';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  etag?: string;
}

const DB_NAME = 'vardiyaos-cache';
const STORE_NAME = 'api_cache';
const DB_VERSION = 1;
const DEFAULT_TTL = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ApiCacheService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => { this.db = request.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<CacheEntry | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const entry: CacheEntry | undefined = req.result;
        if (!entry) { resolve(null); return; }
        if (Date.now() - entry.timestamp > entry.ttl) {
          this.remove(key);
          resolve(null);
          return;
        }
        resolve(entry);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async set(key: string, data: any, ttl: number = DEFAULT_TTL, etag?: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const entry: CacheEntry = { data, timestamp: Date.now(), ttl, etag };
      tx.objectStore(STORE_NAME).put({ key, ...entry });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(key: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearExpired(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const now = Date.now();
      const req = index.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        const entry: CacheEntry = cursor.value;
        if (now - entry.timestamp > entry.ttl) {
          cursor.delete();
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
