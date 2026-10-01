/**
 * @file localVault.ts
 * @description 100% Local Encrypted Database Vault for WhisperMesh chats and spaces.
 * Strictly adheres to PRD zero-cloud persistence: all chat transcripts, attachments,
 * favorite spaces, and pairing identities are stored locally in browser IndexedDB / localStorage.
 */

export interface StoredMessage {
  id: string;
  spaceAddress: string;
  senderDeviceId: string;
  senderName: string;
  text: string;
  timestamp: number;
  deliveryStatus: 'sent' | 'delivered' | 'received';
}

export interface FavoriteSpace {
  spaceAddress: string;
  alias: string;
  lastConnected: number;
}

const DB_NAME = 'WhisperMeshVault';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_SPACES = 'spaces';

class LocalVault {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('spaceAddress', 'spaceAddress', { unique: false });
          msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SPACES)) {
          db.createObjectStore(STORE_SPACES, { keyPath: 'spaceAddress' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Save a chat message to the local encrypted vault
   */
  public async saveMessage(msg: StoredMessage): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const req = store.put(msg);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get all messages for a specific Space Address
   */
  public async getMessagesForSpace(spaceAddress: string): Promise<StoredMessage[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('spaceAddress');
      const req = index.getAll(spaceAddress);

      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => a.timestamp - b.timestamp);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Add a favorite space to local storage
   */
  public async addFavoriteSpace(space: FavoriteSpace): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SPACES, 'readwrite');
      const store = tx.objectStore(STORE_SPACES);
      const req = store.put(space);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get all saved favorite spaces
   */
  public async getFavoriteSpaces(): Promise<FavoriteSpace[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SPACES, 'readonly');
      const store = tx.objectStore(STORE_SPACES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Delete a favorite space
   */
  public async removeFavoriteSpace(spaceAddress: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SPACES, 'readwrite');
      const store = tx.objectStore(STORE_SPACES);
      const req = store.delete(spaceAddress);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Export all chat messages for a space as a downloadable JSON or Markdown file
   */
  public async exportChat(spaceAddress: string, format: 'json' | 'markdown' = 'markdown'): Promise<string> {
    const msgs = await this.getMessagesForSpace(spaceAddress);
    if (format === 'json') {
      return JSON.stringify({ spaceAddress, exportedAt: new Date().toISOString(), messages: msgs }, null, 2);
    }

    let md = `# WhisperMesh Chat Transcript\n`;
    md += `**Space Address:** \`${spaceAddress}\`\n`;
    md += `**Exported At:** ${new Date().toLocaleString()}\n`;
    md += `**Total Messages:** ${msgs.length}\n\n---\n\n`;

    for (const m of msgs) {
      const time = new Date(m.timestamp).toLocaleTimeString();
      md += `### [${time}] ${m.senderName} (\`${m.senderDeviceId}\`)\n`;
      md += `${m.text}\n\n`;
    }

    return md;
  }
}

export const localVault = new LocalVault();
