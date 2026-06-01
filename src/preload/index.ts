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

function sendNtApi(webContentId: number, cmdName: string, payload: unknown): void {
  ipcRenderer.send(
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
