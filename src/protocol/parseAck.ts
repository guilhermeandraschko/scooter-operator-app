import { parseBluetoothAck } from './bluetooth-protocol';

/** Append device bytes, emit complete lines ending in \r\n */
export function appendBleRxBuffer(prev: string, chunk: string): { buffer: string; lines: string[] } {
  const combined = prev + chunk;
  const lines: string[] = [];
  const re = /\r?\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    const line = combined.slice(last, m.index).trim();
    if (line.length) lines.push(line);
    last = m.index + m[0].length;
  }
  return { buffer: combined.slice(last), lines };
}

/** Parse "+ACK:BKSCT,..." into ack type and numeric params param1.. */
export function parseAckLine(line: string): {
  ackType: string;
  params: Record<string, unknown>;
} | null {
  if (!line.startsWith('+ACK:')) return null;
  const firstComma = line.indexOf(',');
  const ackType = firstComma > 0 ? line.slice(0, firstComma) : line;
  const rest = firstComma > 0 ? line.slice(firstComma + 1) : '';
  const parts = rest.length ? rest.split(',') : [];
  const params: Record<string, unknown> = {};
  parts.forEach((p, i) => {
    const n = Number(p);
    params[`param${i + 1}`] = Number.isFinite(n) ? n : p;
  });
  return { ackType, params };
}

export function interpretAckLine(line: string) {
  const parsed = parseAckLine(line);
  if (!parsed) return { ok: false as const, raw: line };
  const result = parseBluetoothAck(parsed.ackType, parsed.params);
  return { ok: true as const, ackType: parsed.ackType, result, raw: line };
}
