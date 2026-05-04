export const AUTH_TOKEN_KEY = "cleanchat:auth-token";
export const AUTH_TOKEN_UPDATED_EVENT = "cleanchat:auth-token-updated";

const dispatchAuthTokenUpdated = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(AUTH_TOKEN_UPDATED_EVENT, {
      detail: { token },
    }),
  );
};

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
    dispatchAuthTokenUpdated(normalizedToken);
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  dispatchAuthTokenUpdated("");
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  dispatchAuthTokenUpdated("");
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
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const token = getAuthToken();
    if (!token) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return originalFetch(input, {
      ...init,
      headers,
    });
  }) as typeof window.fetch;

  globalWindow.__cleanchatFetchPatched = true;
};
