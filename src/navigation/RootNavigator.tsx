import BleControlScreen from '@/screens/BleControlScreen';
import FleetMapScreen from '@/screens/FleetMapScreen';
import HomeScreen from '@/screens/HomeScreen';
import LoginScreen from '@/screens/LoginScreen';
import useSession from '@/store/useSession';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  FleetMap: undefined;
  BleControl: { deviceId: string; imei: string; name?: string | null };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthed } = useSession();

  return (
    <Stack.Navigator>
      {!isAuthed ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Devices' }} />
          <Stack.Screen name="FleetMap" component={FleetMapScreen} options={{ title: 'Map' }} />
          <Stack.Screen
            name="BleControl"
            component={BleControlScreen}
            options={{ title: 'Bluetooth' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
