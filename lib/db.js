// lib/db.js
//
// Real SQLite now (via Node's built-in node:sqlite — experimental but
// included in Node core, so no native compilation, no extra dependency).
// Each "collection" is a table with (id TEXT PRIMARY KEY, json TEXT).
// Writes are single-row SQL operations instead of rewriting an entire JSON
// file, which is the actual problem this migration fixes: the old approach
// serialized the WHOLE collection on every single insert/update/remove.
//
// The collection() API is kept identical to the old JSON-file version on
// purpose, so nothing else in the app had to change.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'trend.sqlite'));
db.exec('PRAGMA journal_mode = WAL;'); // real crash-safe writes, concurrent reads

const ensured = new Set();
function ensureTable(name) {
  if (ensured.has(name)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, json TEXT NOT NULL)`);
  ensured.add(name);
}

let nextId = Date.now();
export function newId() {
  nextId += 1;
  return String(nextId);
}

/** @param {string} name - collection name, e.g. 'users' */
export function collection(name) {
  ensureTable(name);
  const selectAll = db.prepare(`SELECT json FROM ${name}`);
  const insertRow = db.prepare(`INSERT INTO ${name} (id, json) VALUES (?, ?)`);
  const updateRow = db.prepare(`UPDATE ${name} SET json = ? WHERE id = ?`);
  const deleteRow = db.prepare(`DELETE FROM ${name} WHERE id = ?`);

  function allRows() {
    return selectAll.all().map((r) => JSON.parse(r.json));
  }

  return {
    all: () => allRows(),
    find: (pred) => allRows().find(pred),
    filter: (pred) => allRows().filter(pred),
    insert: (row) => {
      insertRow.run(String(row.id), JSON.stringify(row));
      return row;
    },
    update: (pred, patch) => {
      const row = allRows().find(pred);
      if (!row) return null;
      Object.assign(row, patch);
      updateRow.run(JSON.stringify(row), String(row.id));
      return row;
    },
    upsert: (pred, row) => {
      const existing = allRows().find(pred);
      if (!existing) {
        insertRow.run(String(row.id), JSON.stringify(row));
      } else {
        const merged = { ...existing, ...row };
        updateRow.run(JSON.stringify(merged), String(merged.id));
      }
      return row;
    },
    remove: (pred) => {
      const row = allRows().find(pred);
      if (!row) return false;
      deleteRow.run(String(row.id));
      return true;
    }
  };
}
