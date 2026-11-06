/**
 * Bluetooth Protocol — ZK Series Mobile Application User Protocol v80.09
 * Ported from scooter-server/lib/protocols/bluetooth-protocol.ts
 */

import type { BluetoothCommandType } from './protocol-types';

export function buildBluetoothCommand(
  commandType: BluetoothCommandType,
  params: (string | number)[]
): string {
  const paramsStr = params.join(',');
  return `AT+${commandType.substring(3)}=${paramsStr}$`;
}

export const BluetoothCommands = {
  lockUnlock: (
    blePassword: string,
    lockCommand: 0 | 1 | 2 | 10 | 11 | 20 | 21 | 30 | 31 | 40 | 41
  ): string => {
    return buildBluetoothCommand('AT+BKSCT', [blePassword, lockCommand]);
  },

  ecuParameters: (
    blePassword: string,
    ecuType: string,
    maxSpeedLimit: number,
    speedUpMode: 0 | 1,
    displayUnit: 0 | 1
  ): string => {
    return buildBluetoothCommand('AT+BKECP', [
      blePassword,
      ecuType,
      maxSpeedLimit,
      speedUpMode,
      displayUnit,
    ]);
  },

  ledControl: (blePassword: string, led: 0, ledStatus: 0 | 1): string => {
    return buildBluetoothCommand('AT+BKLED', [blePassword, led, ledStatus]);
  },

  locateScooter: (blePassword: string, reserved: 0 = 0): string => {
    return buildBluetoothCommand('AT+BKLOC', [blePassword, reserved]);
  },

  warning: (blePassword: string, reserved: 0 = 0): string => {
    return buildBluetoothCommand('AT+BKWRN', [blePassword, reserved]);
  },

  changePassword: (blePassword: string, newBlePassword: string): string => {
    return buildBluetoothCommand('AT+BKPWD', [blePassword, newBlePassword]);
  },

  queryInfo: (blePassword: string, reserved: 0 = 0): string => {
    return buildBluetoothCommand('AT+BKINF', [blePassword, reserved]);
  },

  queryVersion: (blePassword: string, reserved: 0 = 0): string => {
    return buildBluetoothCommand('AT+BKVER', [blePassword, reserved]);
  },
};

export function parseBluetoothAck(
  ackType: string,
  params: Record<string, unknown>
): {
  success: boolean;
  lockStatus?: 0 | 1;
  result?: 0 | 1;
  data?: Record<string, unknown>;
} {
  if (ackType === '+ACK:BKSCT') {
    return {
      success: true,
      lockStatus: params.param1 as 0 | 1,
    };
  }

  if (
    ackType === '+ACK:BKECP' ||
    ackType === '+ACK:BKLED' ||
    ackType === '+ACK:BKLOC' ||
    ackType === '+ACK:BKWRN' ||
    ackType === '+ACK:BKPWD'
  ) {
    return {
      success: true,
      result: params.param1 as 0 | 1,
    };
  }

  if (ackType === '+ACK:BKINF') {
    return {
      success: true,
      data: {
        lockStatus: params.param1,
        scooterSpeed: params.param2,
        currentMileage: params.param3,
        totalMileage: params.param4,
        rideTime: params.param5,
        batteryPercentage: params.param6,
        headlampStatus: params.param7,
      },
    };
  }

  if (ackType === '+ACK:BKVER') {
    return {
      success: true,
      data: {
        mcuFirmware: params.param1,
        bleFirmware: params.param2,
        ecuFirmwareHardware: params.param3,
        meterFirmwareHardware: params.param4,
        bmsFirmwareHardware: params.param5,
        batteryLockFirmwareHardware: params.param6,
        pileLockFirmwareHardware: params.param7,
        basketLockFirmwareHardware: params.param8,
      },
    };
  }

  return { success: false };
}
