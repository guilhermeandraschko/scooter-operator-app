import { useDevicesList, useSendDeviceCommand } from '@/hooks/useOperatorApi';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

type Props = NativeStackScreenProps<RootStackParamList, 'FleetMap'>;

type MapPoint = {
  id: string;
  imei: string;
  name: string;
  status: string;
  battery: string;
  lat: number;
  lng: number;
  online: boolean;
};

function buildMapHtml(points: MapPoint[]): string {
  const payload = JSON.stringify(points);
  const center = points.length
    ? `[${points[0]!.lat}, ${points[0]!.lng}]`
    : '[38.72, -9.14]';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#e8eef2; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var points = ${payload};
    var map = L.map('map', { zoomControl: true }).setView(${center}, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var bounds = [];
    points.forEach(function (p) {
      var color = p.online ? '#0a7' : '#c00';
      var marker = L.circleMarker([p.lat, p.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95
      }).addTo(map);
      marker.bindTooltip(p.name, { permanent: points.length <= 12, direction: 'top', opacity: 0.95 });
      marker.on('click', function () {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'select',
            id: p.id,
            imei: p.imei,
            name: p.name,
            status: p.status,
            battery: p.battery,
            online: p.online
          }));
        }
      });
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length === 1) {
      map.setView(bounds[0], 16);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
    setTimeout(function () { map.invalidateSize(); }, 100);
  </script>
</body>
</html>`;
}

export default function FleetMapScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch, isRefetching } = useDevicesList();
  const sendCommand = useSendDeviceCommand();
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [pinging, setPinging] = useState(false);
  const bottomPad = Math.max(insets.bottom, 12);
  const pointsRef = useRef<MapPoint[]>([]);

  const points = useMemo<MapPoint[]>(() => {
    return (data?.devices ?? [])
      .filter(
        (d) =>
          d.location &&
          Number.isFinite(d.location.lat) &&
          Number.isFinite(d.location.lng)
      )
      .map((d) => ({
        id: d.id,
        imei: d.imei,
        name: d.name || d.imei,
        status: d.status ?? '—',
        battery: d.batteryLevel != null ? `${d.batteryLevel}%` : '',
        lat: d.location!.lat,
        lng: d.location!.lng,
        online: d.status === 'ONLINE',
      }));
  }, [data?.devices]);

  pointsRef.current = points;

  // Keep source identity stable across selection changes so the map does not reload.
  const html = useMemo(() => buildMapHtml(points), [points]);
  const mapSource = useMemo(() => ({ html }), [html]);

  const onPing = async () => {
    if (!selected) return;
    if (!selected.online) {
      Alert.alert(
        'Device offline',
        'Ping needs cellular ONLINE. Use Bluetooth → Locate / Warn when you are next to it.'
      );
      return;
    }
    setPinging(true);
    try {
      await sendCommand.mutateAsync({ deviceId: selected.id, commandType: 'WARN' });
      sendCommand.mutate({ deviceId: selected.id, commandType: 'IDENTIFY' });
      sendCommand.mutate({ deviceId: selected.id, commandType: 'HEADLAMP_ON' });
      setTimeout(() => {
        sendCommand.mutate({ deviceId: selected.id, commandType: 'HEADLAMP_OFF' });
      }, 3000);
      Alert.alert(
        'Ping sent',
        `${selected.name}: warning alarm + bell (if supported) + light flash.`
      );
    } catch (e) {
      Alert.alert('Ping failed', e instanceof Error ? e.message : String(e));
    } finally {
      setPinging(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{(error as Error).message}</Text>
        <Pressable onPress={() => refetch()}>
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={mapSource}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data) as Partial<MapPoint> & {
              type?: string;
            };
            if (msg.type === 'select' && msg.id && msg.imei) {
              const point = pointsRef.current.find((p) => p.id === msg.id);
              setSelected(
                point ?? {
                  id: msg.id,
                  imei: msg.imei,
                  name: msg.name || msg.imei,
                  status: msg.status || '—',
                  battery: msg.battery || '',
                  lat: 0,
                  lng: 0,
                  online: Boolean(msg.online),
                }
              );
            }
          } catch {
            // ignore
          }
        }}
      />

      {/* Overlay keeps map size fixed so marker taps still work while switching scooters */}
      <View style={[styles.overlay, { paddingBottom: bottomPad }]} pointerEvents="box-none">
        {selected ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{selected.name}</Text>
                <Text style={styles.sheetMeta}>
                  {selected.status}
                  {selected.battery ? ` · ${selected.battery}` : ''}
                </Text>
                <Text style={styles.sheetImei}>IMEI {selected.imei}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={12}>
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryBtn, pinging && styles.btnDisabled]}
                onPress={onPing}
                disabled={pinging}
              >
                <Text style={styles.primaryBtnText}>{pinging ? 'Pinging…' : 'Ping'}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                  navigation.navigate('BleControl', {
                    deviceId: selected.id,
                    imei: selected.imei,
                    name: selected.name,
                  })
                }
              >
                <Text style={styles.secondaryBtnText}>Open BLE</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {points.length} with location · tap a marker for info
              {isRefetching ? ' · refreshing…' : ''}
            </Text>
            <Pressable onPress={() => refetch()}>
              <Text style={styles.link}>Refresh</Text>
            </Pressable>
            {points.length === 0 ? (
              <Text style={styles.meta}>No GPS yet — devices need location reports (FRI)</Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: 'crimson', marginBottom: 12, textAlign: 'center' },
  link: { color: '#0a7', fontWeight: '600' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    marginHorizontal: 10,
    marginBottom: 4,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  footerText: { color: '#333', fontWeight: '500' },
  meta: { color: '#666', fontSize: 12 },
  sheet: {
    marginHorizontal: 10,
    marginBottom: 4,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 12,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  sheetMeta: { marginTop: 2, color: '#444' },
  sheetImei: { marginTop: 2, color: '#777', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0a7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#333', fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});
