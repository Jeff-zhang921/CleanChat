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

const buildUpstreamDetails = (
  request: Request,
  requestedUrl: URL,
  response: Response | null,
  durationMs: number,
  extraDetails?: string
) =>
  [
    `Method: ${request.method}`,
    `Requested upstream URL: ${requestedUrl.toString()}`,
    `Final upstream URL: ${response?.url || requestedUrl.toString()}`,
    response ? `Status: ${response.status} ${response.statusText}` : null,
    response ? `Content-Type: ${response.headers.get("content-type") || "(missing)"}` : null,
    response?.headers.get("location") ? `Location: ${response.headers.get("location")}` : null,
    `Duration: ${durationMs}ms`,
    response?.redirected ? "The upstream request was redirected before responding." : null,
    extraDetails ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

const logUpstreamProblem = (label: string, details: string) => {
  console.error(`[api proxy] ${label}. ${details}`);
};

const resolveUpstreamBase = (env: Env, incomingUrl: URL): URL | Response => {
  const rawOrigin = env.KOYEB_ORIGIN?.trim();

  if (!rawOrigin) {
    return jsonError(
      500,
      "Missing KOYEB_ORIGIN environment variable",
      "Set KOYEB_ORIGIN to your backend origin (example: https://your-service.koyeb.app)."
    );
  }

  try {
    const upstreamBase = new URL(rawOrigin);

    if (upstreamBase.protocol !== "http:" && upstreamBase.protocol !== "https:") {
      return jsonError(
        500,
        "Invalid KOYEB_ORIGIN environment variable",
        `KOYEB_ORIGIN must use http or https. Received: ${rawOrigin}`
      );
    }

    if (upstreamBase.pathname !== "/" || upstreamBase.search || upstreamBase.hash) {
      return jsonError(
        500,
        "Invalid KOYEB_ORIGIN environment variable",
        `KOYEB_ORIGIN must be a bare origin such as https://your-service.koyeb.app. Received: ${rawOrigin}`
      );
    }

    if (upstreamBase.origin === incomingUrl.origin) {
      return jsonError(
        500,
        "Invalid KOYEB_ORIGIN environment variable",
        `KOYEB_ORIGIN points to the same origin as this Cloudflare site (${incomingUrl.origin}). Set it to the backend origin instead.`
      );
    }

    return new URL(upstreamBase.origin);
  } catch {
    return jsonError(500, "Invalid KOYEB_ORIGIN environment variable", `Received: ${rawOrigin}`);
  }
};

type FunctionContext = {
  request: Request;
  env: Env;
};

export const onRequest = async ({ request, env }: FunctionContext) => {
  const incomingUrl = new URL(request.url);
  const upstreamBase = resolveUpstreamBase(env, incomingUrl);
  if (upstreamBase instanceof Response) {
    return upstreamBase;
  }
  const upstreamPath = stripLeadingApi(incomingUrl.pathname);
  const upstreamUrl = new URL(`${upstreamPath}${incomingUrl.search}`, upstreamBase);
  const startedAt = Date.now();

  let upstreamResponse: Response;
  try {
    const upstreamRequest = new Request(upstreamUrl.toString(), request);
    upstreamResponse = await fetch(upstreamRequest);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown upstream fetch error";
    const summary = buildUpstreamDetails(request, upstreamUrl, null, Date.now() - startedAt, details);
    logUpstreamProblem("Failed to reach upstream API", summary);
    return jsonError(502, "Failed to reach upstream API", summary);
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (upstreamPath !== "/" && contentType.includes("text/html")) {
    const details = buildUpstreamDetails(
      request,
      upstreamUrl,
      upstreamResponse,
      Date.now() - startedAt,
      "This usually means KOYEB_ORIGIN points at the wrong host, the backend is cold-starting, or the platform returned an HTML error page instead of JSON."
    );
    logUpstreamProblem("Upstream returned HTML instead of API JSON", details);

    return jsonError(
      502,
      "Upstream returned HTML instead of API JSON",
      details
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
