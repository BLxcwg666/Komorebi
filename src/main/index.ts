import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';

interface AntiRecallConfig {
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
}

interface StoredMessage {
  id: string;
  sender?: string;
  msg: Record<string, unknown>;
}

type QQMessage = Record<string, unknown>;
type QQPayloadWrapper = Record<string, unknown>;
type PatchedWebContents = Electron.WebContents & {
  __komorebiAntiRecallPatched?: boolean;
  __qqntim_original_object?: {
    send?: (channel: string, ...args: unknown[]) => unknown;
  };
};

const PLUGIN_SLUG = 'Komorebi';
const QQNT_UPDATE_BLOCK_FILTER = { urls: ['*://*/*'] };

const DEFAULT_CONFIG: AntiRecallConfig = {
  mainColor: '#ff6d6d',
  borderWidth: 2,
  saveDb: false,
  blockQQNTUpdate: true,
  enableMessageAnimation: true,
  enableShadow: true,
  enableTip: true,
  isAntiRecallSelfMsg: false,
  maxMsgSaveLimit: 10000,
  deleteMsgCountPerTime: 500,
};

const dataDir = path.join(LiteLoader.path.data, PLUGIN_SLUG);
const imageDir = path.join(dataDir, 'images');
const dbFilePath = path.join(dataDir, 'recalled-messages.json');

let config: AntiRecallConfig = loadConfig();
let persistedMessages: Record<string, StoredMessage> | null = null;
const messageCache: StoredMessage[] = [];
const recalledCache: StoredMessage[] = [];
const patchedWindows = new Set<BrowserWindow>();
let updateBlockerRegistered = false;

if (app.isReady()) registerQQNTUpdateBlocker();
else app.once('ready', registerQQNTUpdateBlocker);

ipcMain.handle('Komorebi.antiRecall.getConfig', () => config);

ipcMain.handle('Komorebi.antiRecall.saveConfig', (_event, nextConfig: AntiRecallConfig) => {
  config = normalizeConfig(nextConfig);
  LiteLoader.api.config.set(PLUGIN_SLUG, config);
  broadcast('Komorebi.antiRecall.repatchCss');
});

ipcMain.handle('Komorebi.antiRecall.getStorageStats', () => getStorageStats());

ipcMain.handle('Komorebi.antiRecall.clearStorage', async () => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: '清空防撤回存档',
    message: '清空后，已持久化保存的撤回消息无法恢复。确定继续吗？',
    buttons: ['确定', '取消'],
    cancelId: 1,
  });

  if (result.response !== 0) return getStorageStats();

  persistedMessages = {};
  flushPersistedMessages();
  recalledCache.length = 0;

  return getStorageStats();
});

export const onBrowserWindowCreated = (window: BrowserWindow) => {
  window.webContents.on('did-stop-loading', () => patchWindow(window));
};

function patchWindow(window: BrowserWindow): void {
  if (!window?.webContents || window.isDestroyed()) return;

  const url = window.webContents.getURL();
  if (!url.includes('#/main/message') && !url.includes('#/chat')) return;

  const webContents = window.webContents as PatchedWebContents;
  if (webContents.__komorebiAntiRecallPatched) return;
  webContents.__komorebiAntiRecallPatched = true;
  patchedWindows.add(window);

  const originalSend = webContents.__qqntim_original_object?.send ?? webContents.send.bind(webContents);

  const patchedSend = async (channel: string, ...args: unknown[]) => {
    try {
      if (args.length >= 2) {
        await recoverRecalledMessagesInList(webContents, args);
        await interceptRealtimeRecall(webContents, args);
        cacheIncomingMessages(args);
      }
    } catch (error) {
      log('Anti-recall patch failed:', error);
    }

    return originalSend(channel, ...args);
  };

  if (webContents.__qqntim_original_object) webContents.__qqntim_original_object.send = patchedSend;
  else webContents.send = patchedSend;

  log('Patched chat window:', url);
}

async function recoverRecalledMessagesInList(webContents: Electron.WebContents, args: unknown[]): Promise<void> {
  const payload = asRecord(args[1]);
  if (!Array.isArray(payload?.msgList) || payload.msgList.length === 0) return;

  let peerUid = '';
  const recalledIndexes: number[] = [];

  for (const index in payload.msgList) {
    const msg = asRecord(payload.msgList[index]);
    peerUid = String(msg?.peerUid ?? '');

    if (isRecallTip(msg)) {
      recalledIndexes.push(Number(index));
    }
  }

  if (recalledIndexes.length === 0) return;
  recalledIndexes.sort((a, b) => b - a);

  for (const index of recalledIndexes) {
    const recallTip = asRecord(payload.msgList[index]);
    if (!recallTip) continue;

    const record = await findCachedMessage(String(recallTip.msgId));
    if (!record?.msg || typeof record.msg !== 'object') continue;

    rememberRecalled(record);
    const recovered = { ...record.msg, isOnlineMsg: true };
    mergeRecoveredMessage(recallTip, recovered);
  }

  webContents.send(
    'Komorebi.antiRecall.recallTipList',
    recalledCache.filter(item => item.sender === peerUid || item.sender == null).map(item => item.id),
  );
}

