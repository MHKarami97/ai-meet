import { Meeting } from './models.js';

/**
 * Repository Pattern over IndexedDB. Chosen over chrome.storage.local because
 * transcripts + reports for many meetings need to be queryable and can exceed
 * the practical size where a single JSON blob in chrome.storage stays fast.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 */
const DB_NAME = 'ai-meet-db';
const DB_VERSION = 1;
const STORE_MEETINGS = 'meetings';

export class MeetingDatabase {
  constructor() {
    this.dbPromise = null;
  }

  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
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
    return this.dbPromise;
  }

  async withStore(mode, callback) {
    const db = await this.open();
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
    await this.withStore('readwrite', (store) => store.put(plain));
    return meeting;
  }

  async getMeeting(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, 'readonly');
      const req = tx.objectStore(STORE_MEETINGS).get(id);
      req.onsuccess = () => resolve(req.result ? new Meeting(req.result) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async listMeetings(limit = 200) {
    const db = await this.open();
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
    return this.withStore('readwrite', (store) => store.delete(id));
  }

  async searchMeetings(query) {
    const all = await this.listMeetings(5000);
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
    return this.withStore('readwrite', (store) => store.clear());
  }
}

export const meetingDatabase = new MeetingDatabase();
