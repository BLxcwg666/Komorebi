interface AntiRecallConfig {
  mainColor: string;
  enableShadow: boolean;
  enableTip: boolean;
  isAntiRecallSelfMsg: boolean;
  maxMsgSaveLimit: number;
  deleteMsgCountPerTime: number;
}

const DEFAULT_CONFIG: AntiRecallConfig = {
  mainColor: '#ff6d6d',
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
      <h1>Komorebi 防撤回</h1>
      <p class="description">拦截新版 QQNT 的撤回消息，并在聊天列表里保留原消息内容。</p>

      <label class="row">
        <span>
          <b>反撤回自己的消息</b>
          <small>默认只拦截别人撤回的消息。</small>
        </span>
        <input id="antiSelf" type="checkbox" />
      </label>

      <label class="row">
        <span>
          <b>显示高亮阴影</b>
          <small>被撤回的消息会有一圈主题色阴影。</small>
        </span>
        <input id="shadow" type="checkbox" />
      </label>

      <label class="row">
        <span>
          <b>显示“已撤回”标记</b>
          <small>在消息下方追加一个撤回提示。</small>
        </span>
        <input id="tip" type="checkbox" />
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
          <b>内存缓存上限</b>
          <small>太小会影响很早之前消息的防撤回。</small>
        </span>
        <input id="maxMsgSaveLimit" type="number" min="1" max="99999999" />
      </label>

      <label class="row">
        <span>
          <b>超限时清理条数</b>
          <small>达到上限后从最旧消息开始清理。</small>
        </span>
        <input id="deleteMsgCountPerTime" type="number" min="1" max="99999" />
      </label>

      <style>
        .komorebi-settings { padding: 20px; color: var(--text_primary); }
        .komorebi-settings h1 { margin: 0 0 8px; font-size: 22px; }
        .komorebi-settings .description { margin: 0 0 18px; color: var(--text_secondary); }
        .komorebi-settings .row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 0; border-top: 1px solid rgba(127, 127, 127, 0.18); }
        .komorebi-settings .row span { display: grid; gap: 4px; }
        .komorebi-settings small { color: var(--text_secondary); }
        .komorebi-settings input[type="number"] { width: 120px; }
      </style>
    </div>
  `, 'text/html');

  const settings = dom.body.firstElementChild as HTMLElement | null;
  if (!settings) return;

  const antiSelf = settings.querySelector<HTMLInputElement>('#antiSelf');
  const shadow = settings.querySelector<HTMLInputElement>('#shadow');
  const tip = settings.querySelector<HTMLInputElement>('#tip');
  const mainColor = settings.querySelector<HTMLInputElement>('#mainColor');
  const maxMsgSaveLimit = settings.querySelector<HTMLInputElement>('#maxMsgSaveLimit');
  const deleteMsgCountPerTime = settings.querySelector<HTMLInputElement>('#deleteMsgCountPerTime');

  if (antiSelf) antiSelf.checked = currentConfig.isAntiRecallSelfMsg;
  if (shadow) shadow.checked = currentConfig.enableShadow;
  if (tip) tip.checked = currentConfig.enableTip;
  if (mainColor) mainColor.value = currentConfig.mainColor;
  if (maxMsgSaveLimit) maxMsgSaveLimit.value = String(currentConfig.maxMsgSaveLimit);
  if (deleteMsgCountPerTime) deleteMsgCountPerTime.value = String(currentConfig.deleteMsgCountPerTime);

  antiSelf?.addEventListener('change', () => saveSetting({ isAntiRecallSelfMsg: antiSelf.checked }));
  shadow?.addEventListener('change', () => saveSetting({ enableShadow: shadow.checked }));
  tip?.addEventListener('change', () => saveSetting({ enableTip: tip.checked }));
  mainColor?.addEventListener('change', () => saveSetting({ mainColor: mainColor.value }));

  maxMsgSaveLimit?.addEventListener('change', () => {
    saveSetting({ maxMsgSaveLimit: clampNumber(maxMsgSaveLimit.value, 1, 99999999) });
  });

  deleteMsgCountPerTime?.addEventListener('change', () => {
    saveSetting({ deleteMsgCountPerTime: clampNumber(deleteMsgCountPerTime.value, 1, 99999) });
  });

  container.appendChild(settings);
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
      ${currentConfig.enableShadow ? `margin: 3px 3px 25px; box-shadow: 0 0 8px 5px ${currentConfig.mainColor} !important;` : 'margin-bottom: 15px;'}
    }

    .komorebi-recalled-tip {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      z-index: 1;
      padding: 4px 8px;
      border-radius: 6px;
      color: ${currentConfig.mainColor};
      background-color: var(--background-color-05);
      box-shadow: var(--box-shadow);
      backdrop-filter: blur(28px);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
    }
  `;

  document.head.appendChild(style);
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
  const container =
    document.getElementById(`${msgId}-msgContainerMsgContent`) ??
    document.getElementById(`${msgId}-msgContent`)?.parentElement ??
    document.getElementById(`ml-${msgId}`)?.querySelector<HTMLElement>('.msg-content-container')?.parentElement ??
    document.getElementById(`ark-msg-content-container_${msgId}`)?.parentElement ??
    item?.querySelector<HTMLElement>('.msg-content-container') ??
    item?.querySelector<HTMLElement>('.file-message--content');

  if (!container || container.classList.contains('gray-tip-message')) return;
  if (container.querySelector('.komorebi-recalled-tip')) return;

  container.classList.add('komorebi-recalled-parent');

  if (!currentConfig.enableTip) return;

  const tip = document.createElement('div');
  tip.textContent = '已撤回';
  tip.className = 'komorebi-recalled-tip';
  container.appendChild(tip);
}

function clampNumber(value: string, min: number, max: number): number {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}
