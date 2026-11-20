import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { ApiClient } from '../api/client';
import type { LoginResponse, User } from '../api/types';
import { normalizeBaseUrl, type ServerUrls } from '../config/urls';
import { api, initialServerUrls, sessionStore } from './sessionStore';

const TOKEN_KEY = 'softgeneral_token';
const SERVER_KEY = 'softgeneral_server';

interface SessionValue {
  ready: boolean;
  user: User | null;
  token: string | null;
  server: ServerUrls;
  api: ApiClient;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  saveServer: (urls: ServerUrls) => Promise<void>;
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [server, setServer] = useState<ServerUrls>(initialServerUrls);

  const applyToken = useCallback((value: string | null) => {
    sessionStore.setToken(value);
    setToken(value);
  }, []);

  const applyServer = useCallback((value: ServerUrls) => {
    sessionStore.setServer(value);
    setServer(value);
  }, []);

  const logout = useCallback(async () => {
    applyToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, [applyToken]);

  useEffect(() => {
    sessionStore.setUnauthorizedHandler(() => {
      void logout();
    });
  }, [logout]);

  // Restore saved server and session on launch.
  useEffect(() => {
    (async () => {
      try {
        const savedServer = await AsyncStorage.getItem(SERVER_KEY);
        if (savedServer) applyServer(JSON.parse(savedServer) as ServerUrls);
        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (savedToken) {
          sessionStore.setToken(savedToken);
          const me = await api.request<User>('/auth/me');
          applyToken(savedToken);
          setUser(me);
        }
      } catch {
        // expired token or unreachable server: start logged out
        sessionStore.setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, [applyServer, applyToken]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const response = await api.request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      await SecureStore.setItemAsync(TOKEN_KEY, response.access_token);
      applyToken(response.access_token);
      setUser(response.user);
    },
    [applyToken],
  );

  const saveServer = useCallback(
    async (urls: ServerUrls) => {
      const normalized = {
        apiUrl: normalizeBaseUrl(urls.apiUrl),
        mediamtxUrl: normalizeBaseUrl(urls.mediamtxUrl),
      };
      applyServer(normalized);
      await AsyncStorage.setItem(SERVER_KEY, JSON.stringify(normalized));
    },
    [applyServer],
  );

  const can = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ ready, user, token, server, api, login, logout, saveServer, can }),
    [ready, user, token, server, login, logout, saveServer, can],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
