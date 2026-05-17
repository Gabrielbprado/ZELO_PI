import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Native platforms get hardware-backed storage (Keychain / Keystore via
 * `expo-secure-store`); web falls back to `AsyncStorage`, which on the
 * web target is implemented over `localStorage`.
 */
const useSecureStorage = Platform.OS === 'ios' || Platform.OS === 'android';

export async function get(key: string): Promise<string | null> {
  return useSecureStorage ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);
}

export async function set(key: string, value: string): Promise<void> {
  if (useSecureStorage) return SecureStore.setItemAsync(key, value);
  return AsyncStorage.setItem(key, value);
}

export async function remove(key: string): Promise<void> {
  if (useSecureStorage) return SecureStore.deleteItemAsync(key);
  return AsyncStorage.removeItem(key);
}
