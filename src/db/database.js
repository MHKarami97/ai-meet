import { Meeting } from './models.js';

/**
 * لایه‌ی دسترسی به داده (Repository Pattern) روی IndexedDB.
 * تمام جلسات، رونوشت خام و گزارش نهایی هر جلسه در یک Object Store نگه داری می‌شود.
 * از chrome.storage.local فقط برای تنزیمات سبک (کلید API، قالب پیش‌فرض و ...) استفاده می‌کنیم؛
 * چون آن استوریج برای داده‌ی حجیم و قابل کوئری مناسب نیست.
 */
const DB_NAME = 'ai-meet-db';
const DB_VERSION = 1;
const STORE_MEETINGS = 'meetings';

export class MeetingDatabase {
  constructor() {
    this._dbPromise = null;
  }

  _open() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_MEETINGS)) {
          const store = db.createObjectStore(STORE_MEETINGS, { keyPath: 'id' });
          store.createIndex('startedAt', 'startedAt', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('title', 'title', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this._dbPromise;
  }

  async _withStore(mode, callback) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, mode);
      const store = tx.objectStore(STORE_MEETINGS);
      const result = callback(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveMeeting(meeting) {
    const plain = JSON.parse(JSON.stringify(meeting));
    await this._withStore('readwrite', (store) => store.put(plain));
    return meeting;
  }

  async getMeeting(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, 'readonly');
      const req = tx.objectStore(STORE_MEETINGS).get(id);
      req.onsuccess = () => resolve(req.result ? new Meeting(req.result) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async listMeetings({ limit = 200 } = {}) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, 'readonly');
      const index = tx.objectStore(STORE_MEETINGS).index('startedAt');
      const results = [];
      const req = index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && results.length < limit) {
          results.push(new Meeting(cursor.value));
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMeeting(id) {
    await this._withStore('readwrite', (store) => store.delete(id));
  }

  async searchMeetings(query) {
    const all = await this.listMeetings({ limit: 5000 });
    const normalized = query.trim().toLowerCase();
    if (!normalized) return all;
    return all.filter((m) => {
      return (
        m.title.toLowerCase().includes(normalized) ||
        m.plainTranscript.toLowerCase().includes(normalized) ||
        (m.report?.executiveSummary || '').toLowerCase().includes(normalized)
      );
    });
  }

  async clearAll() {
    await this._withStore('readwrite', (store) => store.clear());
  }
}

export const meetingDatabase = new MeetingDatabase();
