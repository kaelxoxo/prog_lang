import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useState,
} from 'react';

import { ApiError, apiRequest, errorMessage } from '../../lib/api';
import { clearSessionToken, readSessionToken, saveSessionToken } from './sessionStorage';

export type Account = {
  id: string;
  email: string;
  displayName: string;
};

type AuthContextValue = {
  session: Account | null;
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  token: string | null;
  restoreError: string | null;
  register: (input: AuthInput & { displayName: string }) => Promise<void>;
  retryRestore: () => Promise<void>;
  signIn: (input: AuthInput) => Promise<void>;
  signOut: () => Promise<void>;
};

type AuthInput = {
  email: string;
  password: string;
};

type AuthResponse = {
  token: string;
  account: Account;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Account | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const restoreSession = useCallback(async () => {
      setStatus('loading');
      setRestoreError(null);
      const savedToken = await readSessionToken();

      if (!savedToken) {
        setStatus('unauthenticated');
        return;
      }

      try {
        const response = await apiRequest<{ account: Account }>('/auth/session', {
          token: savedToken,
        });

        setToken(savedToken);
        setSession(response.account);
        setStatus('authenticated');
      } catch (restoreFailure) {
        if (restoreFailure instanceof ApiError && restoreFailure.status === 401) {
          await clearSessionToken();
          setToken(null);
          setSession(null);
          setStatus('unauthenticated');
          return;
        }

        setToken(savedToken);
        setRestoreError(errorMessage(restoreFailure));
        setStatus('error');
      }
  }, []);

  useEffect(() => {
    let isActive = true;

    if (isActive) {
      void restoreSession();
    }

    return () => {
      isActive = false;
    };
  }, [restoreSession]);

  const acceptAuthentication = useCallback(async (response: AuthResponse) => {
    await saveSessionToken(response.token);
    setToken(response.token);
    setSession(response.account);
    setRestoreError(null);
    setStatus('authenticated');
  }, []);

  const register = useCallback(
    async (input: AuthInput & { displayName: string }) => {
      const response = await apiRequest<AuthResponse>('/auth/register', {
        method: 'POST',
        body: input,
      });
      await acceptAuthentication(response);
    },
    [acceptAuthentication],
  );

  const signIn = useCallback(
    async (input: AuthInput) => {
      const response = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: input,
      });
      await acceptAuthentication(response);
    },
    [acceptAuthentication],
  );

  const signOut = useCallback(async () => {
    const currentToken = token;

    setSession(null);
    setToken(null);
    setStatus('unauthenticated');
    setRestoreError(null);
    await clearSessionToken();

    if (currentToken) {
      await apiRequest('/auth/logout', { method: 'POST', token: currentToken }).catch(() => undefined);
    }
  }, [token]);

  const value = useMemo(
    () => ({
      session,
      status,
      token,
      restoreError,
      register,
      retryRestore: restoreSession,
      signIn,
      signOut,
    }),
    [register, restoreError, restoreSession, session, signIn, signOut, status, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}
