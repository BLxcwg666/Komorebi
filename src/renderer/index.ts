interface AntiRecallConfig {
  mainColor: string;
  borderWidth: number;
  saveDb: boolean;
  blockQQNTUpdate: boolean;
  enableMessageAnimation: boolean;
  enableShadow: boolean;
  enableTip: boolean;
  isAntiRecallSelfMsg: boolean;
  maxMsgSaveLimit: number;
  deleteMsgCountPerTime: number;
}

interface StorageStats {
  enabled: boolean;
  count: number;
  size: number;
  path: string;
}

const DEFAULT_CONFIG: AntiRecallConfig = {
  mainColor: '#ff6d6d',
  borderWidth: 2,
  saveDb: false,
  blockQQNTUpdate: true,
  enableMessageAnimation: true,
  enableShadow: true,
  enableTip: true,
  isAntiRecallSelfMsg: false,
  maxMsgSaveLimit: 10000,
  deleteMsgCountPerTime: 500,
};

let recalledIds: string[] = [];
let currentConfig: AntiRecallConfig = { ...DEFAULT_CONFIG };

void setupMainWindowPatches();

export const onSettingWindowCreated = (view: HTMLElement) => {
  void renderSettings(view);
};

async function setupMainWindowPatches(): Promise<void> {
  if (!window.Komorebi) return;

  window.Komorebi.repatchCss(() => {
    void applyCssFromConfig();
  });

  window.Komorebi.recallTip((_event, msgId) => {
    void markRecalledById(String(msgId));
  });

  window.Komorebi.recallTipList((_event, ids) => {
    recalledIds = (ids ?? []).map(String);
    void markRecalledInView();
  });

  await applyCssFromConfig();
  observeMessageEntrances();

  let throttled = false;
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      const first = mutation.addedNodes?.[0] as HTMLElement | undefined;
      if (first?.classList?.contains('komorebi-recalled-tip')) continue;
      if (throttled) continue;

      throttled = true;
      setTimeout(() => {
        throttled = false;
        void markRecalledInView();
      }, 50);
    }
  });

  const timer = window.setInterval(() => {
    const msgList = document.querySelector('.ml-list.list');
    if (!msgList) return;

    window.clearInterval(timer);
    observer.observe(msgList, { childList: true, subtree: true });
  }, 100);
}

