import axios from "axios";
import { BACKEND_URL } from "../config";
import { getAuthToken } from "./auth";

export const apiClient = axios.create({
  baseURL: BACKEND_URL,
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
