"use client";

import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: false,
});

export type TokenPair = {
  access_token: string;
  refresh_token: string;
};

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const setTokens = (tokens: TokenPair | null) => {
  accessToken = tokens?.access_token ?? null;
  refreshToken = tokens?.refresh_token ?? null;
  if (tokens?.access_token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${tokens.access_token}`;
    localStorage.setItem("ms_tokens", JSON.stringify(tokens));
  } else {
    delete apiClient.defaults.headers.common.Authorization;
    localStorage.removeItem("ms_tokens");
  }
};

export const loadTokens = (): TokenPair | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem("ms_tokens");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TokenPair;
    accessToken = parsed.access_token;
    refreshToken = parsed.refresh_token;
    apiClient.defaults.headers.common.Authorization = `Bearer ${parsed.access_token}`;
    return parsed;
  } catch (error) {
    console.error("Failed to load tokens", error);
    return null;
  }
};

export const getAccessToken = () => accessToken;
export const getRefreshToken = () => refreshToken;

export const refreshTokens = async () => {
  if (!refreshToken) {
    return null;
  }
  const { data } = await apiClient.post<TokenPair>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  setTokens(data);
  return data;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && refreshToken) {
      try {
        const refreshed = await refreshTokens();
        if (refreshed) {
          error.config.headers.Authorization = `Bearer ${refreshed.access_token}`;
          return apiClient.request(error.config);
        }
      } catch (refreshErr) {
        console.warn("Token refresh failed", refreshErr);
        setTokens(null);
      }
    }
    return Promise.reject(error);
  },
);
