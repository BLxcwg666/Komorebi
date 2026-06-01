import { DEFAULT_CONFIG, getCurrentConfig, refreshConfig, saveSetting, StorageStats } from './config';

export async function renderSettings(container: HTMLElement): Promise<void> {
  const config = await refreshConfig();
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
          <b>高亮 @ 提及</b>
          <small>给消息里的 @XXX 加上可调颜色，区分对方和自己发的消息。</small>
        </span>
        <button id="mentionHighlight" class="switch" type="button" aria-pressed="false"><span></span></button>
      </label>

      <label class="row">
        <span>
          <b>对方 @ 颜色</b>
          <small>别人发的消息里的 @XXX 颜色。</small>
        </span>
        <input id="mentionOthersColor" type="color" />
      </label>

      <label class="row">
        <span>
          <b>自己 @ 颜色</b>
          <small>自己发的消息里的 @XXX 颜色。</small>
        </span>
        <input id="mentionSelfColor" type="color" />
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

      <label class="row">
        <span>
          <b>调试：导出撤回结构</b>
          <small>开启后，被标记撤回的消息会把整段 HTML 导出到插件数据目录的 debug 文件夹，用于排查标记错位。平时请关闭。</small>
        </span>
        <button id="domDump" class="switch" type="button" aria-pressed="false"><span></span></button>
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
  const mentionHighlight = settings.querySelector<HTMLButtonElement>('#mentionHighlight');
  const mentionOthersColor = settings.querySelector<HTMLInputElement>('#mentionOthersColor');
  const mentionSelfColor = settings.querySelector<HTMLInputElement>('#mentionSelfColor');
  const borderWidth = settings.querySelector<HTMLInputElement>('#borderWidth');
  const maxMsgSaveLimit = settings.querySelector<HTMLInputElement>('#maxMsgSaveLimit');
  const deleteMsgCountPerTime = settings.querySelector<HTMLInputElement>('#deleteMsgCountPerTime');
  const domDump = settings.querySelector<HTMLButtonElement>('#domDump');

  setSwitch(saveDb, config.saveDb);
  setSwitch(antiSelf, config.isAntiRecallSelfMsg);
  setSwitch(blockUpdate, config.blockQQNTUpdate);
  setSwitch(messageAnimation, config.enableMessageAnimation);
  setSwitch(shadow, config.enableShadow);
  setSwitch(tip, config.enableTip);
  setSwitch(mentionHighlight, config.enableMentionHighlight);
  setSwitch(domDump, config.enableDomDump);
  if (mainColor) mainColor.value = config.mainColor;
  if (mentionOthersColor) mentionOthersColor.value = config.mentionOthersColor;
  if (mentionSelfColor) mentionSelfColor.value = config.mentionSelfColor;
  if (borderWidth) borderWidth.value = String(config.borderWidth);
  if (maxMsgSaveLimit) maxMsgSaveLimit.value = String(config.maxMsgSaveLimit);
  if (deleteMsgCountPerTime) deleteMsgCountPerTime.value = String(config.deleteMsgCountPerTime);

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
  mentionHighlight?.addEventListener('click', () => toggleSettingSwitch(mentionHighlight, 'enableMentionHighlight'));
  domDump?.addEventListener('click', () => toggleSettingSwitch(domDump, 'enableDomDump'));
  mainColor?.addEventListener('change', () => saveSetting({ mainColor: mainColor.value }));
  mentionOthersColor?.addEventListener('change', () => saveSetting({ mentionOthersColor: mentionOthersColor.value }));
  mentionSelfColor?.addEventListener('change', () => saveSetting({ mentionSelfColor: mentionSelfColor.value }));
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
  key: 'isAntiRecallSelfMsg' | 'blockQQNTUpdate' | 'enableMessageAnimation' | 'enableShadow' | 'enableTip' | 'enableMentionHighlight' | 'enableDomDump',
): void {
  const next = !isSwitchActive(button);
  setSwitch(button, next);
  void saveSetting({ [key]: next });
}

async function refreshStorageStats(target?: HTMLElement | null): Promise<void> {
  if (!target) return;

  try {
    await refreshConfig();
    const stats = await window.Komorebi.getStorageStats<StorageStats>();
    target.textContent = `${getCurrentConfig().saveDb ? '已开启' : '未开启'}，已保存 ${stats.count} 条，${formatBytes(stats.size)}，位置：${stats.path}`;
  } catch {
    target.textContent = '读取失败';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
