import type { Device } from 'react-native-ble-plx';
import { base64ToBytes } from './encoding';
import { ZK_SERVICE_UUID } from './constants';

const IMEI_RE = /\d{15}/g;

const AD_TYPE_MANUFACTURER = 0xff;
const AD_TYPE_COMPLETE_NAME = 0x09;
const AD_TYPE_SHORT_NAME = 0x08;

/** IMEI check digit (Luhn). Rejects random 15-digit noise from BLE payloads. */
export function isValidImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = imei.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function collectAsciiImeis(bytes: Uint8Array): string[] {
  const text = Array.from(bytes, (b) =>
    b >= 0x30 && b <= 0x39 ? String.fromCharCode(b) : ' '
  ).join('');
  return text.match(IMEI_RE) ?? [];
}

function decodeBase64Field(value: string | null | undefined): Uint8Array | null {
  if (!value || value.length === 0) return null;
  try {
    return base64ToBytes(value);
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array, max = 24): string {
  const n = Math.min(bytes.length, max);
  let out = '';
  for (let i = 0; i < n; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  if (bytes.length > max) out += '…';
  return out;
}

function pickBestImei(candidates: string[], preferred?: string): string | null {
  const unique = [...new Set(candidates)];
  if (preferred && unique.includes(preferred)) return preferred;

  const valid = unique.filter(isValidImei);
  if (valid.length === 0) {
    // Last resort: any 15-digit that shares TAC with target (some modules fail Luhn)
    if (preferred) {
      const prefix = preferred.slice(0, 2);
      return unique.find((c) => c.startsWith(prefix)) ?? null;
    }
    return null;
  }
  if (preferred) {
    const sameTac = valid.find((c) => c.startsWith(preferred.slice(0, 2)));
    if (sameTac) return sameTac;
  }
  return valid[0] ?? null;
}

/**
 * ZK-style manufacturer field: AD type 0xFF with 15 ASCII digits
 * (length 0x10 including type byte per ZK mobile protocol).
 */
function findZkStyleImeiInAd(bytes: Uint8Array): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i]!;
    if (len === 0) break;
    if (i + len >= bytes.length) break;
    const type = bytes[i + 1]!;
    const data = bytes.subarray(i + 2, i + 1 + len);

    if (type === AD_TYPE_MANUFACTURER) {
      // Exact ZK layout: 15 ASCII digit bytes
      if (data.length === 15 && [...data].every((b) => b >= 0x30 && b <= 0x39)) {
        found.push(String.fromCharCode(...data));
      }
      // Standard manufacturer: 2-byte company id + payload
      if (data.length >= 17) {
        const payload = data.subarray(2);
        if (payload.length >= 15 && [...payload.slice(0, 15)].every((b) => b >= 0x30 && b <= 0x39)) {
          found.push(String.fromCharCode(...payload.subarray(0, 15)));
        }
      }
      found.push(...collectAsciiImeis(data));
    }

    if (type === AD_TYPE_COMPLETE_NAME || type === AD_TYPE_SHORT_NAME) {
      found.push(...collectAsciiImeis(data));
    }

    i += len + 1;
  }
  return found;
}

export function deviceLooksLikeZkScooter(device: Device): boolean {
  const uuids = (device.serviceUUIDs ?? []).map((u) => u.toLowerCase());
  const zk = ZK_SERVICE_UUID.toLowerCase();
  if (uuids.some((u) => u.includes('2c00') || u === zk)) return true;
  const name = `${device.name ?? ''} ${device.localName ?? ''}`.toLowerCase();
  if (/zk\s*\d|scooter|boleia/.test(name)) return true;
  return false;
}

/** True if ad IMEI matches, or BLE broadcast name is IMEI / last-8 (GTQSS name). */
export function deviceMatchesTargetImei(device: Device, targetImei: string): boolean {
  if (!targetImei) return false;
  if (extractImeiFromDevice(device, targetImei) === targetImei) return true;
  const name = `${device.name ?? ''}${device.localName ?? ''}`;
  if (!name) return false;
  if (name.includes(targetImei)) return true;
  const suffix = targetImei.slice(-8);
  return suffix.length >= 6 && name.includes(suffix);
}

export type AdDebugInfo = {
  imei: string | null;
  name: string;
  mfgLen: number;
  rawLen: number;
  mfgHex: string;
  rawHex: string;
  serviceUuids: string;
  likelyZk: boolean;
};

export function describeAdvertisement(
  device: Device,
  preferredImei?: string
): AdDebugInfo {
  const mfg = decodeBase64Field(device.manufacturerData);
  const raw = decodeBase64Field(device.rawScanRecord);
  return {
    imei: extractImeiFromDevice(device, preferredImei),
    name: device.name ?? device.localName ?? '(no name)',
    mfgLen: mfg?.length ?? 0,
    rawLen: raw?.length ?? 0,
    mfgHex: mfg ? toHex(mfg) : '—',
    rawHex: raw ? toHex(raw) : '—',
    serviceUuids: (device.serviceUUIDs ?? []).slice(0, 3).join(',') || '—',
    likelyZk: deviceLooksLikeZkScooter(device),
  };
}

/**
 * Best-effort IMEI from BLE advertisement.
 * Only returns Luhn-valid 15-digit IMEIs (avoids false positives from other BLE devices).
 */
export function extractImeiFromDevice(
  device: Device,
  preferredImei?: string
): string | null {
  const candidates: string[] = [];

  const fromName = `${device.name ?? ''}${device.localName ?? ''}`.match(/\d{15}/g);
  if (fromName) candidates.push(...fromName);

  const manufacturer = decodeBase64Field(device.manufacturerData);
  if (manufacturer) {
    // Exact 15 ASCII digits (ZK manufacturer payload, with or without company id)
    if (
      manufacturer.length === 15 &&
      [...manufacturer].every((b) => b >= 0x30 && b <= 0x39)
    ) {
      candidates.push(String.fromCharCode(...manufacturer));
    }
    if (manufacturer.length >= 17) {
      const payload = manufacturer.subarray(2, 17);
      if ([...payload].every((b) => b >= 0x30 && b <= 0x39)) {
        candidates.push(String.fromCharCode(...payload));
      }
    }
    candidates.push(...collectAsciiImeis(manufacturer));
    candidates.push(...findZkStyleImeiInAd(manufacturer));
  }

  const raw = decodeBase64Field(device.rawScanRecord);
  if (raw) {
    candidates.push(...findZkStyleImeiInAd(raw));
  }

  if (device.serviceData) {
    for (const value of Object.values(device.serviceData)) {
      const bytes = decodeBase64Field(value);
      if (bytes) candidates.push(...collectAsciiImeis(bytes));
    }
  }

  return pickBestImei(candidates, preferredImei);
}
