import { app, session } from 'electron';
import { getConfig } from './config';
import { log } from './utils';

const QQNT_UPDATE_BLOCK_FILTER = { urls: ['*://*/*'] };
let updateBlockerRegistered = false;

export function setupUpdateBlocker(): void {
  if (app.isReady()) registerQQNTUpdateBlocker();
  else app.once('ready', registerQQNTUpdateBlocker);
}

function registerQQNTUpdateBlocker(): void {
  if (updateBlockerRegistered) return;
  updateBlockerRegistered = true;

  session.defaultSession.webRequest.onBeforeRequest(QQNT_UPDATE_BLOCK_FILTER, (details, callback) => {
    const cancel = getConfig().blockQQNTUpdate && isQQNTUpdateRequest(details.url);
    if (cancel) log('Blocked QQNT update request:', details.url);
    callback({ cancel });
  });
}

function isQQNTUpdateRequest(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const target = `${host}${parsed.pathname}${parsed.search}`.toLowerCase();
  const isQQOrTencentHost = host.includes('qq.com') || host.includes('gtimg.cn') || host.includes('tencent.com');
  if (!isQQOrTencentHost) return false;

  const isKnownUpdateHost = [
    'qqpatch',
    'update',
    'upgrade',
    'hotupdate',
    'rdelivery',
    'configsvr',
  ].some(keyword => host.includes(keyword));

  const hasUpdateKeyword = [
    'update',
    'upgrade',
    'patch',
    'hotupdate',
    'version',
    'verlist',
    'checkupdate',
    'newest',
  ].some(keyword => target.includes(keyword));

  const isQQNTTarget = target.includes('qqnt') || target.includes('ntqq') || target.includes('/qq/nt') || target.includes('qq_');

  return (
    isQQNTTarget && hasUpdateKeyword
  ) || (
    isKnownUpdateHost && hasUpdateKeyword && (target.includes('qq') || target.includes('nt'))
  ) || (
    host.includes('dldir1.qq.com') && target.includes('/qqfile/qq/') && isQQNTTarget
  );
}
