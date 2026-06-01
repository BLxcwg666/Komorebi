export interface AntiRecallConfig {
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
  enableMentionHighlight: boolean;
  mentionOthersColor: string;
  mentionSelfColor: string;
  enableDomDump: boolean;
}

export interface StorageStats {
  enabled: boolean;
  count: number;
  size: number;
  path: string;
}

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
  enableMentionHighlight: true,
  mentionOthersColor: '#ff9933',
  mentionSelfColor: '#4a9eff',
  enableDomDump: false,
};

let currentConfig: AntiRecallConfig = { ...DEFAULT_CONFIG };

export function getCurrentConfig(): AntiRecallConfig {
  return currentConfig;
}

export async function refreshConfig(): Promise<AntiRecallConfig> {
  currentConfig = await fetchConfig();
  return currentConfig;
}

export async function saveSetting(patch: Partial<AntiRecallConfig>): Promise<void> {
  currentConfig = { ...currentConfig, ...patch };
  await window.Komorebi.saveConfig(currentConfig);
}

async function fetchConfig(): Promise<AntiRecallConfig> {
  try {
    return { ...DEFAULT_CONFIG, ...(await window.Komorebi.getConfig<AntiRecallConfig>()) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
