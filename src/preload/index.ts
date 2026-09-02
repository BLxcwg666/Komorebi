import { contextBridge, ipcRenderer } from 'electron';

function randomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

type RepeatPeer = { chatType: number; peerUid: string; guildId: string };
type RepeatResult = { ok: true } | { ok: false; error: string };
type RepeatPayload =
  | { kind: 'forward' }
  | { kind: 'send'; elements: Record<string, unknown>[] }
  | { kind: 'unsupported' };

const originalIpcSend = ipcRenderer.send.bind(ipcRenderer);

function sendNtApi(webContentId: number, cmdName: string, payload: unknown): void {
  originalIpcSend(
    `RM_IPCFROM_RENDERER${webContentId}`,
    {
      peerId: webContentId,
      callbackId: randomUUID(),
      type: 'request',
      eventName: 'ntApi',
    },
    { cmdName, cmdType: 'ntApi', payload },
  );
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, val) => {
      if (val instanceof Map) return { __map__: [...val.entries()] };
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    },
    2,
  );
}

const recalledMsgIds = new Set<string>();
ipcRenderer.on('Komorebi.antiRecall.recallTip', (_event, id: string) => recalledMsgIds.add(String(id)));
ipcRenderer.on('Komorebi.antiRecall.recallTipList', (_event, ids: string[]) =>
  (Array.isArray(ids) ? ids : []).forEach(id => recalledMsgIds.add(String(id))),
);
void ipcRenderer
  .invoke('Komorebi.repeater.getRecalledIds')
  .then((ids: unknown) => (Array.isArray(ids) ? ids : []).forEach(id => recalledMsgIds.add(String(id))))
  .catch(() => {});

let cachedWebContentId: number | null = null;
async function getWebContentId(): Promise<number> {
  if (cachedWebContentId == null) cachedWebContentId = (await ipcRenderer.invoke('Komorebi.repeater.getWebContentId')) as number;
  return cachedWebContentId;
}

function forwardSingle(webContentId: number, dst: RepeatPeer, msgId: string, src: RepeatPeer): void {
  sendNtApi(webContentId, 'nodeIKernelMsgService/forwardMsgWithComment', [
    { commentElements: [], dstContacts: [dst], msgAttributeInfos: new Map(), msgIds: [msgId], srcContact: src },
    null,
  ]);
}

function sendRestored(webContentId: number, dst: RepeatPeer, elements: Record<string, unknown>[]): void {
  sendNtApi(webContentId, 'nodeIKernelMsgService/sendMsg', [
    { msgId: '0', peer: dst, msgElements: elements, msgAttributeInfos: new Map() },
    null,
  ]);
}

// 单条消息最多能挂 20 个回应，超出服务端直接拒绝
const REACTION_MAX = 20;
const REACTION_INTERVAL_MS = 80;

