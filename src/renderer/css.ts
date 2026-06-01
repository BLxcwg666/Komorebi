import { refreshConfig } from './config';

export async function applyCssFromConfig(): Promise<void> {
  const config = await refreshConfig();

  document.querySelector('#komorebi-anti-recall-css')?.remove();

  const style = document.createElement('style');
  style.id = 'komorebi-anti-recall-css';
  style.textContent = `
    .komorebi-recalled-parent {
      position: relative;
      overflow: visible !important;
    }

    ${config.enableShadow ? `
    .komorebi-recalled-parent::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: var(--komorebi-frame-radius, inherit);
      border: ${config.borderWidth}px solid ${config.mainColor};
      pointer-events: none;
      z-index: 1;
    }
    ` : ''}

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
      z-index: 2;
      padding: 2px 5px;
      border-radius: 999px;
      color: ${config.mainColor};
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

    ${config.enableMentionHighlight ? `
    .text-element--at,
    .text-element--at-all,
    .mention-info,
    .message-content .at,
    .msg-content-container .at {
      color: ${config.mentionOthersColor} !important;
    }

    .message-container--self .text-element--at,
    .message-container--self .text-element--at-all,
    .message-container--self .mention-info,
    .message-container--self .at,
    .container--self .text-element--at,
    .container--self .text-element--at-all,
    .container--self .mention-info,
    .container--self .at {
      color: ${config.mentionSelfColor} !important;
    }
    ` : ''}
  `;

  document.head.appendChild(style);
}
