// services/settingsService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'user_settings';

export interface UserSettings {
  autoDetect: boolean;
  scanTips: boolean;
  flagLow: boolean;
  /** Enable tree-based OCR post-processing for improved structure recognition */
  treeToggleOcr: boolean;
  /** Enable/disable scanning feature */
  scanning: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoDetect: true,
  scanTips: true,
  flagLow: false,
  treeToggleOcr: false,
  scanning: true,
};

/** GET settings from AsyncStorage */
export async function getUserSettings(): Promise<UserSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save partial settings to AsyncStorage */
export async function updateUserSettings(
  data: Partial<UserSettings>,
): Promise<UserSettings> {
  try {
    const current = await getUserSettings();
    const updated = { ...current, ...data };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    throw new Error('Failed to save settings.');
  }
}

/** Reset settings to defaults */
export async function resetUserSettings(): Promise<UserSettings> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    return { ...DEFAULT_SETTINGS };
  } catch (err) {
    throw new Error('Failed to reset settings.');
  }
}