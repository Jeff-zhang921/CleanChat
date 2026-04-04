import axios from "axios";
import { BACKEND_URL } from "../config";
import { getAuthToken, refreshAccessToken } from "./auth";

export const apiClient = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (!token) {
    return config;
  }

  config.headers = config.headers ?? {};
  if (!("Authorization" in config.headers)) {
    (config.headers as Record<string, string>).Authorization =
      `Bearer ${token}`;
  }

  return config;
});

type RetryableConfig = {
  _retriedAfterRefresh?: boolean;
  headers?: Record<string, string>;
  url?: string;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const config = (error.config ?? null) as RetryableConfig | null;
    if (!config || (status !== 401 && status !== 403)) {
      throw error;
    }

    if (config._retriedAfterRefresh) {
      throw error;
    }

    if (
      typeof config.url === "string" &&
      config.url.includes("/auth/refresh")
    ) {
      throw error;
    }

    const nextToken = await refreshAccessToken();
    if (!nextToken) {
      throw error;
    }

    config._retriedAfterRefresh = true;
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${nextToken}`;

    return apiClient(config);
  },
);
