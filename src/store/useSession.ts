import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const API_KEY_STORAGE = '@operator:api_key';

type SessionState = {
  isAuthed: boolean;
  apiKey: string | undefined;
  isLoading: boolean;
  setApiKey: (key: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
};

const useSession = create<SessionState>((set) => ({
  isAuthed: false,
  apiKey: undefined,
  isLoading: true,

  setApiKey: async (key: string) => {
    const trimmed = key.trim();
    await AsyncStorage.setItem(API_KEY_STORAGE, trimmed);
    set({ isAuthed: true, apiKey: trimmed });
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem(API_KEY_STORAGE);
    } catch (e) {
      console.error('Failed to remove API key:', e);
    }
    set({ isAuthed: false, apiKey: undefined });
  },

  initialize: async () => {
    try {
      const key = await AsyncStorage.getItem(API_KEY_STORAGE);
      if (key) {
        set({ isAuthed: true, apiKey: key, isLoading: false });
      } else {
        set({ isAuthed: false, apiKey: undefined, isLoading: false });
      }
    } catch (e) {
      console.error('Failed to load API key:', e);
      set({ isAuthed: false, apiKey: undefined, isLoading: false });
    }
  },
}));

export default useSession;
