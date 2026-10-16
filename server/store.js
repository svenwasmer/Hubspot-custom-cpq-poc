import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Minimal JSON-file store; fine for a single-user local POC.
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
    list: load,
    async get(id) {
      return (await load()).find((r) => r.id === id) ?? null;
    },
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