async function renderSettings(container: HTMLElement): Promise<void> {
  currentConfig = await getConfig();
  container.textContent = '';

  const dom = new DOMParser().parseFromString(`
    <div class="komorebi-settings">
      <label class="row">
        <span>
          <b>持久化保存撤回消息</b>
          <small>开启后，撤回消息会保存到插件数据目录，重启 QQ 后仍可恢复。</small>
        </span>
        <button id="saveDb" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <div class="storage-panel">
        <div>
          <b>存档状态</b>
          <small id="storageStats">读取中...</small>
        </div>
        <button id="clearStorage" type="button">清空存档</button>
      </div>

      <label class="row">
        <span>
          <b>反撤回自己的消息</b>
          <small>默认只拦截别人撤回的消息。</small>
        </span>
        <button id="antiSelf" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <label class="row">
        <span>
          <b>拦截 QQNT 更新</b>
          <small>阻止 QQNT 请求常见更新、补丁和升级接口。</small>
        </span>
        <button id="blockUpdate" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <label class="row">
        <span>
          <b>消息上滑动画</b>
          <small>发出和收到新消息时使用类似 Telegram 的轻量入场动画。</small>
        </span>
        <button id="messageAnimation" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <label class="row">
        <span>
          <b>显示高亮阴影</b>
          <small>被撤回的消息会显示一圈主题色内描边。</small>
        </span>
        <button id="shadow" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <label class="row">
        <span>
          <b>显示“已撤回”标记</b>
          <small>在消息下方追加一个撤回提示。</small>
        </span>
        <button id="tip" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <label class="row">
        <span>
          <b>主题色</b>
          <small>用于阴影和撤回标记。</small>
        </span>
        <input id="mainColor" type="color" />
      </label>

      <label class="row">
        <span>
          <b>描边粗细</b>
          <small>控制撤回消息外框，范围 0.5 到 8。</small>
        </span>
        <input id="borderWidth" type="number" min="0.5" max="8" step="0.5" />
      </label>

      <label class="row">
        <span>
          <b>内存缓存上限</b>
          <small>太小会影响很早之前消息的防撤回；填 -1 表示不限制。</small>
        </span>
        <input id="maxMsgSaveLimit" type="number" min="-1" max="99999999" />
      </label>

      <label class="row">
        <span>
          <b>超限时清理条数</b>
          <small>达到上限后从最旧消息开始清理；填 -1 时会清空当前内存缓存。</small>
        </span>
        <input id="deleteMsgCountPerTime" type="number" min="-1" max="99999" />
      </label>

      <style>
        .komorebi-settings { padding: 20px; color: var(--text_primary); }
        .komorebi-settings h1 { margin: 0 0 8px; font-size: 22px; }
        .komorebi-settings .description { margin: 0 0 18px; color: var(--text_secondary); }
        .komorebi-settings .row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 0; border-top: 1px solid rgba(127, 127, 127, 0.18); }
        .komorebi-settings .row span { display: grid; gap: 4px; }
        .komorebi-settings .storage-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 4px 0 10px; padding: 12px; border-radius: 8px; background: rgba(127, 127, 127, 0.08); }
        .komorebi-settings .storage-panel div { display: grid; gap: 4px; min-width: 0; }
        .komorebi-settings small { color: var(--text_secondary); }
        .komorebi-settings input[type="number"] { width: 120px; box-sizing: border-box; padding: 6px 8px; border: 1px solid rgba(127, 127, 127, 0.28); border-radius: 6px; color: var(--text_primary); background: rgba(127, 127, 127, 0.12); }
        .komorebi-settings button { padding: 6px 12px; border: 1px solid rgba(127, 127, 127, 0.24); border-radius: 6px; color: var(--text_primary); background: transparent; cursor: pointer; }
        .komorebi-settings .switch { position: relative; flex: 0 0 auto; width: 46px; height: 26px; padding: 0; border: 0; border-radius: 999px; background: rgba(127, 127, 127, 0.34); transition: background 160ms ease; }
        .komorebi-settings .switch span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28); transition: transform 160ms ease; }
        .komorebi-settings .switch.is-active { background: var(--brand_standard, #0099ff); }
        .komorebi-settings .switch.is-active span { transform: translateX(20px); }
      </style>
    </div>
  `, 'text/html');

  const settings = dom.body.firstElementChild as HTMLElement | null;
  if (!settings) return;

  const saveDb = settings.querySelector<HTMLButtonElement>('#saveDb');
  const storageStats = settings.querySelector<HTMLElement>('#storageStats');
  const clearStorage = settings.querySelector<HTMLButtonElement>('#clearStorage');
  const antiSelf = settings.querySelector<HTMLButtonElement>('#antiSelf');
  const blockUpdate = settings.querySelector<HTMLButtonElement>('#blockUpdate');
  const messageAnimation = settings.querySelector<HTMLButtonElement>('#messageAnimation');
  const shadow = settings.querySelector<HTMLButtonElement>('#shadow');
  const tip = settings.querySelector<HTMLButtonElement>('#tip');
  const mainColor = settings.querySelector<HTMLInputElement>('#mainColor');
  const borderWidth = settings.querySelector<HTMLInputElement>('#borderWidth');
  const maxMsgSaveLimit = settings.querySelector<HTMLInputElement>('#maxMsgSaveLimit');
  const deleteMsgCountPerTime = settings.querySelector<HTMLInputElement>('#deleteMsgCountPerTime');

  setSwitch(saveDb, currentConfig.saveDb);
  setSwitch(antiSelf, currentConfig.isAntiRecallSelfMsg);
  setSwitch(blockUpdate, currentConfig.blockQQNTUpdate);
  setSwitch(messageAnimation, currentConfig.enableMessageAnimation);
  setSwitch(shadow, currentConfig.enableShadow);
  setSwitch(tip, currentConfig.enableTip);
  if (mainColor) mainColor.value = currentConfig.mainColor;
  if (borderWidth) borderWidth.value = String(currentConfig.borderWidth);
  if (maxMsgSaveLimit) maxMsgSaveLimit.value = String(currentConfig.maxMsgSaveLimit);
  if (deleteMsgCountPerTime) deleteMsgCountPerTime.value = String(currentConfig.deleteMsgCountPerTime);

  saveDb?.addEventListener('click', async () => {
    const next = !isSwitchActive(saveDb);
    setSwitch(saveDb, next);
    await saveSetting({ saveDb: next });
    void refreshStorageStats(storageStats);
  });

  clearStorage?.addEventListener('click', async () => {
    await window.Komorebi.clearStorage<StorageStats>();
    await refreshStorageStats(storageStats);
  });

  antiSelf?.addEventListener('click', () => toggleSettingSwitch(antiSelf, 'isAntiRecallSelfMsg'));
  blockUpdate?.addEventListener('click', () => toggleSettingSwitch(blockUpdate, 'blockQQNTUpdate'));
  messageAnimation?.addEventListener('click', () => toggleSettingSwitch(messageAnimation, 'enableMessageAnimation'));
  shadow?.addEventListener('click', () => toggleSettingSwitch(shadow, 'enableShadow'));
  tip?.addEventListener('click', () => toggleSettingSwitch(tip, 'enableTip'));
  mainColor?.addEventListener('change', () => saveSetting({ mainColor: mainColor.value }));
  borderWidth?.addEventListener('change', () => saveSetting({ borderWidth: clampBorderWidth(borderWidth.value) }));

  maxMsgSaveLimit?.addEventListener('change', () => {
    saveSetting({ maxMsgSaveLimit: clampLimit(maxMsgSaveLimit.value, 99999999) });
  });

  deleteMsgCountPerTime?.addEventListener('change', () => {
    saveSetting({ deleteMsgCountPerTime: clampLimit(deleteMsgCountPerTime.value, 99999) });
  });

  container.appendChild(settings);
  await refreshStorageStats(storageStats);
}

