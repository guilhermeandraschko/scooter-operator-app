/**
 * Fleet API base URL. Set `EXPO_PUBLIC_API_BASE_URL` in `.env`.
 * No production host is hardcoded.
 */
const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
export const API_BASE_URL = raw.replace(/\/$/, '');
