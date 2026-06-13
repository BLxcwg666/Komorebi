import { BrowserWindow, dialog, ipcMain } from 'electron';
import { broadcast, patchWindow } from './anti-recall';
import { recalledCache } from './cache';
import { getConfig, setConfig } from './config';
import { getRepeatPayload } from './repeater';
import { clearPersistedMessages, dumpDom, dumpForward, getStorageStats } from './storage';
import { setupUpdateBlocker } from './update-blocker';
import type { AntiRecallConfig } from './types';

setupUpdateBlocker();

ipcMain.handle('Komorebi.antiRecall.getConfig', () => getConfig());

ipcMain.handle('Komorebi.antiRecall.saveConfig', (_event, nextConfig: AntiRecallConfig) => {
  setConfig(nextConfig);
  broadcast('Komorebi.antiRecall.repatchCss');
});

ipcMain.handle('Komorebi.antiRecall.getStorageStats', () => getStorageStats());

ipcMain.handle('Komorebi.repeater.getWebContentId', event => event.sender.id);

ipcMain.handle('Komorebi.repeater.getRepeatPayload', async (_event, msgId: string) => getRepeatPayload(String(msgId)));

ipcMain.handle('Komorebi.repeater.getRecalledIds', () => recalledCache.map(item => String(item.id)));

ipcMain.handle('Komorebi.debug.dumpDom', (_event, msgId: string, html: string) => dumpDom(String(msgId), String(html ?? '')));

ipcMain.handle('Komorebi.debug.dumpForward', (_event, cmdName: string, json: string) => dumpForward(String(cmdName), String(json ?? '')));

ipcMain.handle('Komorebi.antiRecall.clearStorage', async () => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: '清空防撤回存档',
    message: '清空后，已持久化保存的撤回消息无法恢复。确定继续吗？',
    buttons: ['确定', '取消'],
    cancelId: 1,
  });

  if (result.response !== 0) return getStorageStats();

  clearPersistedMessages();
  recalledCache.length = 0;

  return getStorageStats();
});

export const onBrowserWindowCreated = (window: BrowserWindow) => {
  window.webContents.on('did-stop-loading', () => patchWindow(window));
};
