import { API_BASE_URL } from '@/config/api';
import useSession from '@/store/useSession';
import axios, { AxiosError } from 'axios';

export type ApiErrorBody = {
  error?: string;
  message?: string;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const key = useSession.getState().apiKey;
  if (key) {
    config.headers['X-API-Key'] = key;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      await useSession.getState().logout();
    }
    return Promise.reject(error);
  }
);

export async function handle<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    const response = await promise;
    return response.data;
  } catch (err) {
    const error = err as AxiosError<ApiErrorBody>;
    const status = error.response?.status;
    const msg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Request failed';
    if (status === 401) throw new Error('Invalid or expired API key. Please sign in again.');
    if (status === 403) throw new Error(msg || 'Forbidden');
    if (status === 404) throw new Error(msg || 'Not found');
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network')) {
      throw new Error('Network error. Check EXPO_PUBLIC_API_BASE_URL and connectivity.');
    }
    throw new Error(msg);
  }
}

export type DeviceDto = {
  id: string;
  imei: string;
  name?: string | null;
  status?: string;
  macAddress?: string | null;
  batteryLevel?: number | null;
  lastSeen?: string | null;
  location?: { lat: number; lng: number } | null;
};

export type DevicesListResponse = {
  devices: DeviceDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type BlePasswordResponse = {
  password: string;
  mode?: 'static' | 'dynamic';
  lastUpdated?: string;
  otaSentAt?: string | null;
};

/** Matches scooter-server CommandStatus for bluetooth log route */
export type BluetoothCommandLogBody = {
  deviceId: string;
  commandType: string;
  payload?: string;
  response?: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
};

export type DeviceCommandType =
  | 'IDENTIFY'
  | 'WARN'
  | 'HEADLAMP_ON'
  | 'HEADLAMP_OFF'
  | 'LOCATE'
  | 'QUERY_STATUS';

export const OperatorApi = {
  health: () => handle(api.get<{ status?: string }>('/api/health')),
  listDevices: (params?: { search?: string; limit?: number; page?: number }) =>
    handle(api.get<DevicesListResponse>('/api/devices', { params })),
  getBlePassword: (deviceId: string) =>
    handle(api.get<BlePasswordResponse>(`/api/bluetooth/devices/${deviceId}/password`)),
  logBluetoothCommand: (body: BluetoothCommandLogBody) =>
    handle(api.post<{ id?: string }>('/api/bluetooth/commands', body)),
  sendDeviceCommand: (deviceId: string, commandType: DeviceCommandType) =>
    handle(
      api.post<{ id?: string; status?: string }>(`/api/devices/${deviceId}/commands`, {
        commandType,
      })
    ),
};

export { api };
