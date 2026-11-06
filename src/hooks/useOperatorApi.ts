import { OperatorApi, type BluetoothCommandLogBody } from '@/services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setCachedPassword } from '@/services/passwordCache';
import { isAxiosError } from 'axios';

export const qk = {
  devices: (search?: string) => ['devices', search ?? ''] as const,
  blePassword: (deviceId: string) => ['blePassword', deviceId] as const,
};

export function useDevicesList(search?: string) {
  return useQuery({
    queryKey: qk.devices(search),
    queryFn: () => OperatorApi.listDevices({ search, limit: 50, page: 1 }),
  });
}

export function useBlePassword(deviceId: string | undefined, imei?: string) {
  return useQuery({
    queryKey: qk.blePassword(deviceId ?? ''),
    enabled: !!deviceId,
    queryFn: async () => {
      if (!deviceId) throw new Error('No device');
      const res = await OperatorApi.getBlePassword(deviceId);
      if (imei) {
        // Static passwords: keep longer for outage resilience. Dynamic: 24h.
        const ttlMs =
          res.mode === 'static' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        await setCachedPassword({
          deviceId,
          imei,
          password: res.password,
          cachedAt: Date.now(),
          ttlMs,
          mode: res.mode,
        });
      }
      return res;
    },
    retry: false,
  });
}

export function useLogBluetoothCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BluetoothCommandLogBody) => {
      try {
        return await OperatorApi.logBluetoothCommand(body);
      } catch (e) {
        const isNetwork =
          isAxiosError(e) &&
          (!e.response || e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK');
        if (isNetwork) {
          const { enqueueBluetoothLog } = await import('@/services/offlineQueue');
          await enqueueBluetoothLog(body);
          return { queued: true as const };
        }
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useSendDeviceCommand() {
  return useMutation({
    mutationFn: (args: {
      deviceId: string;
      commandType: import('@/services/api').DeviceCommandType;
    }) => OperatorApi.sendDeviceCommand(args.deviceId, args.commandType),
  });
}
