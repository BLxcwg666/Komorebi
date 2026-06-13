import { showRepeatToast } from './toast';

type ReactionPeer = { chatType: number; peerUid: string; guildId: string };
type ReactionTarget = { msgSeq: string; peer: ReactionPeer };

let lastContextTarget: ReactionTarget | null = null;

export function setupReaction(): void {
  observeContextMenuForReactionItem();
}

function extractReactionTarget(item: HTMLElement): ReactionTarget | null {
  const messageEl = item.querySelector<HTMLElement>('.message') ?? item;
  const vueRoots = (messageEl as HTMLElement & { __VUE__?: Array<{ props?: { msgRecord?: Record<string, unknown> } }> }).__VUE__;
  const record = vueRoots?.[0]?.props?.msgRecord;
  if (!record) return null;

  const msgSeq = String(record.msgSeq ?? '');
  const peerUid = String(record.peerUid ?? '');
  if (!msgSeq || !peerUid) return null;

  return {
    msgSeq,
    peer: {
      chatType: Number(record.chatType ?? 0),
      peerUid,
      guildId: String(record.guildId ?? ''),
    },
  };
}

function observeContextMenuForReactionItem(): void {
  document.addEventListener('contextmenu', event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const item = target?.closest<HTMLElement>('.ml-item');
    lastContextTarget = item ? extractReactionTarget(item) : null;
  }, true);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const menu = node.matches('.q-context-menu') ? node : node.querySelector<HTMLElement>('.q-context-menu');
        if (menu) injectReactionMenuItem(menu);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectReactionMenuItem(menu: HTMLElement): void {
  if (menu.querySelector('.komorebi-reaction-menu-item')) return;
  if (!lastContextTarget) return;

  const allItems = menu.querySelectorAll<HTMLElement>('.q-context-menu-item, .context-menu-item');
  let anchor: HTMLElement | null = null;

  for (const it of allItems) {
    const text = it.textContent?.trim() ?? '';
    if (text === '复制' || text === 'Copy') {
      anchor = it;
      break;
    }
  }

  if (!anchor) return;

  const item = anchor.cloneNode(true) as HTMLElement;
  item.classList.add('komorebi-reaction-menu-item');

  const textNode = findMenuItemTextNode(item);
  if (textNode) textNode.textContent = '表情轰炸';
  else item.textContent = '表情轰炸';

  const target = lastContextTarget;
  item.addEventListener('click', event => {
    event.stopPropagation();
    event.preventDefault();
    void runReactionSpam(target);
    closeContextMenu(menu);
  }, true);

  anchor.after(item);
}

function findMenuItemTextNode(element: HTMLElement): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.trim()) return node as Text;
  }
  return null;
}

function closeContextMenu(menu: HTMLElement): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  menu.remove();
}

async function runReactionSpam(target: ReactionTarget | null): Promise<void> {
  if (!target) {
    showRepeatToast('表情轰炸失败：没拿到这条消息的会话信息');
    return;
  }

  showRepeatToast('表情轰炸进行中…');
  const result = await window.Komorebi.spamReactions(target.msgSeq, target.peer);
  if (!result.ok) showRepeatToast(`表情轰炸失败：${result.error}`);
  else showRepeatToast(`已糊上 ${result.count} 个表情`);
}
