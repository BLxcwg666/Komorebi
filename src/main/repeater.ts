import { recalledCache } from './cache';
import { findExistingImagePath, readPersistedMessage } from './storage';
import { asRecord } from './utils';
import type { QQPayloadWrapper, RepeatPayload } from './types';

export async function getRepeatPayload(msgId: string): Promise<RepeatPayload> {
  const recalled = recalledCache.find(item => item.id === msgId) ?? readPersistedMessage(msgId);
  if (!recalled?.msg || typeof recalled.msg !== 'object') return { kind: 'forward' };

  const rawElements = Array.isArray(recalled.msg.elements) ? recalled.msg.elements : [];
  const elements = buildRepeatElements(rawElements);
  if (elements.length === 0) return { kind: 'unsupported' };

  return { kind: 'send', elements };
}

function buildRepeatElements(rawElements: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];

  for (const raw of rawElements) {
    const element = asRecord(raw);
    if (!element) continue;

    const type = Number(element.elementType ?? 0);

    if (type === 1) {
      const text = asRecord(element.textElement);
      if (!text) continue;
      out.push({
        elementType: 1,
        elementId: '',
        textElement: {
          content: text.content ?? '',
          atType: text.atType ?? 0,
          atUid: text.atUid ?? '0',
          atTinyId: text.atTinyId ?? '0',
          atNtUid: text.atNtUid ?? '',
        },
      });
    } else if (type === 2) {
      const pic = asRecord(element.picElement);
      const file = pic ? findExistingImagePath(pic) : undefined;
      if (!pic || !file) continue;
      out.push({ elementType: 2, elementId: '', picElement: { ...pic, sourcePath: file } });
    } else if (type === 6) {
      const clone = cloneElement(element);
      if (clone) out.push(clone);
    } else if (type === 7) {
      // 回复引用：复读时不再带上原引用，跳过
      continue;
    } else {
      const clone = cloneElement(element);
      if (clone) out.push(clone);
    }
  }

  return out;
}

function cloneElement(element: QQPayloadWrapper): Record<string, unknown> | null {
  try {
    const clone = JSON.parse(JSON.stringify(element)) as Record<string, unknown>;
    clone.elementId = '';
    return clone;
  } catch {
    return null;
  }
}
