"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiClient, loadTokens, setTokens } from "@/lib/api-client";
import type { AuthResponse, Tokens, User } from "@/types/api";

type AuthContextValue = {
  user: User | null;
  tokens: Tokens | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; full_name?: string; timezone?: string }) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokenState] = useState<Tokens | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const bootstrap = useCallback(async () => {
    const stored = loadTokens();
    if (!stored) {
      setLoading(false);
      return;
    }
    setTokenState(stored as Tokens);
    try {
      const { data } = await apiClient.get<User>("/users/me");
      setUser(data);
    } catch (error) {
      console.warn("Failed to load profile", error);
      setTokens(null);
      setUser(null);
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleAuthSuccess = (response: AuthResponse) => {
    setTokens(response.tokens);
    setTokenState(response.tokens);
    setUser(response.user);
  };

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post<AuthResponse>("/auth/login", { email, password });
    handleAuthSuccess(data);
    router.push("/dashboard");
  }, [router]);

  const register = useCallback(
    async (payload: { email: string; password: string; full_name?: string; timezone?: string }) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/register", {
        ...payload,
        consent: true,
        timezone: payload.timezone ?? "Asia/Jakarta",
      });
      handleAuthSuccess(data);
      router.push("/dashboard");
    },
    [router],
  );

  const logout = useCallback(() => {
    setTokens(null);
    setUser(null);
    setTokenState(null);
    router.push("/login");
  }, [router]);

  const refreshProfile = useCallback(async () => {
    if (!tokens) return;
    const { data } = await apiClient.get<User>("/users/me");
    setUser(data);
  }, [tokens]);

  const value = useMemo(
    () => ({ user, tokens, loading, login, register, logout, refreshProfile }),
    [user, tokens, loading, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
