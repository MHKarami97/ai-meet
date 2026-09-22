import { Meeting } from './models.js';

const DB_NAME = 'ai-meet-db';
const DB_VERSION = 1;
const STORE_MEETINGS = 'meetings';

/**
 * Repository برای دسترسی به IndexedDB. تمام متدها Promise-محور هستند
 * تا هم در background service worker و هم در UI قابل استفاده باشند.
 */
export class MeetingRepository {
  #dbPromise;

  constructor() {
    this.#dbPromise = this.#openDatabase();
  }

  #openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_MEETINGS)) {
          const store = db.createObjectStore(STORE_MEETINGS, { keyPath: 'id' });
          store.createIndex('startedAt', 'startedAt', { unique: false });
          store.createIndex('title', 'title', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async #withStore(mode, callback) {
    const db = await this.#dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, mode);
      const store = tx.objectStore(STORE_MEETINGS);
      const result = callback(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async save(meeting) {
    const plain = JSON.parse(JSON.stringify(meeting));
    await this.#withStore('readwrite', (store) => store.put(plain));
    return meeting;
  }

  async getById(id) {
    const db = await this.#dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, 'readonly');
      const req = tx.objectStore(STORE_MEETINGS).get(id);
      req.onsuccess = () => resolve(req.result ? new Meeting(req.result) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll({ search = '', sortDesc = true } = {}) {
    const db = await this.#dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEETINGS, 'readonly');
      const req = tx.objectStore(STORE_MEETINGS).getAll();
      req.onsuccess = () => {
        let items = req.result.map((r) => new Meeting(r));
        if (search) {
          const q = search.toLowerCase();
          items = items.filter(
            (m) =>
              m.title.toLowerCase().includes(q) ||
              m.toPlainText().toLowerCase().includes(q) ||
              (m.tags || []).some((t) => t.toLowerCase().includes(q))
          );
        }
        items.sort((a, b) => (sortDesc ? b.startedAt - a.startedAt : a.startedAt - b.startedAt));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id) {
    await this.#withStore('readwrite', (store) => store.delete(id));
  }
}

export const meetingRepository = new MeetingRepository();
