const trimTrailingSlash = (url: string) => url.replace(/\/+$/, "");

const fallbackApiUrl = import.meta.env.PROD ? "/api" : "http://localhost:4000";
const fallbackSocketUrl = import.meta.env.PROD
  ? typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:4000"
  : "http://localhost:4000";
const rawApiUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL : "";
const rawSocketUrl =
  typeof import.meta.env.VITE_SOCKET_URL === "string" ? import.meta.env.VITE_SOCKET_URL : "";

export const BACKEND_URL = trimTrailingSlash(rawApiUrl.trim() || fallbackApiUrl);
export const SOCKET_URL = trimTrailingSlash(rawSocketUrl.trim() || fallbackSocketUrl);
