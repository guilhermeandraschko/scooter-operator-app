import RootNavigator from '@/navigation/RootNavigator';
import useSession from '@/store/useSession';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

const queryClient = new QueryClient();

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render crash', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorTitle}>App crashed</Text>
          <Text style={styles.errorBody}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { initialize, isLoading } = useSession();

  useEffect(() => {
    initialize().catch((e) => {
      console.error('Session initialize failed', e);
    });
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Starting…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  loadingText: { marginTop: 12, color: '#333', fontSize: 16 },
  errorTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#b00020' },
  errorBody: { fontSize: 14, color: '#333', textAlign: 'center' },
});
