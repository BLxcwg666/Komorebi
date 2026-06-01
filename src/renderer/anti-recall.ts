import { getCurrentConfig, refreshConfig } from './config';
import { showRepeatToast } from './toast';

let recalledIds: string[] = [];
const dumpedDomIds = new Set<string>();
let dumpToastShown = false;

export async function applyRecalledIds(ids: string[]): Promise<void> {
  recalledIds = (ids ?? []).map(String);
  await markRecalledInView();
}

export async function markRecalledInView(): Promise<void> {
  const nodes = document.querySelector('.chat-msg-area__vlist')?.querySelectorAll<HTMLElement>('.ml-item');
  if (!nodes) return;

  await refreshConfig();

  for (const item of nodes) {
    if (item.id && recalledIds.includes(item.id)) markRecalledItem(item.id, item);
  }
}

export async function markRecalledById(msgId: string): Promise<void> {
  await refreshConfig();
  markRecalledItem(msgId, document.querySelector<HTMLElement>(`.ml-item[id='${msgId}']`) ?? undefined);
}

function markRecalledItem(msgId: string, item?: HTMLElement): void {
  const container =
    document.getElementById(`${msgId}-msgContainerMsgContent`) ??
    document.getElementById(`${msgId}-msgContent`)?.parentElement ??
    document.getElementById(`ml-${msgId}`)?.querySelector<HTMLElement>('.msg-content-container')?.parentElement ??
    document.getElementById(`ark-msg-content-container_${msgId}`)?.parentElement ??
    item?.querySelector<HTMLElement>('.msg-content-container') ??
    item?.querySelector<HTMLElement>('.file-message--content');

  const picElement = container == null
    ? null
    : Array.from(container.querySelectorAll<HTMLElement>('.pic-element')).find(el => !el.closest('.reply-element')) ?? null;
  const hasImage = picElement != null;

  if (!container || container.classList.contains('gray-tip-message')) return;
  if (container.querySelector('.komorebi-recalled-tip')) return;

  void maybeDumpRecalledDom(msgId, item ?? container.closest<HTMLElement>('.ml-item'));

  container.classList.add('komorebi-recalled-parent');
  container.classList.toggle('komorebi-recalled-text', !hasImage);
  applyFrameRadius(container, picElement);

  if (!getCurrentConfig().enableTip) return;

  const tip = document.createElement('div');
  tip.textContent = '已撤回';
  tip.className = 'komorebi-recalled-tip';
  container.appendChild(tip);
}

function applyFrameRadius(container: HTMLElement, picElement: HTMLElement | null): void {
  container.style.removeProperty('--komorebi-frame-radius');
  if (!picElement || container.querySelector('.text-element')) return;

  const radius = roundedRadiusOf(picElement) ?? roundedRadiusOf(picElement.querySelector<HTMLElement>('img'));
  if (radius) container.style.setProperty('--komorebi-frame-radius', radius);
}

function roundedRadiusOf(element: HTMLElement | null): string | undefined {
  if (!element) return undefined;
  const radius = getComputedStyle(element).borderRadius;
  return radius && Number.parseFloat(radius) > 0 ? radius : undefined;
}

async function maybeDumpRecalledDom(msgId: string, item?: HTMLElement | null): Promise<void> {
  if (!getCurrentConfig().enableDomDump || !item || dumpedDomIds.has(msgId)) return;
  dumpedDomIds.add(msgId);

  const result = await window.Komorebi.dumpRecalledDom(msgId, item.outerHTML);
  if (result.ok && !dumpToastShown) {
    dumpToastShown = true;
    showRepeatToast(`已导出撤回结构到：${result.path}`);
  }
}
