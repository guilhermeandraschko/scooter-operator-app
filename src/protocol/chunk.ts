/** BLE user characteristic limit per ZK spec (bytes per write). */
export const BLE_MAX_CHUNK_BYTES = 20;

/**
 * Split a full BLE line (including CRLF) into UTF-8-safe segments of at most maxBytes each.
 */
export function chunkBleMessage(fullLine: string, maxBytes = BLE_MAX_CHUNK_BYTES): string[] {
  const full = new TextEncoder().encode(fullLine);
  if (full.length <= maxBytes) {
    return [fullLine];
  }
  const chunks: string[] = [];
  let i = 0;
  while (i < full.length) {
    let take = Math.min(maxBytes, full.length - i);
    let slice = full.subarray(i, i + take);
    while (take > 0) {
      try {
        const s = new TextDecoder('utf-8', { fatal: true }).decode(slice);
        chunks.push(s);
        i += take;
        break;
      } catch {
        take -= 1;
        slice = full.subarray(i, i + take);
      }
    }
    if (take === 0) {
      chunks.push(String.fromCharCode(full[i]!));
      i += 1;
    }
  }
  return chunks;
}
