import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@operator:ble_device_ids';

type Cache = Record<string, { id: string; name?: string; savedAt: number }>;

async function readAll(): Promise<Cache> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Cache;
  } catch {
    return {};
  }
}

export async function getCachedBleDeviceId(
  imei: string
): Promise<{ id: string; name?: string } | null> {
  const all = await readAll();
  const e = all[imei];
  return e ? { id: e.id, name: e.name } : null;
}

export async function setCachedBleDeviceId(
  imei: string,
  id: string,
  name?: string
): Promise<void> {
  const all = await readAll();
  all[imei] = { id, name, savedAt: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
