interface Env {
  KOYEB_ORIGIN?: string;
}

const stripLeadingApi = (pathname: string) => pathname.replace(/^\/api/, "") || "/";
const DEFAULT_KOYEB_ORIGIN = "https://clinical-ursulina-cleanchan-eb6e1ee6.koyeb.app";

type FunctionContext = {
  request: Request;
  env: Env;
};

export const onRequest = async ({ request, env }: FunctionContext) => {
  const incomingUrl = new URL(request.url);
  const upstreamBase = new URL(env.KOYEB_ORIGIN?.trim() || DEFAULT_KOYEB_ORIGIN);
  const upstreamPath = stripLeadingApi(incomingUrl.pathname);
  const upstreamUrl = new URL(`${upstreamPath}${incomingUrl.search}`, upstreamBase);

  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  const upstreamResponse = await fetch(upstreamRequest);

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
