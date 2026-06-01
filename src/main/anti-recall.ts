import { BrowserWindow } from 'electron';
import { cacheIncomingMessages, findCachedMessage, isRecallTip, recalledCache, rememberRecalled } from './cache';
import { savePersistedMessage } from './storage';
import { asRecord, isPlainObject, log } from './utils';
import type { PatchedWebContents, QQMessage } from './types';

const patchedWindows = new Set<BrowserWindow>();

export function patchWindow(window: BrowserWindow): void {
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

export function broadcast(channel: string): void {
  for (const window of patchedWindows) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel);
  }
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
