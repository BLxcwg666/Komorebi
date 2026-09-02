import path from 'node:path';
import type { AntiRecallConfig } from './types';

export const PLUGIN_SLUG = 'Komorebi';

export const DEFAULT_CONFIG: AntiRecallConfig = {
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
  enableDomDump: false,
  reactionSpamMode: 'once',
};

export const dataDir = path.join(LiteLoader.path.data, PLUGIN_SLUG);
export const imageDir = path.join(dataDir, 'images');
export const debugDir = path.join(dataDir, 'debug');
export const dbFilePath = path.join(dataDir, 'recalled-messages.db');

let config: AntiRecallConfig = loadConfig();

export function getConfig(): AntiRecallConfig {
  return config;
}

export function setConfig(nextConfig: Partial<AntiRecallConfig> | null | undefined): AntiRecallConfig {
  config = normalizeConfig(nextConfig);
  LiteLoader.api.config.set(PLUGIN_SLUG, config);
  return config;
}

function loadConfig(): AntiRecallConfig {
  return normalizeConfig(LiteLoader.api.config.get<Partial<AntiRecallConfig>>(PLUGIN_SLUG, DEFAULT_CONFIG));
}

function normalizeConfig(nextConfig: Partial<AntiRecallConfig> | null | undefined): AntiRecallConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(nextConfig ?? {}),
    saveDb: nextConfig?.saveDb === true,
    enableDomDump: nextConfig?.enableDomDump === true,
    blockQQNTUpdate: nextConfig?.blockQQNTUpdate !== false,
    reactionSpamMode: nextConfig?.reactionSpamMode === 'loop' ? 'loop' : 'once',
    borderWidth: normalizeBorderWidth(nextConfig?.borderWidth),
    maxMsgSaveLimit: normalizeLimit(nextConfig?.maxMsgSaveLimit, DEFAULT_CONFIG.maxMsgSaveLimit),
    deleteMsgCountPerTime: normalizeLimit(nextConfig?.deleteMsgCountPerTime, DEFAULT_CONFIG.deleteMsgCountPerTime),
  };
}

function normalizeBorderWidth(value: number | undefined): number {
  const width = Number(value ?? DEFAULT_CONFIG.borderWidth);
  if (!Number.isFinite(width)) return DEFAULT_CONFIG.borderWidth;
  return Math.min(8, Math.max(0.5, width));
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  const limit = Number(value ?? fallback);
  if (limit === -1) return -1;
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, limit);
}
