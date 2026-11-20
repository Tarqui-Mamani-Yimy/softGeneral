import React, { useState, useEffect, useCallback } from 'react';
import type { User, LoginCredentials } from '../types/auth';
import { AuthContext } from './authContextDef';
import {
  getAuthToken,
  setAuthToken,
  setUnauthorizedCallback,
  loginUser,
  getMe,
} from '../services/apiClient';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => getAuthToken());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedCallback(logout);
    return () => {
      setUnauthorizedCallback(null);
    };
  }, [logout]);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = getAuthToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await getMe();
        setUser(userData);
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [logout]);

  const login = async (credentials: LoginCredentials) => {
    const res = await loginUser(credentials);
    setAuthToken(res.access_token);
    setTokenState(res.access_token);
    setUser(res.user);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
