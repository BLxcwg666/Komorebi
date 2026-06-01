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

  // 判定这条消息「自己是否带图片」(.pic-element)，只用来决定角标用图片样式还是文字样式。
  // 注意锚点始终保持在气泡 .msg-content-container 上：高亮框要框住整条消息，
  // 而不是钻进里面的图片；图文混排时角标自然落在气泡右下角(压在图片右下角)。
  // 回复引用里的缩略图、表情(.face-element)、卡片里的小图标都不是 .pic-element，不会误判。
  const hasImage = container != null &&
    Array.from(container.querySelectorAll<HTMLElement>('.pic-element')).some(el => !el.closest('.reply-element'));

  if (!container || container.classList.contains('gray-tip-message')) return;
  if (container.querySelector('.komorebi-recalled-tip')) return;

  void maybeDumpRecalledDom(msgId, item ?? container.closest<HTMLElement>('.ml-item'));

  container.classList.add('komorebi-recalled-parent');
  container.classList.toggle('komorebi-recalled-text', !hasImage);

  if (!getCurrentConfig().enableTip) return;

  const tip = document.createElement('div');
  tip.textContent = '已撤回';
  tip.className = 'komorebi-recalled-tip';
  container.appendChild(tip);
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
