import { extractImeiFromDevice, describeAdvertisement, deviceLooksLikeZkScooter, deviceMatchesTargetImei } from '@/ble/imei';
import { getBleManager } from '@/ble/manager';
import { OperatorBleSession } from '@/ble/OperatorBleSession';
import { requestAndroidBlePermissions } from '@/ble/permissions';
import { useBlePassword, useLogBluetoothCommand } from '@/hooks/useOperatorApi';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { BluetoothCommands } from '@/protocol/bluetooth-protocol';
import { getCachedPassword } from '@/services/passwordCache';
import { getCachedBleDeviceId, setCachedBleDeviceId } from '@/services/bleDeviceCache';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Device } from 'react-native-ble-plx';
import { ScanMode } from 'react-native-ble-plx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'BleControl'>;

type Discovered = {
  id: string;
  name: string;
  rssi: number | null;
  imeiGuess: string | null;
  likelyZk: boolean;
  matchesTarget: boolean;
  adDebug: string;
};

export default function BleControlScreen({ route }: Props) {
  const { deviceId, imei, name } = route.params;
  const [manualPassword, setManualPassword] = useState('');
  const [cachedPw, setCachedPw] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showAllBle, setShowAllBle] = useState(false);
  const [session, setSession] = useState<OperatorBleSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [lastBleId, setLastBleId] = useState<string | null>(null);
  const devicesById = useRef<Map<string, Device>>(new Map());
  const loggedScanIds = useRef<Set<string>>(new Set());
  const scanStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pwQuery = useBlePassword(deviceId, imei);
  const logMutation = useLogBluetoothCommand();

  useEffect(() => {
    getCachedPassword(imei).then((c) => {
      if (c?.password) setCachedPw(c.password);
    });
    getCachedBleDeviceId(imei).then((c) => {
      if (c?.id) setLastBleId(c.id);
    });
  }, [imei]);

  useEffect(() => {
    return () => {
      if (scanStopRef.current) clearTimeout(scanStopRef.current);
    };
  }, []);

  // Disconnect only on screen unmount — not whenever `session` identity changes
  // (that was clearing the session / leaving busy UI inconsistent after reconnect).
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect().catch(() => undefined);
    };
  }, []);

  const effectivePassword = useMemo(() => {
    if (manualPassword.trim()) return manualPassword.trim();
    if (pwQuery.data?.password) return pwQuery.data.password;
    if (cachedPw) return cachedPw;
    return '';
  }, [manualPassword, pwQuery.data?.password, cachedPw]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-40), line]);
  }, []);

  const logCommandInBackground = (
    commandType: string,
    payload: string,
    response: string,
    status: 'COMPLETED' | 'FAILED'
  ) => {
    logMutation.mutate(
      { deviceId, commandType, payload, response, status },
      {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          appendLog(`log skip: ${msg}`);
        },
      }
    );
  };

  const runBleCommand = async (commandType: string, build: () => string) => {
    if (!session) {
      Alert.alert('Not connected', 'Connect to the scooter over BLE first.');
      return;
    }
    if (!effectivePassword) {
      Alert.alert('Password', 'Fetch password while online or enter it manually.');
      return;
    }
    setBusy(true);
    const cmd = build();
    appendLog(`> ${cmd}`);
    try {
      const result = await session.sendAndWaitAck(cmd);
      const ackStr = result.ackLines.join(' | ');
      appendLog(`< ${ackStr}`);
      // Free the action buttons immediately — don't wait on server logging
      // (offline / slow API was leaving buttons gray after a successful unlock).
      setBusy(false);
      logCommandInBackground(commandType, cmd, ackStr, 'COMPLETED');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(`! ${msg}`);
      setBusy(false);
      logCommandInBackground(commandType, cmd, msg, 'FAILED');
    }
  };

  const onScan = async () => {
    const ok = await requestAndroidBlePermissions();
    if (!ok) {
      Alert.alert('Permissions', 'Bluetooth and location permissions are required.');
      return;
    }
    const manager = getBleManager();
    const st = await manager.state();
    if (st !== 'PoweredOn') {
      Alert.alert('Bluetooth', 'Please turn on Bluetooth.');
      return;
    }

    if (scanStopRef.current) clearTimeout(scanStopRef.current);
    devicesById.current.clear();
    loggedScanIds.current.clear();
    setDiscovered([]);
    setScanning(true);

    // Unfiltered scan: Android often omits service UUID from ads, so a
    // 0x2C00 filter would hide the scooter. We rank ZK-like devices in UI.
    manager.startDeviceScan(
      null,
      { allowDuplicates: true, scanMode: ScanMode.LowLatency, legacyScan: true },
      (error, device) => {
      if (error) {
        appendLog(`scan err ${error.message}`);
        return;
      }
      if (!device) return;
      devicesById.current.set(device.id, device);
      const guess = extractImeiFromDevice(device, imei);
      const ad = describeAdvertisement(device, imei);
      const likelyZk = ad.likelyZk || deviceLooksLikeZkScooter(device);
      const matchesTarget =
        guess === imei || deviceMatchesTargetImei(device, imei);
      const entry: Discovered = {
        id: device.id,
        name: device.name ?? device.localName ?? '(no name)',
        rssi: device.rssi,
        imeiGuess: guess,
        likelyZk,
        matchesTarget,
        adDebug: `mfg=${ad.mfgLen} raw=${ad.rawLen} uuid=${ad.serviceUuids}\nmfg:${ad.mfgHex}\nraw:${ad.rawHex}`,
      };
      if (!loggedScanIds.current.has(device.id)) {
        loggedScanIds.current.add(device.id);
        appendLog(
          `scan ${entry.name} rssi=${entry.rssi ?? '—'} imei=${guess ?? 'none'} match=${matchesTarget ? 'y' : 'n'} zk=${likelyZk ? 'y' : 'n'} mfg=${ad.mfgLen}`
        );
        if (!guess && (matchesTarget || likelyZk) && (ad.mfgLen > 0 || ad.rawLen > 0)) {
          appendLog(`  mfg:${ad.mfgHex}`);
          appendLog(`  raw:${ad.rawHex}`);
        }
      }
      setDiscovered((prev) => {
        const others = prev.filter((p) => p.id !== entry.id);
        const next = [...others, entry];
        next.sort((a, b) => {
          const aMatch = a.matchesTarget ? 0 : 1;
          const bMatch = b.matchesTarget ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          const aPref =
            a.imeiGuess && imei && a.imeiGuess.startsWith(imei.slice(0, 2)) ? 0 : 1;
          const bPref =
            b.imeiGuess && imei && b.imeiGuess.startsWith(imei.slice(0, 2)) ? 0 : 1;
          if (aPref !== bPref) return aPref - bPref;
          const aZk = a.likelyZk ? 0 : 1;
          const bZk = b.likelyZk ? 0 : 1;
          if (aZk !== bZk) return aZk - bZk;
          const aHas = a.imeiGuess ? 0 : 1;
          const bHas = b.imeiGuess ? 0 : 1;
          if (aHas !== bHas) return aHas - bHas;
          return (b.rssi ?? -999) - (a.rssi ?? -999);
        });
        return next;
      });
    });

    scanStopRef.current = setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
      scanStopRef.current = null;
    }, 20000);
  };

  const connectTo = async (d: Discovered) => {
    const device = devicesById.current.get(d.id);
    if (!device) {
      Alert.alert('Device', 'Stale scan result — run scan again.');
      return;
    }
    setBusy(true);
    try {
      if (session) {
        await session.disconnect();
        setSession(null);
      }
      const manager = getBleManager();
      const s = new OperatorBleSession(manager, device);
      await s.connect();
      setSession(s);
      await setCachedBleDeviceId(imei, d.id, d.name);
      setLastBleId(d.id);
      appendLog(`Connected ${d.name} (cached id ${d.id})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Connect failed', msg);
    } finally {
      setBusy(false);
    }
  };

  const connectLastKnown = async () => {
    if (!lastBleId) {
      Alert.alert('No cached BLE id', 'Connect once via scan first.');
      return;
    }
    const ok = await requestAndroidBlePermissions();
    if (!ok) {
      Alert.alert('Permissions', 'Bluetooth and location permissions are required.');
      return;
    }
    setBusy(true);
    try {
      if (session) {
        await session.disconnect();
        setSession(null);
      }
      const manager = getBleManager();
      manager.stopDeviceScan();
      const device = await manager.connectToDevice(lastBleId, { timeout: 15000 });
      devicesById.current.set(device.id, device);
      const s = new OperatorBleSession(manager, device);
      await s.connect();
      setSession(s);
      appendLog(`Reconnected last known ${lastBleId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'Reconnect failed',
        `${msg}\n\nIf the scooter is ONLINE on cellular but invisible on BLE, ask admin to send “Force discoverable (GTBTS)” from the dashboard, then scan again.`
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await session.disconnect();
      setSession(null);
      appendLog('Disconnected');
    } finally {
      setBusy(false);
    }
  };

  const visibleDevices = useMemo(() => {
    const exact = discovered.filter((d) => d.matchesTarget);
    if (exact.length > 0 && !showAllBle) return exact;
    if (showAllBle || exact.length === 0) return discovered;
    return exact;
  }, [discovered, showAllBle]);

  const hasExactMatch = discovered.some((d) => d.matchesTarget);
  const targetPrefix = imei.slice(0, 2);
  const nameHint = imei.slice(-8);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{name || imei}</Text>
      <Text style={styles.meta}>IMEI {imei}</Text>
      <Text style={styles.meta}>Device ID {deviceId}</Text>

      <Text style={styles.section}>BLE password</Text>
      {pwQuery.isLoading ? <ActivityIndicator /> : null}
      {pwQuery.isError ? (
        <Text style={styles.warn}>
          Server password unavailable. If this scooter was not provisioned yet,
          ask an admin to run ensure-ble-passwords. You can still type a manual
          password below.
        </Text>
      ) : null}
      {pwQuery.data?.password ? (
        <Text style={styles.ok}>
          Loaded from server
          {pwQuery.data.mode ? ` (${pwQuery.data.mode})` : ''}
        </Text>
      ) : null}
      {cachedPw && !pwQuery.data?.password ? (
        <Text style={styles.ok}>Using cached password</Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Manual BLE password (break-glass only)"
        autoCapitalize="none"
        value={manualPassword}
        onChangeText={setManualPassword}
      />

      <Text style={styles.section}>Connection</Text>
      <Text style={styles.match}>
        Look for BLE name “{nameHint}” (broadcast) or full IMEI {imei}
      </Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.btn, scanning && styles.btnDisabled]}
          disabled={scanning || busy}
          onPress={onScan}
        >
          <Text style={styles.btnText}>{scanning ? 'Scanning…' : 'Scan 20s'}</Text>
        </Pressable>
        <Pressable
          style={[styles.btnSecondary, (!lastBleId || busy) && styles.btnDisabled]}
          onPress={connectLastKnown}
          disabled={!lastBleId || busy}
        >
          <Text>Reconnect last</Text>
        </Pressable>
        <Pressable style={styles.btnSecondary} onPress={disconnect} disabled={!session || busy}>
          <Text>Disconnect</Text>
        </Pressable>
      </View>
      {lastBleId ? (
        <Text style={styles.meta}>Cached BLE id {lastBleId}</Text>
      ) : (
        <Text style={styles.meta}>No cached BLE id yet — connect once via scan</Text>
      )}
      {session ? <Text style={styles.ok}>BLE connected</Text> : null}

      {discovered.length > 0 && !hasExactMatch ? (
        <Text style={styles.warn}>
          No match for IMEI {imei} / name …{nameHint}. Showing all BLE. If the scooter
          is ONLINE on cellular but invisible here, ask admin for “Force discoverable
          (GTBTS)” on the dashboard — advertising can stop after network reconnect.
        </Text>
      ) : null}

      {discovered.length > 0 ? (
        <Pressable onPress={() => setShowAllBle((v) => !v)}>
          <Text style={styles.meta}>
            {hasExactMatch && !showAllBle
              ? `Showing match only · tap to show all (${discovered.length})`
              : hasExactMatch && showAllBle
                ? 'Showing all BLE · tap for match only'
                : `Showing all ${discovered.length} BLE · look for name …${nameHint}`}
          </Text>
        </Pressable>
      ) : null}

      {visibleDevices.map((d) => (
        <Pressable key={d.id} style={styles.card} onPress={() => connectTo(d)}>
          <Text style={styles.cardTitle}>{d.name}</Text>
          <Text style={styles.cardSub}>
            {d.imeiGuess ? `IMEI ${d.imeiGuess}` : 'IMEI not in ad'} · RSSI{' '}
            {d.rssi ?? '—'}
            {d.likelyZk ? ' · ZK?' : ''}
          </Text>
          {d.matchesTarget ? <Text style={styles.match}>Matches target scooter</Text> : null}
          {d.imeiGuess &&
          !d.matchesTarget &&
          d.imeiGuess.startsWith(targetPrefix) ? (
            <Text style={styles.meta}>Same TAC ({targetPrefix}…) — not exact match</Text>
          ) : null}
          {!d.imeiGuess || d.likelyZk || d.matchesTarget ? (
            <Text style={styles.adDebug}>{d.adDebug}</Text>
          ) : null}
        </Pressable>
      ))}

      <Text style={styles.section}>Actions</Text>
      {session && busy ? (
        <Text style={styles.meta}>Waiting for scooter ACK…</Text>
      ) : null}
      {session && !effectivePassword ? (
        <Text style={styles.warn}>
          Connected, but no BLE password loaded — enter one above or fetch while online.
        </Text>
      ) : null}
      {!session ? (
        <Text style={styles.meta}>Connect over BLE to enable actions.</Text>
      ) : null}
      <View style={styles.grid}>
        <ActionButton
          title="Locate / ring"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKLOC', () => BluetoothCommands.locateScooter(effectivePassword))
          }
        />
        <ActionButton
          title="Warn alarm"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKWRN', () => BluetoothCommands.warning(effectivePassword))
          }
        />
        <ActionButton
          title="Light on"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKLED_1', () => BluetoothCommands.ledControl(effectivePassword, 0, 1))
          }
        />
        <ActionButton
          title="Light off"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKLED_0', () => BluetoothCommands.ledControl(effectivePassword, 0, 0))
          }
        />
        <ActionButton
          title="Unlock ECU"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKSCT_0', () => BluetoothCommands.lockUnlock(effectivePassword, 0))
          }
        />
        <ActionButton
          title="Lock ECU"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKSCT_1', () => BluetoothCommands.lockUnlock(effectivePassword, 1))
          }
        />
        <ActionButton
          title="Unlock battery"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKSCT_10', () => BluetoothCommands.lockUnlock(effectivePassword, 10))
          }
        />
        <ActionButton
          title="Lock battery"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKSCT_11', () => BluetoothCommands.lockUnlock(effectivePassword, 11))
          }
        />
        <ActionButton
          title="Query info"
          disabled={busy || !session || !effectivePassword}
          onPress={() =>
            runBleCommand('BLE_BKINF', () => BluetoothCommands.queryInfo(effectivePassword))
          }
        />
      </View>

      <Text style={styles.section}>Log</Text>
      {log.map((l, i) => (
        <Text key={`${i}-${l.slice(0, 12)}`} style={styles.logLine}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
}

function ActionButton(props: {
  title: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.action, props.disabled && styles.btnDisabled]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={styles.actionText}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, paddingBottom: 48 },
  heading: { fontSize: 20, fontWeight: '700' },
  meta: { fontSize: 13, color: '#555', marginTop: 4 },
  section: { marginTop: 20, marginBottom: 8, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { backgroundColor: '#007AFF', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  ok: { color: 'green', marginBottom: 8 },
  warn: { color: '#b35c00', marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardTitle: { fontWeight: '600' },
  cardSub: { fontSize: 12, color: '#666', marginTop: 4 },
  match: { color: 'green', marginTop: 4, fontWeight: '600' },
  adDebug: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    backgroundColor: '#222',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: '45%',
    flexGrow: 1,
  },
  actionText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  logLine: { fontFamily: 'monospace', fontSize: 11, color: '#333', marginBottom: 2 },
});
