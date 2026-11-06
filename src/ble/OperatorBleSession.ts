import { appendBleRxBuffer, interpretAckLine } from '@/protocol/parseAck';
import { chunkBleMessage } from '@/protocol/chunk';
import type { BleManager as BleManagerType, Device, Subscription } from 'react-native-ble-plx';
import { ZK_CHARACTERISTIC_UUID, ZK_SERVICE_UUID } from './constants';
import { base64ToUtf8, utf8ToBase64 } from './encoding';

export type BleCommandResult = {
  ackLines: string[];
  interpreted: ReturnType<typeof interpretAckLine>[];
};

export class OperatorBleSession {
  private rxBuffer = '';
  private monitorSub: Subscription | null = null;
  private ackWait:
    | {
        resolve: (v: BleCommandResult) => void;
        reject: (e: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;

  constructor(
    private readonly _manager: BleManagerType,
    public readonly device: Device
  ) {}

  async connect(): Promise<void> {
    await this.device.connect();
    await this.device.discoverAllServicesAndCharacteristics();

    this.monitorSub = this.device.monitorCharacteristicForService(
      ZK_SERVICE_UUID,
      ZK_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          console.warn('BLE notify error', error.message);
          return;
        }
        if (!characteristic?.value) return;
        try {
          const text = base64ToUtf8(characteristic.value);
          this.pushIncoming(text);
        } catch (e) {
          console.warn('BLE decode error', e);
        }
      }
    );
  }

  private pushIncoming(text: string): void {
    const { buffer, lines } = appendBleRxBuffer(this.rxBuffer, text);
    this.rxBuffer = buffer;
    for (const line of lines) {
      if (line.startsWith('+ACK:') && this.ackWait) {
        clearTimeout(this.ackWait.timer);
        const w = this.ackWait;
        this.ackWait = undefined;
        w.resolve({
          ackLines: [line],
          interpreted: [interpretAckLine(line)],
        });
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.ackWait) {
      clearTimeout(this.ackWait.timer);
      this.ackWait.reject(new Error('Disconnected'));
      this.ackWait = undefined;
    }
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.rxBuffer = '';
    await this.device.cancelConnection();
  }

  /** Send one logical AT line; adds CRLF and chunks writes per spec. */
  async sendAtLine(commandWithoutCrLf: string): Promise<void> {
    const line = commandWithoutCrLf.endsWith('\r\n')
      ? commandWithoutCrLf
      : `${commandWithoutCrLf}\r\n`;
    const chunks = chunkBleMessage(line);
    for (const part of chunks) {
      const b64 = utf8ToBase64(part);
      await this.device.writeCharacteristicWithResponseForService(
        ZK_SERVICE_UUID,
        ZK_CHARACTERISTIC_UUID,
        b64
      );
    }
  }

  /** Send command and wait for first +ACK line. */
  sendAndWaitAck(
    commandWithoutCrLf: string,
    options?: { timeoutMs?: number }
  ): Promise<BleCommandResult> {
    const timeoutMs = options?.timeoutMs ?? 12_000;
    if (this.ackWait) {
      return Promise.reject(new Error('Another BLE command is in progress'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.ackWait) {
          this.ackWait = undefined;
          reject(new Error('BLE command timeout'));
        }
      }, timeoutMs);
      this.ackWait = {
        resolve,
        reject,
        timer,
      };
      this.sendAtLine(commandWithoutCrLf).catch((e) => {
        if (this.ackWait) {
          clearTimeout(this.ackWait.timer);
          this.ackWait = undefined;
        }
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }
}
