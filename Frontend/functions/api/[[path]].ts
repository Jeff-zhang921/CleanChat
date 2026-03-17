interface Env {
  KOYEB_ORIGIN?: string;
}

const stripLeadingApi = (pathname: string) => pathname.replace(/^\/api(?:\/|$)/, "/") || "/";

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

type FunctionContext = {
  request: Request;
  env: Env;
};

export const onRequest = async ({ request, env }: FunctionContext) => {
  const upstreamBase = resolveUpstreamBase(env);
  if (upstreamBase instanceof Response) {
    return upstreamBase;
  }

  const incomingUrl = new URL(request.url);
  const upstreamPath = stripLeadingApi(incomingUrl.pathname);
  const upstreamUrl = new URL(`${upstreamPath}${incomingUrl.search}`, upstreamBase);

  let upstreamResponse: Response;
  try {
    const upstreamRequest = new Request(upstreamUrl.toString(), request);
    upstreamResponse = await fetch(upstreamRequest);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown upstream fetch error";
    return jsonError(502, "Failed to reach upstream API", details);
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (upstreamPath !== "/" && contentType.includes("text/html")) {
    return jsonError(
      502,
      "Upstream returned HTML instead of API JSON",
      `Check KOYEB_ORIGIN. Requested upstream URL: ${upstreamUrl.toString()}`
    );
  }

  // This endpoint is same-origin from browser perspective, so upstream CORS headers are unnecessary.
  const headers = new Headers(upstreamResponse.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-credentials");
  headers.delete("access-control-allow-methods");
  headers.delete("access-control-allow-headers");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};