async function interceptRealtimeRecall(webContents: Electron.WebContents, args: unknown[]): Promise<void> {
  const wrapper = asRecord(args[1]);
  const cmdName = String(wrapper?.cmdName ?? '');
  const payload = asRecord(wrapper?.payload);
  if (!wrapper || !cmdName || !payload) return;

  const isRecallUpdate =
    (cmdName.includes('onMsgInfoListUpdate') || cmdName.includes('onActiveMsgInfoUpdate')) &&
    Array.isArray(payload.msgList) &&
    isRecallTip(payload.msgList[0]);

  if (!isRecallUpdate) return;

  const recallMsg = asRecord(payload.msgList[0]);
  if (!recallMsg) return;
  const msgId = String(recallMsg.msgId);
  const record = await findCachedMessage(msgId);

  if (record) {
    rememberRecalled(record);
    savePersistedMessage(record);
  }

  webContents.send('Komorebi.antiRecall.recallTip', msgId);
  wrapper.cmdName = 'none';
  payload.msgList.pop();
  log('Intercepted recall:', msgId);
}

function cacheIncomingMessages(args: unknown[]): void {
  const wrapper = asRecord(args[1]);
  const cmdName = String(wrapper?.cmdName ?? '');
  const payload = asRecord(wrapper?.payload);
  if (!wrapper || !cmdName || !payload) return;

  const shouldCache =
    ((cmdName.includes('onRecvMsg') || cmdName.includes('onRecvActiveMsg')) && Array.isArray(payload.msgList)) ||
    (cmdName.includes('onAddSendMsg') && payload.msgRecord != null) ||
    (cmdName.includes('onMsgInfoListUpdate') && Array.isArray(payload.msgList));

  if (!shouldCache) return;

  const list = Array.isArray(payload.msgList) ? payload.msgList : [payload.msgRecord];

  for (const rawMsg of list) {
    const msg = asRecord(rawMsg);
    if (!msg?.msgId || isRecallTip(msg)) continue;

    const msgId = String(msg.msgId);
    let index = messageCache.findIndex(item => item.id === msgId);
    if (index === -1) {
      messageCache.push({ id: msgId, sender: msg.peerUid, msg });
      index = messageCache.length - 1;
    }

    messageCache[index] = { id: msgId, sender: String(msg.peerUid ?? ''), msg };
  }

  if (config.maxMsgSaveLimit !== -1 && messageCache.length > config.maxMsgSaveLimit) {
    messageCache.splice(0, config.deleteMsgCountPerTime);
  }
}

function isRecallTip(rawMsg: unknown): boolean {
  const msg = asRecord(rawMsg);
  const elements = Array.isArray(msg?.elements) ? msg.elements : [];
  const firstElement = asRecord(elements[0]);
  const grayTipElement = asRecord(firstElement?.grayTipElement);
  const revoke = asRecord(grayTipElement?.revokeElement);

  return msg?.msgType === 5 &&
    msg.subMsgType === 4 &&
    revoke != null &&
    (config.isAntiRecallSelfMsg || !revoke.isSelfOperate);
}

async function findCachedMessage(id: string): Promise<StoredMessage | undefined> {
  return recalledCache.find(item => item.id === id) ?? messageCache.find(item => item.id === id) ?? readPersistedMessage(id);
}

function rememberRecalled(record: StoredMessage): void {
  if (recalledCache.some(item => item.id === record.id)) return;
  recalledCache.push(record);
}

function readPersistedMessage(id: string): StoredMessage | undefined {
  if (!config.saveDb) return undefined;
  ensurePersistedMessagesLoaded();
  const record = persistedMessages?.[id];
  return record ? hydratePersistedMessage(record) : undefined;
}

function savePersistedMessage(record: StoredMessage): void {
  if (!config.saveDb) return;
  ensurePersistedMessagesLoaded();
  if (!persistedMessages || persistedMessages[record.id]) return;

  persistedMessages[record.id] = persistMessageAssets(record);
  flushPersistedMessages();
}

function ensurePersistedMessagesLoaded(): void {
  if (persistedMessages !== null) return;

  try {
    persistedMessages = JSON.parse(fs.readFileSync(dbFilePath, 'utf-8')) as Record<string, StoredMessage>;
  } catch {
    persistedMessages = {};
  }
}

function flushPersistedMessages(): void {
  if (!persistedMessages) return;

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbFilePath, JSON.stringify(persistedMessages), 'utf-8');
}

