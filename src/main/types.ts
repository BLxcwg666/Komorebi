export interface AntiRecallConfig {
  mainColor: string;
  borderWidth: number;
  saveDb: boolean;
  blockQQNTUpdate: boolean;
  enableMessageAnimation: boolean;
  enableShadow: boolean;
  enableTip: boolean;
  isAntiRecallSelfMsg: boolean;
  maxMsgSaveLimit: number;
  deleteMsgCountPerTime: number;
  enableDomDump: boolean;
  reactionSpamMode: 'once' | 'loop';
}

export interface StoredMessage {
  id: string;
  sender?: string;
  msg: Record<string, unknown>;
}

export interface StorageStats {
  enabled: boolean;
  count: number;
  size: number;
  path: string;
}

export type RepeatPayload =
  | { kind: 'forward' }
  | { kind: 'send'; elements: Record<string, unknown>[] }
  | { kind: 'unsupported' };

export type QQMessage = Record<string, unknown>;
export type QQPayloadWrapper = Record<string, unknown>;

export type SqliteRow = { id: string; sender: string | null; msg_json: string };
export type SqliteCountRow = { count: number };
export type SqliteStatement = {
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};
export type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

export type PatchedWebContents = Electron.WebContents & {
  __komorebiAntiRecallPatched?: boolean;
  __qqntim_original_object?: {
    send?: (channel: string, ...args: unknown[]) => unknown;
  };
};
