import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BluetoothCommandLogBody } from '@/services/api';
import { OperatorApi } from '@/services/api';

const QUEUE_KEY = '@operator:offline_ble_commands';

export type QueuedBluetoothLog = BluetoothCommandLogBody & {
  localId: string;
  createdAt: number;
};

async function readQueue(): Promise<QueuedBluetoothLog[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedBluetoothLog[];
  } catch {
    return [];
  }
}

async function writeQueue(q: QueuedBluetoothLog[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function enqueueBluetoothLog(
  body: BluetoothCommandLogBody
): Promise<void> {
  const q = await readQueue();
  q.push({
    ...body,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
  });
  await writeQueue(q);
}

export async function flushOfflineQueue(): Promise<{ flushed: number; errors: string[] }> {
  const q = await readQueue();
  if (q.length === 0) return { flushed: 0, errors: [] };
  const errors: string[] = [];
  let flushed = 0;
  const remaining: QueuedBluetoothLog[] = [];
  for (const item of q) {
    try {
      const { localId: _l, createdAt: _c, ...body } = item;
      await OperatorApi.logBluetoothCommand(body);
      flushed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      remaining.push(item);
    }
  }
  await writeQueue(remaining);
  return { flushed, errors };
}
