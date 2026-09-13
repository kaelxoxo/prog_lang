import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { resolveApiUrl } from './apiUrl';
import type { AssistantQueryRequest, AssistantQueryResponse } from '../features/assistant/types';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const usesAutomaticDevelopmentApi = __DEV__ && (!configuredApiUrl || configuredApiUrl.toLowerCase() === 'auto');
const apiUrl = resolveApiUrl({
  configuredUrl: configuredApiUrl,
  developmentHostUri: Constants.expoConfig?.hostUri,
  isDevelopment: __DEV__,
  platform: Platform.OS,
});
const REQUEST_TIMEOUT_MS = 15_000;

type ApiRequestOptions = {
  body?: unknown;
  method?: 'GET' | 'POST';
  token?: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'auth' | 'server' | 'timeout' | 'unavailable' = 'server',
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Alaga took too long to respond. Try again.', 0, 'timeout');
    }
    throw new ApiError(
      usesAutomaticDevelopmentApi
        ? 'Alaga cannot reach its service. Keep the service running on this computer and keep both devices on the same Wi-Fi.'
        : 'Alaga cannot reach its service right now. Your internet may still be working.',
      0,
      'unavailable',
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };

  if (!response.ok) {
    throw new ApiError(
      typeof payload.error === 'string' ? payload.error : 'Alaga could not complete that request. Try again.',
      response.status,
      response.status === 401 ? 'auth' : 'server',
    );
  }

  return payload as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

export async function queryAssistant(
  patientId: string,
  request: AssistantQueryRequest,
  token?: string | null,
): Promise<AssistantQueryResponse> {
  return apiRequest<AssistantQueryResponse>(`/patients/${encodeURIComponent(patientId)}/assistant/query`, {
    method: 'POST',
    body: request,
    token,
  });
}

