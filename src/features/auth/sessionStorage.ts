import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'alaga.session-token';

export async function readSessionToken() {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(SESSION_TOKEN_KEY) ?? null;
  }

  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function saveSessionToken(token: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(SESSION_TOKEN_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(SESSION_TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