async function getConfig(): Promise<AntiRecallConfig> {
  try {
    return { ...DEFAULT_CONFIG, ...(await window.Komorebi.getConfig<AntiRecallConfig>()) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveSetting(patch: Partial<AntiRecallConfig>): Promise<void> {
  currentConfig = { ...currentConfig, ...patch };
  await window.Komorebi.saveConfig(currentConfig);
}

function setSwitch(button: HTMLButtonElement | null | undefined, active: boolean): void {
  if (!button) return;

  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
}

function isSwitchActive(button: HTMLButtonElement): boolean {
  return button.classList.contains('is-active');
}

function toggleSettingSwitch(
  button: HTMLButtonElement,
  key: 'isAntiRecallSelfMsg' | 'blockQQNTUpdate' | 'enableMessageAnimation' | 'enableShadow' | 'enableTip',
): void {
  const next = !isSwitchActive(button);
  setSwitch(button, next);
  void saveSetting({ [key]: next });
}

async function refreshStorageStats(target?: HTMLElement | null): Promise<void> {
  if (!target) return;

  try {
    currentConfig = await getConfig();
    const stats = await window.Komorebi.getStorageStats<StorageStats>();
    target.textContent = `${currentConfig.saveDb ? '已开启' : '未开启'}，已保存 ${stats.count} 条，${formatBytes(stats.size)}，位置：${stats.path}`;
  } catch {
    target.textContent = '读取失败';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function applyCssFromConfig(): Promise<void> {
  currentConfig = await getConfig();

  document.querySelector('#komorebi-anti-recall-css')?.remove();

  const style = document.createElement('style');
  style.id = 'komorebi-anti-recall-css';
  style.textContent = `
    .komorebi-recalled-parent {
      position: relative;
      overflow: visible !important;
      border-radius: 10px;
      ${currentConfig.enableShadow ? `outline: ${currentConfig.borderWidth}px solid ${currentConfig.mainColor} !important; outline-offset: -${currentConfig.borderWidth}px;` : ''}
    }

    .komorebi-recalled-parent.komorebi-recalled-text {
      box-sizing: border-box;
      min-width: 78px;
      padding-right: 56px !important;
    }

    .komorebi-recalled-parent.komorebi-recalled-text .komorebi-recalled-tip {
      top: calc(100% - 12px);
      bottom: auto;
      transform: translateY(-50%);
    }

    .komorebi-recalled-tip {
      position: absolute;
      right: 5px;
      bottom: 4px;
      z-index: 1;
      padding: 2px 5px;
      border-radius: 999px;
      color: ${currentConfig.mainColor};
      background-color: color-mix(in srgb, var(--background-color-05, #000) 72%, transparent);
      backdrop-filter: blur(10px);
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .ml-item { transition: none !important; }
    }
  `;

  document.head.appendChild(style);
}

function observeMessageEntrances(): void {
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
  if (!currentConfig.enableMessageAnimation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const addedItems = new Set<HTMLElement>();
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) collectMessageItems(node, addedItems);
  }
  if (addedItems.size === 0) return;
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

async function markRecalledInView(): Promise<void> {
  const nodes = document.querySelector('.chat-msg-area__vlist')?.querySelectorAll<HTMLElement>('.ml-item');
  if (!nodes) return;

  currentConfig = await getConfig();

  for (const item of nodes) {
    if (item.id && recalledIds.includes(item.id)) markRecalledItem(item.id, item);
  }
}

async function markRecalledById(msgId: string): Promise<void> {
  currentConfig = await getConfig();
  markRecalledItem(msgId, document.querySelector<HTMLElement>(`.ml-item[id='${msgId}']`) ?? undefined);
}

function markRecalledItem(msgId: string, item?: HTMLElement): void {
  let container =
    document.getElementById(`${msgId}-msgContainerMsgContent`) ??
    document.getElementById(`${msgId}-msgContent`)?.parentElement ??
    document.getElementById(`ml-${msgId}`)?.querySelector<HTMLElement>('.msg-content-container')?.parentElement ??
    document.getElementById(`ark-msg-content-container_${msgId}`)?.parentElement ??
    item?.querySelector<HTMLElement>('.msg-content-container') ??
    item?.querySelector<HTMLElement>('.file-message--content');

  const hasImage = container?.querySelector('img') != null;

  if (hasImage) {
    container = container.querySelector<HTMLElement>('img')?.parentElement ?? container;
  }

  if (!container || container.classList.contains('gray-tip-message')) return;
  if (container.querySelector('.komorebi-recalled-tip')) return;

  container.classList.add('komorebi-recalled-parent');
  container.classList.toggle('komorebi-recalled-text', !hasImage);

  if (!currentConfig.enableTip) return;

  const tip = document.createElement('div');
  tip.textContent = '已撤回';
  tip.className = 'komorebi-recalled-tip';
  container.appendChild(tip);
}

function clampLimit(value: string, max: number): number {
  const number = Number.parseInt(value, 10);
  if (number === -1) return -1;
  if (Number.isNaN(number)) return 1;
  return Math.min(max, Math.max(1, number));
}

function clampBorderWidth(value: string): number {
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) return DEFAULT_CONFIG.borderWidth;
  return Math.min(8, Math.max(0.5, number));
}
