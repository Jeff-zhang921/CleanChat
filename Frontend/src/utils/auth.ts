import { BACKEND_URL } from "../config";

export const AUTH_TOKEN_KEY = "cleanchat:auth-token";
const REFRESH_ENDPOINT = `${BACKEND_URL}/auth/refresh`;

let refreshPromise: Promise<string> | null = null;

export const getAuthToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AUTH_TOKEN_KEY)?.trim() || "";
};

export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = token.trim();
  if (normalizedToken) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, normalizedToken);
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
};

const parseRequestUrl = (input: RequestInfo | URL) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }
    if (input instanceof URL) {
      return new URL(input.toString(), window.location.origin);
    }
    return new URL(input.url, window.location.origin);
  } catch {
    return null;
  }
};

export const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(REFRESH_ENDPOINT, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        clearAuthToken();
        return "";
      }

      const payload = (await response.json().catch(() => ({}))) as {
        token?: unknown;
      };
      const token =
        typeof payload.token === "string" ? payload.token.trim() : "";

      if (!token) {
        clearAuthToken();
        return "";
      }

      setAuthToken(token);
      return token;
    } catch {
      return "";
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const ensureAccessToken = async (
  options: { forceRefresh?: boolean } = {},
) => {
  if (!options.forceRefresh) {
    const token = getAuthToken();
    if (token) {
      return token;
    }
  }

  return refreshAccessToken();
};

export const installAuthFetchInterceptor = () => {
  if (typeof window === "undefined") {
    return;
  }

  const globalWindow = window as Window & { __cleanchatFetchPatched?: boolean };
  if (globalWindow.__cleanchatFetchPatched) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const sourceRequest = input instanceof Request ? input.clone() : null;

    const runFetch = (tokenOverride?: string) => {
      const headers = new Headers(
        init?.headers ?? (sourceRequest ? sourceRequest.headers : undefined),
      );
      const token = tokenOverride ?? getAuthToken();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const nextInit: RequestInit = {
        ...init,
        credentials: init?.credentials ?? "include",
        headers,
      };

      if (sourceRequest) {
        return originalFetch(new Request(sourceRequest.clone(), nextInit));
      }

      return originalFetch(input, nextInit);
    };

    let response = await runFetch();
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    const requestUrl = parseRequestUrl(input);
    if (requestUrl?.pathname === "/auth/refresh") {
      return response;
    }

    const nextToken = await refreshAccessToken();
    if (!nextToken) {
      return response;
    }

    response = await runFetch(nextToken);
    return response;
  }) as typeof window.fetch;

  globalWindow.__cleanchatFetchPatched = true;
};
