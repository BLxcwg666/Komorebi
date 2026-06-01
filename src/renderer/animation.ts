import { getCurrentConfig } from './config';

export function observeMessageEntrances(): void {
  if (!window.Komorebi) return;

  let list: HTMLElement | null = null;
  let initialized = false;
  let lastAnimatedAt = 0;
  const observer = new MutationObserver(mutations => {
    if (!list) return;

    if (!initialized) {
      initialized = true;
      return;
    }

    void animateMessageListShift(list, mutations, lastAnimatedAt, time => {
      lastAnimatedAt = time;
    });
  });

  const timer = window.setInterval(() => {
    const msgList = document.querySelector<HTMLElement>('.chat-msg-area__vlist') ?? document.querySelector<HTMLElement>('.ml-list.list');
    if (!msgList) return;

    list = msgList;
    window.clearInterval(timer);
    observer.observe(msgList, { childList: true, subtree: true });
  }, 100);
}

function animateMessageListShift(
  list: HTMLElement,
  mutations: MutationRecord[],
  lastAnimatedAt: number,
  setLastAnimatedAt: (time: number) => void,
): void {
  if (!getCurrentConfig().enableMessageAnimation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const addedItems = new Set<HTMLElement>();
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) collectMessageItems(node, addedItems);
  }
  if (addedItems.size === 0 || addedItems.size > 2) return;

  const allItems = list.querySelectorAll<HTMLElement>('.ml-item');
  const lastItem = allItems[allItems.length - 1];
  if (!lastItem || !addedItems.has(lastItem)) return;

  if (!isNearMessageListBottom(list)) return;

  const now = performance.now();
  if (now - lastAnimatedAt < 280) return;
  setLastAnimatedAt(now);

  requestAnimationFrame(() => {
    const delta = getAddedMessagesHeight(addedItems);
    if (delta <= 0 || delta > 120) return;

    const viewport = getMessageViewport(list);
    const animatedTargets = getVisibleMessageAnimationTargets(list, viewport);
    if (animatedTargets.length === 0 || animatedTargets.length > 18) return;

    for (const target of animatedTargets) {
      target.animate(
        [
          { transform: `translate3d(0, ${delta}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
      );
    }
  });
}

function getAddedMessagesHeight(items: Set<HTMLElement>): number {
  let height = 0;

  for (const item of items) {
    if (item.classList.contains('gray-tip-message')) continue;

    const style = window.getComputedStyle(item);
    const marginY = Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom);
    height += item.getBoundingClientRect().height + marginY;
  }

  return Math.min(120, Math.max(0, height));
}

function getMessageViewport(list: HTMLElement): DOMRect {
  return (list.closest('.chat-msg-area') ?? list.parentElement ?? list).getBoundingClientRect();
}

function isNearMessageListBottom(list: HTMLElement): boolean {
  const scroller = findScrollableParent(list);
  if (!scroller) return true;

  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
}

function findScrollableParent(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;

  while (current) {
    if (current.scrollHeight > current.clientHeight + 8) return current;
    current = current.parentElement;
  }

  return null;
}

function getVisibleMessageAnimationTargets(list: HTMLElement, viewport: DOMRect): HTMLElement[] {
  const targets: HTMLElement[] = [];

  for (const item of list.querySelectorAll<HTMLElement>('.ml-item')) {
    const rect = item.getBoundingClientRect();
    if (rect.bottom < viewport.top || rect.top > viewport.bottom) continue;

    targets.push(getMessageAnimationTarget(item));
  }

  return targets;
}

function getMessageAnimationTarget(item: HTMLElement): HTMLElement {
  return item.firstElementChild instanceof HTMLElement ? item.firstElementChild : item;
}

function collectMessageItems(node: Node, items: Set<HTMLElement>): void {
  if (!(node instanceof HTMLElement)) return;

  if (node.classList.contains('ml-item')) {
    items.add(node);
    return;
  }

  for (const item of node.querySelectorAll<HTMLElement>('.ml-item')) {
    items.add(item);
  }
}
