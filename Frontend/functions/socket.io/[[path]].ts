interface Env {
  KOYEB_ORIGIN?: string;
}

type FunctionContext = {
  request: Request;
  env: Env;
};

const jsonError = (status: number, error: string, details?: string) =>
  new Response(JSON.stringify(details ? { error, details } : { error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const resolveUpstreamBase = (env: Env): URL | Response => {
  const rawOrigin = env.KOYEB_ORIGIN?.trim();

  if (!rawOrigin) {
    return jsonError(
      500,
      "Missing KOYEB_ORIGIN environment variable",
      "Set KOYEB_ORIGIN to your backend origin (example: https://your-service.koyeb.app)."
    );
  }

  try {
    return new URL(rawOrigin);
  } catch {
    return jsonError(500, "Invalid KOYEB_ORIGIN environment variable", `Received: ${rawOrigin}`);
  }
};

export const onRequest = async ({ request, env }: FunctionContext) => {
  const upstreamBase = resolveUpstreamBase(env);
  if (upstreamBase instanceof Response) {
    return upstreamBase;
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamBase);

  // Socket.IO uses HTTP long-polling and websocket upgrade on this path.
  try {
    return await fetch(new Request(upstreamUrl.toString(), request));
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown upstream fetch error";
    return jsonError(502, "Failed to reach upstream Socket.IO endpoint", details);
  }
};