// NTQQ 可作为回应的系统小黄脸（QSysFace）id 池，emojiType 固定为 '1'
const REACTION_FACE_POOL = [
  '4', '5', '8', '9', '10', '12', '14', '16', '21', '23',
  '24', '25', '26', '27', '28', '29', '30', '32', '33', '34',
  '38', '39', '41', '42', '43', '49', '53', '60', '63', '66',
  '74', '75', '76', '78', '79', '85', '89', '96', '97', '98',
  '99', '100', '101', '102', '103', '104', '106', '109', '111', '116',
  '118', '120', '122', '123', '124', '125', '129', '144', '147', '171',
  '173', '174', '175', '176', '179', '180', '181', '182', '183', '201',
  '203', '212', '214', '219', '222', '227', '232', '240', '243', '246',
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pickRandom<T>(source: readonly T[], count: number): T[] {
  const pool = [...source];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function setReaction(webContentId: number, peer: RepeatPeer, msgSeq: string, emojiId: string, enabled: boolean): void {
  sendNtApi(webContentId, 'nodeIKernelMsgService/setMsgEmojiLikes', [
    { peer, msgSeq, emojiId, emojiType: '1', setEmoji: enabled },
    null,
  ]);
}

let reactionSpamRun = 0;

function interceptSingleForward(payload: unknown): boolean {
  const args = (Array.isArray(payload) ? payload[0] : payload) as
    | { msgIds?: unknown; dstContacts?: unknown; srcContact?: unknown }
    | undefined;
  const msgIds = Array.isArray(args?.msgIds) ? args.msgIds.map(String) : [];
  if (!msgIds.some(id => recalledMsgIds.has(id))) return false;

  const dstContacts = (Array.isArray(args?.dstContacts) ? args.dstContacts : []) as RepeatPeer[];
  const src = args?.srcContact as RepeatPeer;

  void (async () => {
    try {
      const webContentId = await getWebContentId();
      for (const dst of dstContacts) {
        for (const msgId of msgIds) {
          if (recalledMsgIds.has(msgId)) {
            const rp = (await ipcRenderer.invoke('Komorebi.repeater.getRepeatPayload', msgId)) as RepeatPayload;
            if (rp.kind === 'send') {
              sendRestored(webContentId, dst, rp.elements);
              continue;
            }
          }
          forwardSingle(webContentId, dst, msgId, src);
        }
      }
    } catch {
      //
    }
  })();

  return true;
}

(ipcRenderer as unknown as { send: typeof ipcRenderer.send }).send = (channel: string, ...args: unknown[]) => {
  try {
    if (typeof channel === 'string' && channel.startsWith('RM_IPCFROM_RENDERER')) {
      const data = args[1] as { cmdName?: string; payload?: unknown } | undefined;
      const cmdName = String(data?.cmdName ?? '');

      if (cmdName.includes('multiForwardMsgWithComment')) {
        void ipcRenderer.invoke('Komorebi.debug.dumpForward', cmdName, safeStringify(data?.payload)).catch(() => {});
      } else if (cmdName.includes('forwardMsgWithComment')) {
        if (interceptSingleForward(data?.payload as Parameters<typeof interceptSingleForward>[0])) return; // 已接管，阻断原生转发
      }
    }
  } catch {
    //
  }

  return originalIpcSend(channel, ...(args as [unknown, ...unknown[]]));
};

const IPCExports = {
  getConfig: <Config>() => ipcRenderer.invoke('Komorebi.antiRecall.getConfig') as Promise<Config>,
  saveConfig: (config: unknown) => ipcRenderer.invoke('Komorebi.antiRecall.saveConfig', config) as Promise<void>,
  getStorageStats: <Stats>() => ipcRenderer.invoke('Komorebi.antiRecall.getStorageStats') as Promise<Stats>,
  clearStorage: <Stats>() => ipcRenderer.invoke('Komorebi.antiRecall.clearStorage') as Promise<Stats>,
  repatchCss: (callback: () => void) => ipcRenderer.on('Komorebi.antiRecall.repatchCss', callback),
  recallTip: (callback: (_event: unknown, msgId: string) => void) => ipcRenderer.on('Komorebi.antiRecall.recallTip', callback),
  recallTipList: (callback: (_event: unknown, msgIds: string[]) => void) => ipcRenderer.on('Komorebi.antiRecall.recallTipList', callback),
  repeatMessage: async (msgId: string, peer: RepeatPeer): Promise<RepeatResult> => {
    try {
      if (!peer?.peerUid) return { ok: false, error: '没拿到当前会话的 peer 信息' };

      const webContentId = await ipcRenderer.invoke('Komorebi.repeater.getWebContentId') as number;
      const payload = await ipcRenderer.invoke('Komorebi.repeater.getRepeatPayload', msgId) as RepeatPayload;

      if (payload.kind === 'unsupported') {
        return { ok: false, error: '这条撤回消息的内容暂不支持复读' };
      }

      if (payload.kind === 'send') {
        // 撤回消息：服务端那条已变成灰字提示，转发会复读出灰字，所以用缓存的原文重新发一条
        sendNtApi(webContentId, 'nodeIKernelMsgService/sendMsg', [
          {
            msgId: '0',
            peer,
            msgElements: payload.elements,
            msgAttributeInfos: new Map(),
          },
          null,
        ]);

        return { ok: true };
      }

      sendNtApi(webContentId, 'nodeIKernelMsgService/forwardMsgWithComment', [
        {
          commentElements: [],
          dstContacts: [peer],
          msgAttributeInfos: new Map(),
          msgIds: [msgId],
          srcContact: peer,
        },
        null,
      ]);

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  spamReactions: async (msgSeq: string, peer: RepeatPeer, mode: 'once' | 'loop'): Promise<{ ok: true; count: number; stopped?: boolean } | { ok: false; error: string }> => {
    try {
      if (!peer?.peerUid) return { ok: false, error: '没拿到当前会话的 peer 信息' };
      if (!msgSeq) return { ok: false, error: '没拿到这条消息的 msgSeq' };

      const webContentId = await getWebContentId();
      const run = ++reactionSpamRun;
      let count = 0;
      let activeFaces: string[] = [];

      do {
        const faces = pickRandom(REACTION_FACE_POOL, REACTION_MAX);
        activeFaces = [];
        for (const emojiId of faces) {
          if (run !== reactionSpamRun) break;
          setReaction(webContentId, peer, String(msgSeq), emojiId, true);
          activeFaces.push(emojiId);
          count += 1;
          await sleep(REACTION_INTERVAL_MS);
        }

        if (mode === 'once' && run === reactionSpamRun) return { ok: true, count };

        for (const emojiId of activeFaces) {
          setReaction(webContentId, peer, String(msgSeq), emojiId, false);
          await sleep(REACTION_INTERVAL_MS);
        }
        activeFaces = [];
      } while (run === reactionSpamRun);

      return { ok: true, count, stopped: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  stopReactionSpam: (): void => {
    reactionSpamRun += 1;
  },
  dumpRecalledDom: (msgId: string, html: string) =>
    ipcRenderer.invoke('Komorebi.debug.dumpDom', msgId, html) as Promise<{ ok: boolean; path: string }>,
};

try {
  contextBridge.exposeInMainWorld('Komorebi', IPCExports);
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.log('[Komorebi preload] expose error:', detail);
}

export type IPCExports = typeof IPCExports;
