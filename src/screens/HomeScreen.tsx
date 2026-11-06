import { useDevicesList, useSendDeviceCommand } from '@/hooks/useOperatorApi';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { DeviceDto } from '@/services/api';
import { flushOfflineQueue } from '@/services/offlineQueue';
import useSession from '@/store/useSession';
import NetInfo from '@react-native-community/netinfo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');
  const [pingingId, setPingingId] = useState<string | null>(null);
  const logout = useSession((s) => s.logout);
  const { data, isLoading, refetch, isRefetching, error } = useDevicesList(
    search.trim() || undefined
  );
  const sendCommand = useSendDeviceCommand();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('FleetMap')} style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontWeight: '600', color: '#0a7' }}>Map</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const flush = useCallback(async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;
    const r = await flushOfflineQueue();
    if (r.flushed > 0) {
      console.log(`Flushed ${r.flushed} offline command log(s)`);
    }
  }, []);

  useEffect(() => {
    flush();
  }, [flush]);

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => {
      if (s.isConnected) flush();
    });
    return () => sub();
  }, [flush]);

  const onPing = async (item: DeviceDto) => {
    if (item.status !== 'ONLINE') {
      Alert.alert(
        'Device offline',
        'Ping needs cellular ONLINE. Use Bluetooth → Locate / Warn when you are next to it.'
      );
      return;
    }
    setPingingId(item.id);
    try {
      // WARN usually has sound; EBELL (IDENTIFY) is not supported on all firmwares.
      // Light flash is a visible backup.
      await sendCommand.mutateAsync({ deviceId: item.id, commandType: 'WARN' });
      sendCommand.mutate({ deviceId: item.id, commandType: 'IDENTIFY' });
      sendCommand.mutate({ deviceId: item.id, commandType: 'HEADLAMP_ON' });
      setTimeout(() => {
        sendCommand.mutate({ deviceId: item.id, commandType: 'HEADLAMP_OFF' });
      }, 3000);
      Alert.alert(
        'Ping sent',
        `${item.name || item.imei}: warning alarm + bell (if supported) + light flash.`
      );
    } catch (e) {
      Alert.alert('Ping failed', e instanceof Error ? e.message : String(e));
    } finally {
      setPingingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextInput
          style={styles.search}
          placeholder="Search IMEI / name"
          autoCapitalize="none"
          value={search}
          onChangeText={setSearch}
        />
        <Pressable style={styles.outline} onPress={() => logout()}>
          <Text>Sign out</Text>
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error}>{(error as Error).message}</Text>
      ) : null}
      {isLoading ? (
        <ActivityIndicator style={styles.center} />
      ) : (
        <FlatList
          data={data?.devices ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
          ListEmptyComponent={<Text style={styles.empty}>No devices</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                onPress={() =>
                  navigation.navigate('BleControl', {
                    deviceId: item.id,
                    imei: item.imei,
                    name: item.name,
                  })
                }
              >
                <Text style={styles.cardTitle}>{item.name || item.imei}</Text>
                <Text style={styles.cardSub}>IMEI {item.imei}</Text>
                <Text style={styles.cardSub}>
                  Status {item.status ?? '—'}
                  {item.batteryLevel != null ? ` · ${item.batteryLevel}%` : ''}
                </Text>
                {item.location ? (
                  <Text style={styles.cardSub}>
                    Loc {item.location.lat.toFixed(5)}, {item.location.lng.toFixed(5)}
                  </Text>
                ) : null}
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  style={[
                    styles.pingBtn,
                    (item.status !== 'ONLINE' || pingingId === item.id) && styles.pingDisabled,
                  ]}
                  disabled={pingingId === item.id}
                  onPress={() => onPing(item)}
                >
                  <Text style={styles.pingText}>
                    {pingingId === item.id ? 'Pinging…' : 'Ping'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.bleBtn}
                  onPress={() =>
                    navigation.navigate('BleControl', {
                      deviceId: item.id,
                      imei: item.imei,
                      name: item.name,
                    })
                  }
                >
                  <Text>BLE</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  outline: { padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  center: { marginTop: 24 },
  error: { color: 'crimson', marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 24, color: '#666' },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#555', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pingBtn: {
    backgroundColor: '#0a7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  pingDisabled: { opacity: 0.45 },
  pingText: { color: '#fff', fontWeight: '600' },
  bleBtn: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
});
