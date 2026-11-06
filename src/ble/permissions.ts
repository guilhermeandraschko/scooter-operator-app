import { PermissionsAndroid, Platform } from 'react-native';

const BT_SCAN = 'android.permission.BLUETOOTH_SCAN' as const;
const BT_CONNECT = 'android.permission.BLUETOOTH_CONNECT' as const;
const FINE_LOC = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

export async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const api = Platform.Version;
  if (typeof api === 'number' && api >= 31) {
    const scan = await PermissionsAndroid.request(BT_SCAN as never, {
      title: 'Bluetooth scan',
      message: 'Required to find scooters nearby.',
      buttonPositive: 'OK',
    });
    const conn = await PermissionsAndroid.request(BT_CONNECT as never, {
      title: 'Bluetooth connect',
      message: 'Required to connect to a scooter.',
      buttonPositive: 'OK',
    });
    const loc = await PermissionsAndroid.request(FINE_LOC, {
      title: 'Location',
      message: 'Android requires location permission for Bluetooth scanning on some devices.',
      buttonPositive: 'OK',
    });
    return (
      scan === PermissionsAndroid.RESULTS.GRANTED &&
      conn === PermissionsAndroid.RESULTS.GRANTED &&
      loc === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const loc = await PermissionsAndroid.request(FINE_LOC, {
    title: 'Location',
    message: 'Required for Bluetooth scanning.',
    buttonPositive: 'OK',
  });
  return loc === PermissionsAndroid.RESULTS.GRANTED;
}
