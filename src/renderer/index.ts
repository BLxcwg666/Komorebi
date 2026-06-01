import { observeMessageEntrances } from './animation';
import { applyRecalledIds, markRecalledById, markRecalledInView } from './anti-recall';
import { applyCssFromConfig } from './css';
import { setupRepeater } from './repeater';
import { renderSettings } from './settings';

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
    void applyRecalledIds((ids ?? []).map(String));
  });

  await applyCssFromConfig();
  observeMessageEntrances();
  setupRepeater();

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
