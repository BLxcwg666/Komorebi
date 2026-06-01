import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { dataDir, dbFilePath, debugDir, getConfig, imageDir } from './config';
import { asRecord, cloneStoredMessage, isPlainObject, log } from './utils';
import type {
  QQMessage,
  QQPayloadWrapper,
  SqliteCountRow,
  SqliteDatabase,
  SqliteRow,
  StorageStats,
  StoredMessage,
} from './types';

const require = createRequire(import.meta.url);
let sqliteDb: SqliteDatabase | null | undefined;

export function readPersistedMessage(id: string): StoredMessage | undefined {
  if (!getConfig().saveDb) return undefined;
  const db = getSqliteDb();
  if (!db) return undefined;

  const row = db.prepare('SELECT id, sender, msg_json FROM recalled_messages WHERE id = ?').get(id) as SqliteRow | undefined;
  if (!row) return undefined;

  try {
    return hydratePersistedMessage({ id: row.id, sender: row.sender ?? undefined, msg: JSON.parse(row.msg_json) as QQMessage });
  } catch (error) {
    log('Failed to read persisted message:', error);
    return undefined;
  }
}

export function savePersistedMessage(record: StoredMessage): void {
  if (!getConfig().saveDb) return;
  const db = getSqliteDb();
  if (!db) return;

  const persisted = persistMessageAssets(record);
  db.prepare('INSERT OR IGNORE INTO recalled_messages (id, sender, msg_json) VALUES (?, ?, ?)')
    .run(persisted.id, persisted.sender ?? null, JSON.stringify(persisted.msg));
}

export function clearPersistedMessages(): void {
  const db = getSqliteDb();
  if (!db) return;

  db.prepare('DELETE FROM recalled_messages').run();
}

export function getStorageStats(): StorageStats {
  const db = getSqliteDb();

  let size = 0;
  try {
    size = fs.statSync(dbFilePath).size;
  } catch {
    size = 0;
  }

  return {
    enabled: getConfig().saveDb,
    count: (db?.prepare('SELECT COUNT(*) AS count FROM recalled_messages').get() as SqliteCountRow | undefined)?.count ?? 0,
    size,
    path: dbFilePath,
  };
}

export function findExistingImagePath(picElement: QQPayloadWrapper): string | undefined {
  return collectImagePathCandidates(picElement).find(candidate => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

export function dumpDom(msgId: string, html: string): { ok: boolean; path: string } {
  try {
    fs.mkdirSync(debugDir, { recursive: true });
    const safeId = msgId.replace(/[^\w-]/g, '_') || 'unknown';
    const filePath = path.join(debugDir, `${safeId}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    log('Dumped recalled DOM:', filePath);
    return { ok: true, path: debugDir };
  } catch (error) {
    log('Failed to dump recalled DOM:', error);
    return { ok: false, path: debugDir };
  }
}

function getSqliteDb(): SqliteDatabase | undefined {
  if (sqliteDb !== undefined) return sqliteDb ?? undefined;

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase };
    sqliteDb = new DatabaseSync(dbFilePath);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS recalled_messages (
        id TEXT PRIMARY KEY,
        sender TEXT,
        msg_json TEXT NOT NULL
      );
    `);
  } catch (error) {
    sqliteDb = null;
    log('Failed to open sqlite storage:', error);
  }

  return sqliteDb ?? undefined;
}

function persistMessageAssets(record: StoredMessage): StoredMessage {
  const cloned = cloneStoredMessage(record);
  const elements = Array.isArray(cloned.msg.elements) ? cloned.msg.elements : [];
  const originalElements = Array.isArray(record.msg.elements) ? record.msg.elements : [];

  for (let index = 0; index < elements.length; index++) {
    const element = asRecord(elements[index]);
    const picElement = asRecord(element?.picElement);
    const originalElement = asRecord(originalElements[index]);
    const originalPicElement = asRecord(originalElement?.picElement);
    if (!picElement) continue;

    const sourcePath = findExistingImagePath(originalPicElement ?? picElement);
    if (!sourcePath) continue;

    const ext = path.extname(sourcePath) || '.jpg';
    const imagePath = path.join(imageDir, `${record.id}-${index}${ext}`);

    try {
      fs.mkdirSync(imageDir, { recursive: true });
      if (!fs.existsSync(imagePath)) fs.copyFileSync(sourcePath, imagePath);

      picElement.sourcePath = imagePath;
      picElement.__komorebiSavedPath = imagePath;
      picElement.thumbPath = { 0: imagePath, 198: imagePath, 720: imagePath };
    } catch (error) {
      log('Failed to persist recalled image:', error);
    }
  }

  return cloned;
}

function hydratePersistedMessage(record: StoredMessage): StoredMessage {
  const cloned = cloneStoredMessage(record);
  const elements = Array.isArray(cloned.msg.elements) ? cloned.msg.elements : [];

  for (const rawElement of elements) {
    const element = asRecord(rawElement);
    const picElement = asRecord(element?.picElement);
    const savedPath = typeof picElement?.__komorebiSavedPath === 'string' ? picElement.__komorebiSavedPath : undefined;
    if (!picElement || !savedPath || !fs.existsSync(savedPath)) continue;

    picElement.sourcePath = savedPath;
    picElement.thumbPath = new Map<number, string>([
      [0, savedPath],
      [198, savedPath],
      [720, savedPath],
    ]);
  }

  return cloned;
}

function collectImagePathCandidates(picElement: QQPayloadWrapper): string[] {
  const candidates = new Set<string>();

  if (typeof picElement.sourcePath === 'string') candidates.add(picElement.sourcePath);
  collectThumbPathCandidates(picElement.thumbPath, candidates);

  return [...candidates];
}

function collectThumbPathCandidates(value: unknown, candidates: Set<string>): void {
  if (typeof value === 'string') {
    candidates.add(value);
    return;
  }

  if (value instanceof Map) {
    for (const item of value.values()) {
      if (typeof item === 'string') candidates.add(item);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectThumbPathCandidates(item, candidates);
    return;
  }

  if (isPlainObject(value)) {
    for (const item of Object.values(value)) collectThumbPathCandidates(item, candidates);
  }
}
