import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Locale } from './translations';

const LOCALE_KEY = 'alaga.locale';

export async function readLocale(): Promise<Locale> {
  const saved = Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(LOCALE_KEY)
    : await SecureStore.getItemAsync(LOCALE_KEY);
  return saved === 'fil' ? 'fil' : 'en';
}

export async function saveLocale(locale: Locale) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(LOCALE_KEY, locale);
    return;
  }
  await SecureStore.setItemAsync(LOCALE_KEY, locale);
}
