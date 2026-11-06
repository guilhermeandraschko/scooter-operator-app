import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@operator:ble_password_cache';

export type CachedPassword = {
  deviceId: string;
  imei: string;
  password: string;
  cachedAt: number;
  ttlMs?: number;
  mode?: 'static' | 'dynamic';
};

async function readAll(): Promise<Record<string, CachedPassword>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CachedPassword>;
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, CachedPassword>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function getCachedPassword(imei: string): Promise<CachedPassword | null> {
  const all = await readAll();
  const e = all[imei];
  if (!e) return null;
  if (e.ttlMs && Date.now() - e.cachedAt > e.ttlMs) {
    return null;
  }
  return e;
}

export async function setCachedPassword(entry: CachedPassword): Promise<void> {
  const all = await readAll();
  all[entry.imei] = { ...entry, cachedAt: Date.now() };
  await writeAll(all);
}