function getStorageStats(): { enabled: boolean; count: number; size: number; path: string } {
  ensurePersistedMessagesLoaded();

  let size = 0;
  try {
    size = fs.statSync(dbFilePath).size;
  } catch {
    size = 0;
  }

  return {
    enabled: config.saveDb,
    count: Object.keys(persistedMessages ?? {}).length,
    size,
    path: dbFilePath,
  };
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

function findExistingImagePath(picElement: QQPayloadWrapper): string | undefined {
  return collectImagePathCandidates(picElement).find(candidate => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
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

function cloneStoredMessage(record: StoredMessage): StoredMessage {
  return JSON.parse(JSON.stringify(record)) as StoredMessage;
}

function mergeRecoveredMessage(target: QQMessage, recovered: QQMessage): void {
  for (const key in recovered) {
    if (['msgSeq', 'cntSeq', 'clientSeq', 'sendStatus', 'emojiLikesList'].includes(key)) continue;

    const nextValue = recovered[key];
    const oldValue = target[key];

    if (['msgAttrs', 'msgMeta', 'generalFlags'].includes(key) && isPlainObject(nextValue) && isPlainObject(oldValue)) {
      for (const oldKey in oldValue) {
        if (Object.prototype.hasOwnProperty.call(oldValue, oldKey)) delete oldValue[oldKey];
      }

      target[key] = Object.assign(oldValue, nextValue);
      continue;
    }

    target[key] = nextValue;
  }
}

function loadConfig(): AntiRecallConfig {
  return normalizeConfig(LiteLoader.api.config.get<Partial<AntiRecallConfig>>(PLUGIN_SLUG, DEFAULT_CONFIG));
}

function normalizeConfig(nextConfig: Partial<AntiRecallConfig> | null | undefined): AntiRecallConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(nextConfig ?? {}),
    saveDb: nextConfig?.saveDb === true,
    blockQQNTUpdate: nextConfig?.blockQQNTUpdate !== false,
    borderWidth: normalizeBorderWidth(nextConfig?.borderWidth),
    maxMsgSaveLimit: normalizeLimit(nextConfig?.maxMsgSaveLimit, DEFAULT_CONFIG.maxMsgSaveLimit),
    deleteMsgCountPerTime: normalizeLimit(nextConfig?.deleteMsgCountPerTime, DEFAULT_CONFIG.deleteMsgCountPerTime),
  };
}

function registerQQNTUpdateBlocker(): void {
  if (updateBlockerRegistered) return;
  updateBlockerRegistered = true;

  session.defaultSession.webRequest.onBeforeRequest(QQNT_UPDATE_BLOCK_FILTER, (details, callback) => {
    const cancel = config.blockQQNTUpdate && isQQNTUpdateRequest(details.url);
    if (cancel) log('Blocked QQNT update request:', details.url);
    callback({ cancel });
  });
}

function isQQNTUpdateRequest(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const target = `${host}${parsed.pathname}${parsed.search}`.toLowerCase();
  const isQQOrTencentHost = host.includes('qq.com') || host.includes('gtimg.cn') || host.includes('tencent.com');
  if (!isQQOrTencentHost) return false;

  const isKnownUpdateHost = [
    'qqpatch',
    'update',
    'upgrade',
    'hotupdate',
    'rdelivery',
    'configsvr',
  ].some(keyword => host.includes(keyword));

  const hasUpdateKeyword = [
    'update',
    'upgrade',
    'patch',
    'hotupdate',
    'version',
    'verlist',
    'checkupdate',
    'newest',
  ].some(keyword => target.includes(keyword));

  const isQQNTTarget = target.includes('qqnt') || target.includes('ntqq') || target.includes('/qq/nt') || target.includes('qq_');

  return (
    isQQNTTarget && hasUpdateKeyword
  ) || (
    isKnownUpdateHost && hasUpdateKeyword && (target.includes('qq') || target.includes('nt'))
  ) || (
    host.includes('dldir1.qq.com') && target.includes('/qqfile/qq/') && isQQNTTarget
  );
}

function normalizeBorderWidth(value: number | undefined): number {
  const width = Number(value ?? DEFAULT_CONFIG.borderWidth);
  if (!Number.isFinite(width)) return DEFAULT_CONFIG.borderWidth;
  return Math.min(8, Math.max(0.5, width));
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  const limit = Number(value ?? fallback);
  if (limit === -1) return -1;
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, limit);
}

function broadcast(channel: string): void {
  for (const window of patchedWindows) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function asRecord(value: unknown): QQPayloadWrapper | undefined {
  return isPlainObject(value) ? value : undefined;
}

function log(...args: unknown[]): void {
  console.log('\x1b[32m%s\x1b[0m', 'Komorebi Anti-Recall:', ...args);
}
