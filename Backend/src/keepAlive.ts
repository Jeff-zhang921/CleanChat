const parsePositiveInt = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseBoolean = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
};

type KeepAliveStatus = {
  enabled: boolean;
  targetUrl: string | null;
  intervalMs: number;
  timeoutMs: number;
  startedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
};

const status: KeepAliveStatus = {
  enabled: false,
  targetUrl: null,
  intervalMs: 0,
  timeoutMs: 0,
  startedAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  consecutiveFailures: 0,
  lastError: null,
};

let timer: NodeJS.Timeout | null = null;

const resolveKeepAliveEnabled = () => {
  const configured = parseBoolean(process.env.KEEPALIVE_ENABLED);
  if (configured !== null) {
    return configured;
  }

  return process.env.NODE_ENV === "production";
};

const pingKeepAliveTarget = async () => {
  if (!status.enabled || !status.targetUrl) {
    return;
  }

  if (typeof fetch !== "function") {
    status.lastError = "Global fetch is not available in current Node runtime.";
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, status.timeoutMs);

  status.lastAttemptAt = new Date().toISOString();

  try {
    const response = await fetch(status.targetUrl, {
      method: "GET",
      headers: {
        "x-cleanchat-keepalive": "1",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Keepalive ping failed with HTTP ${response.status}.`);
    }

    status.lastSuccessAt = new Date().toISOString();
    status.consecutiveFailures = 0;
    status.lastError = null;
  } catch (error) {
    status.consecutiveFailures += 1;
    status.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }
};

export const startKeepAliveLoop = (port: number) => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  status.enabled = resolveKeepAliveEnabled();
  status.intervalMs =
    parsePositiveInt(process.env.KEEPALIVE_INTERVAL_MS) ?? 240000;
  status.timeoutMs = parsePositiveInt(process.env.KEEPALIVE_TIMEOUT_MS) ?? 8000;
  status.targetUrl =
    process.env.KEEPALIVE_TARGET_URL?.trim() ||
    `http://127.0.0.1:${port}/ops/keepalive?source=internal-loop`;
  status.startedAt = null;
  status.lastAttemptAt = null;
  status.lastSuccessAt = null;
  status.consecutiveFailures = 0;
  status.lastError = null;

  if (!status.enabled || !status.targetUrl) {
    return;
  }

  timer = setInterval(() => {
    void pingKeepAliveTarget();
  }, status.intervalMs);
  timer.unref?.();
  status.startedAt = new Date().toISOString();

  void pingKeepAliveTarget();
};

export const stopKeepAliveLoop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

export const getKeepAliveStatus = () => ({ ...status });
