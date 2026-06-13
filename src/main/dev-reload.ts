import { BrowserWindow } from 'electron';
import { existsSync, watch } from 'fs';
import { resolve } from 'path';

const DIST_ROOT = resolve(__dirname, '..');
const SENTINEL = resolve(DIST_ROOT, '.dev');

const WATCH_TARGETS = [
  resolve(DIST_ROOT, 'renderer'),
  resolve(DIST_ROOT, 'preload'),
];

export const setupDevReload = (): void => {
  if (!existsSync(SENTINEL)) return;

  let timer: NodeJS.Timeout | null = null;
  const reloadAll = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        win.webContents.reloadIgnoringCache();
      }
      console.log('[Komorebi] dev reload triggered');
    }, 150);
  };

  for (const dir of WATCH_TARGETS) {
    if (!existsSync(dir)) continue;
    watch(dir, { recursive: true }, reloadAll);
  }

  console.log('[Komorebi] dev reload watching', WATCH_TARGETS);
};
