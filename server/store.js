/**
 * Minimal JSON-file store for quote records (`data/quotes.json`).
 *
 * Good enough for a single-user local POC: no locking, and the whole file is
 * rewritten on every change. In a real integration, the CPQ system's own
 * database would hold the page id, URL and password instead.
 *
 * The file contains page passwords, so it is gitignored.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @typedef {import('./quote.js').Quote & {
 *   id: string,        // local record id (UUID)
 *   pageId: string,    // HubSpot landing page id
 *   url: string,       // public page URL
 *   password: string,  // page password
 *   expiresAt: string, // ISO date-time
 *   createdAt: string, // ISO date-time
 * }} QuoteRecord
 */

/**
 * @param {string} filePath Path of the JSON file; created on first save.
 */
export function createStore(filePath) {
  async function load() {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async function persist(records) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(records, null, 2));
  }

  return {
    /** @returns {Promise<QuoteRecord[]>} Newest first. */
    list: load,
    /** @returns {Promise<QuoteRecord|null>} */
    async get(id) {
      return (await load()).find((r) => r.id === id) ?? null;
    },
    /** Inserts or replaces a record (by `id`) at the top of the list. */
    async save(record) {
      const records = (await load()).filter((r) => r.id !== record.id);
      records.unshift(record);
      await persist(records);
      return record;
    },
    async remove(id) {
      await persist((await load()).filter((r) => r.id !== id));
    },
  };
}
