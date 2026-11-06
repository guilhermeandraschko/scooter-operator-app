import { BleManager } from 'react-native-ble-plx';

let instance: BleManager | null = null;

export function getBleManager(): BleManager {
  if (!instance) {
    instance = new BleManager();
  }
  return instance;
}
