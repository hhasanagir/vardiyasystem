import { Injectable } from '@angular/core';

export interface QueuedAction {
  id: string;
  actionType: 'clock-in' | 'clock-out' | 'create-handover' | 'create-incident' | 'update-checklist';
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  status: 'pending' | 'syncing' | 'completed' | 'conflicted' | 'failed';
  retryCount: number;
  lastError?: string;
}

const DB_NAME = 'vardiyaos-offline';
const STORE_NAME = 'actions';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async add(
    action: Omit<QueuedAction, 'id' | 'timestamp' | 'status' | 'retryCount'>,
  ): Promise<QueuedAction> {
    await this.init();
    const record: QueuedAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    };
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAll(): Promise<QueuedAction[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const items: QueuedAction[] = [];
      const request = index.openCursor(null, 'next');
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPending(): Promise<QueuedAction[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const items: QueuedAction[] = [];
      const request = index.openCursor(IDBKeyRange.only('pending'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async count(): Promise<number> {
    const items = await this.getPending();
    return items.length;
  }

  async updateStatus(
    id: string,
    status: QueuedAction['status'],
    lastError?: string,
  ): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          resolve();
          return;
        }
        record.status = status;
        record.retryCount =
          status === 'failed' || status === 'conflicted'
            ? record.retryCount + 1
            : record.retryCount;
        if (lastError) record.lastError = lastError;
        store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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
