import { API_BASE_URL } from '@/config/api';
import { OperatorApi } from '@/services/api';
import useSession from '@/store/useSession';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function LoginScreen() {
  const [key, setKey] = useState('');
  const setApiKey = useSession((s) => s.setApiKey);
  const logout = useSession((s) => s.logout);

  const login = useMutation({
    mutationFn: async (apiKey: string) => {
      await setApiKey(apiKey);
      await OperatorApi.listDevices({ limit: 1 });
    },
    onError: async (e: Error) => {
      await logout();
      Alert.alert('Sign in failed', e.message ?? 'Could not validate API key');
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scooter Operator</Text>
      <Text style={styles.hint}>Paste your operator API key.</Text>
      <Text style={styles.url}>
        {API_BASE_URL ? `Server: ${API_BASE_URL}` : 'Set EXPO_PUBLIC_API_BASE_URL in .env'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="API key"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={key}
        onChangeText={setKey}
      />
      <Pressable
        style={[styles.button, (!key.trim() || !API_BASE_URL || login.isPending) && styles.buttonDisabled]}
        disabled={!key.trim() || !API_BASE_URL || login.isPending}
        onPress={() => login.mutate(key.trim())}
      >
        {login.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 14, color: '#444', marginBottom: 4 },
  url: { fontSize: 12, color: '#666', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
