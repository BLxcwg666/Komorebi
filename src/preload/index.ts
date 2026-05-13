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

const IPCExports = {
  getConfig: <Config>() => ipcRenderer.invoke('Komorebi.antiRecall.getConfig') as Promise<Config>,
  saveConfig: (config: unknown) => ipcRenderer.invoke('Komorebi.antiRecall.saveConfig', config) as Promise<void>,
  getStorageStats: <Stats>() => ipcRenderer.invoke('Komorebi.antiRecall.getStorageStats') as Promise<Stats>,
  clearStorage: <Stats>() => ipcRenderer.invoke('Komorebi.antiRecall.clearStorage') as Promise<Stats>,
  repatchCss: (callback: () => void) => ipcRenderer.on('Komorebi.antiRecall.repatchCss', callback),
  recallTip: (callback: (_event: unknown, msgId: string) => void) => ipcRenderer.on('Komorebi.antiRecall.recallTip', callback),
  recallTipList: (callback: (_event: unknown, msgIds: string[]) => void) => ipcRenderer.on('Komorebi.antiRecall.recallTipList', callback),
  repeatMessage: async (msgId: string): Promise<RepeatResult> => {
    try {
      const peer = await ipcRenderer.invoke('Komorebi.repeater.getPeer', msgId) as RepeatPeer | null;
      if (!peer) return { ok: false, error: '消息缓存里没找到这条，可能是历史消息或被插件遗漏了' };

      const webContentId = await ipcRenderer.invoke('Komorebi.repeater.getWebContentId') as number;

      ipcRenderer.send(
        `RM_IPCFROM_RENDERER${webContentId}`,
        {
          peerId: webContentId,
          callbackId: randomUUID(),
          type: 'request',
          eventName: 'ntApi',
        },
        {
          cmdName: 'nodeIKernelMsgService/forwardMsgWithComment',
          cmdType: 'ntApi',
          payload: [
            {
              commentElements: [],
              dstContacts: [peer],
              msgAttributeInfos: new Map(),
              msgIds: [msgId],
              srcContact: peer,
            },
            null,
          ],
        },
      );

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

try {
  contextBridge.exposeInMainWorld('Komorebi', IPCExports);
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.log('[Komorebi preload] expose error:', detail);
}

export type IPCExports = typeof IPCExports;
