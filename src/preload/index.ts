import { contextBridge, ipcRenderer } from 'electron';

const IPCExports = {
  getConfig: <Config>() => ipcRenderer.invoke('Komorebi.antiRecall.getConfig') as Promise<Config>,
  saveConfig: (config: unknown) => ipcRenderer.invoke('Komorebi.antiRecall.saveConfig', config) as Promise<void>,
  repatchCss: (callback: () => void) => ipcRenderer.on('Komorebi.antiRecall.repatchCss', callback),
  recallTip: (callback: (_event: unknown, msgId: string) => void) => ipcRenderer.on('Komorebi.antiRecall.recallTip', callback),
  recallTipList: (callback: (_event: unknown, msgIds: string[]) => void) => ipcRenderer.on('Komorebi.antiRecall.recallTipList', callback),
};

contextBridge.exposeInMainWorld('Komorebi', IPCExports);

export type IPCExports = typeof IPCExports;
