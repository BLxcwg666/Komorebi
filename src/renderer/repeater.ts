import { showRepeatToast } from './toast';

type RepeatPeer = { chatType: number; peerUid: string; guildId: string };
type RepeatTarget = { msgId: string; peer: RepeatPeer };

let lastContextTarget: RepeatTarget | null = null;

export function setupRepeater(): void {
  injectRepeaterStyles();
  observeMessagesForPlusOne();
  observeContextMenuForRepeatItem();
}

function extractRepeatTarget(item: HTMLElement): RepeatTarget | null {
  const messageEl = item.querySelector<HTMLElement>('.message') ?? item;
  const vueRoots = (messageEl as HTMLElement & { __VUE__?: Array<{ props?: { msgRecord?: Record<string, unknown> } }> }).__VUE__;
  const record = vueRoots?.[0]?.props?.msgRecord;
  if (!record) return null;

  const msgId = String(record.msgId ?? item.id ?? '');
  const peerUid = String(record.peerUid ?? '');
  if (!msgId || !peerUid) return null;

  return {
    msgId,
    peer: {
      chatType: Number(record.chatType ?? 0),
      peerUid,
      guildId: String(record.guildId ?? ''),
    },
  };
}

function injectRepeaterStyles(): void {
  if (document.getElementById('komorebi-repeater-css')) return;

  const style = document.createElement('style');
  style.id = 'komorebi-repeater-css';
  style.textContent = `
    .ml-item .msg-content-container {
      position: relative;
      overflow: visible !important;
    }

    .komorebi-plus-one-btn {
      position: absolute;
      bottom: 0;
      right: -34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 22px;
      padding: 0;
      margin: 0;
      color: var(--text_primary, #aaa);
      cursor: pointer;
      user-select: none;
      opacity: 0;
      transition: opacity 140ms ease, color 140ms ease, transform 140ms ease;
      pointer-events: none;
      z-index: 2;
    }

    .komorebi-plus-one-btn--self {
      right: auto;
      left: -34px;
    }

    .ml-item:hover .komorebi-plus-one-btn {
      opacity: 0.7;
      pointer-events: auto;
    }

    .komorebi-plus-one-btn:hover {
      opacity: 1 !important;
      color: var(--brand_standard, #0099ff);
      transform: scale(1.08);
    }

    .komorebi-plus-one-btn:active { transform: scale(0.94); }

    .komorebi-plus-one-btn svg {
      width: 22px;
      height: 22px;
      display: block;
    }

    .ml-item.gray-tip-message .komorebi-plus-one-btn,
    .ml-item:has(.gray-tip-message) .komorebi-plus-one-btn { display: none !important; }

    .msg-content-container:has(> .plus-one-btn) .komorebi-plus-one-btn { display: none !important; }

    .komorebi-repeat-menu-item .q-icon,
    .komorebi-repeat-menu-item .context-menu-item__icon,
    .komorebi-repeat-menu-item svg { color: var(--brand_standard, #0099ff); }

    .komorebi-repeat-toast {
      position: fixed;
      left: 50%;
      bottom: 96px;
      transform: translateX(-50%) translateY(8px);
      max-width: 60vw;
      padding: 8px 14px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--background-color-02, #1f1f1f) 92%, transparent);
      color: var(--text_primary, #f0f0f0);
      font-size: 12px;
      line-height: 1.4;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(10px);
      pointer-events: none;
      opacity: 0;
      transition: opacity 180ms ease, transform 180ms ease;
      z-index: 99999;
    }

    .komorebi-repeat-toast.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;

  document.head.appendChild(style);
}

function observeMessagesForPlusOne(): void {
  const attachAll = (root: ParentNode) => {
    for (const item of root.querySelectorAll<HTMLElement>('.ml-item')) {
      attachPlusOneBtn(item);
    }
  };

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains('ml-item')) attachPlusOneBtn(node);
        else attachAll(node);
      }
    }
  });

  const timer = window.setInterval(() => {
    const list = document.querySelector<HTMLElement>('.chat-msg-area__vlist') ?? document.querySelector<HTMLElement>('.ml-list.list');
    if (!list) return;

    window.clearInterval(timer);
    attachAll(list);
    observer.observe(list, { childList: true, subtree: true });
  }, 100);
}

function attachPlusOneBtn(item: HTMLElement): void {
  if (item.classList.contains('gray-tip-message')) return;
  if (item.querySelector('.gray-tip-message')) return;

  const msgId = item.id;
  if (!msgId) return;

  const container = item.querySelector<HTMLElement>('.msg-content-container');
  if (!container) return;
  if (container.querySelector(':scope > .komorebi-plus-one-btn')) return;

  const isSelf = item.querySelector('.message-container--self') !== null || container.classList.contains('container--self');

  const btn = document.createElement('div');
  btn.className = isSelf ? 'komorebi-plus-one-btn komorebi-plus-one-btn--self no-copy' : 'komorebi-plus-one-btn no-copy';
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', '+1 复读');
  btn.title = '复读';
  btn.innerHTML = `
    <svg viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="13" r="9.5" stroke="currentColor" stroke-width="1.4" fill="none"/>
      <text x="13" y="16.4" text-anchor="middle" font-size="9.5" font-weight="600" letter-spacing="-0.4" fill="currentColor" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">+1</text>
    </svg>
  `;
  btn.addEventListener('click', event => {
    event.stopPropagation();
    event.preventDefault();
    void runRepeat(extractRepeatTarget(item));
  });

  container.appendChild(btn);
}

function observeContextMenuForRepeatItem(): void {
  document.addEventListener('contextmenu', event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const item = target?.closest<HTMLElement>('.ml-item');
    lastContextTarget = item ? extractRepeatTarget(item) : null;
  }, true);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const menu = node.matches('.q-context-menu') ? node : node.querySelector<HTMLElement>('.q-context-menu');
        if (menu) injectRepeatMenuItem(menu);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectRepeatMenuItem(menu: HTMLElement): void {
  if (menu.querySelector('.komorebi-repeat-menu-item')) return;
  if (!lastContextTarget) return;

  const allItems = menu.querySelectorAll<HTMLElement>('.q-context-menu-item, .context-menu-item');
  let copyItem: HTMLElement | null = null;

  for (const it of allItems) {
    const text = it.textContent?.trim() ?? '';
    if (text === '复制' || text === 'Copy') {
      copyItem = it;
      break;
    }
  }

  if (!copyItem) return;

  const item = copyItem.cloneNode(true) as HTMLElement;
  item.classList.add('komorebi-repeat-menu-item');

  const textNode = findMenuItemTextNode(item);
  if (textNode) textNode.textContent = '复读';
  else item.textContent = '复读';

  const target = lastContextTarget;
  item.addEventListener('click', event => {
    event.stopPropagation();
    event.preventDefault();
    void runRepeat(target);
    closeContextMenu(menu);
  }, true);

  copyItem.after(item);
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

async function runRepeat(target: RepeatTarget | null): Promise<void> {
  if (!target) {
    showRepeatToast('复读失败：没拿到这条消息的会话信息');
    return;
  }

  const result = await window.Komorebi.repeatMessage(target.msgId, target.peer);
  if (!result.ok) showRepeatToast(`复读失败：${result.error}`);
}
