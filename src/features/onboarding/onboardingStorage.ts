import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ONBOARDING_KEY = 'alaga.onboarding_completed_v1';

export async function readHasSeenOnboarding(): Promise<boolean> {
  try {
    const saved = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(ONBOARDING_KEY)
      : await SecureStore.getItemAsync(ONBOARDING_KEY);
    return saved === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(ONBOARDING_KEY, 'true');
      return;
    }
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
  } catch {
    // Graceful fallback
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(ONBOARDING_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
  } catch {
    // Ignore
  }
}
