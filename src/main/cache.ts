import { getConfig } from './config';
import { readPersistedMessage } from './storage';
import { asRecord } from './utils';
import type { StoredMessage } from './types';

export const messageCache: StoredMessage[] = [];
export const recalledCache: StoredMessage[] = [];

export function isRecallTip(rawMsg: unknown): boolean {
  const msg = asRecord(rawMsg);
  const elements = Array.isArray(msg?.elements) ? msg.elements : [];
  const firstElement = asRecord(elements[0]);
  const grayTipElement = asRecord(firstElement?.grayTipElement);
  const revoke = asRecord(grayTipElement?.revokeElement);

  return msg?.msgType === 5 &&
    msg.subMsgType === 4 &&
    revoke != null &&
    (getConfig().isAntiRecallSelfMsg || !revoke.isSelfOperate);
}

export function cacheIncomingMessages(args: unknown[]): void {
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

  const config = getConfig();
  if (config.maxMsgSaveLimit !== -1 && messageCache.length > config.maxMsgSaveLimit) {
    messageCache.splice(0, config.deleteMsgCountPerTime);
  }
}

export async function findCachedMessage(id: string): Promise<StoredMessage | undefined> {
  return recalledCache.find(item => item.id === id) ?? messageCache.find(item => item.id === id) ?? readPersistedMessage(id);
}

export function rememberRecalled(record: StoredMessage): void {
  if (recalledCache.some(item => item.id === record.id)) return;
  recalledCache.push(record);
}
