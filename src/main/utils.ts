import type { QQPayloadWrapper, StoredMessage } from './types';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function asRecord(value: unknown): QQPayloadWrapper | undefined {
  return isPlainObject(value) ? value : undefined;
}

export function cloneStoredMessage(record: StoredMessage): StoredMessage {
  return JSON.parse(JSON.stringify(record)) as StoredMessage;
}

export function log(...args: unknown[]): void {
  console.log('\x1b[32m%s\x1b[0m', 'Komorebi Anti-Recall:', ...args);
}
