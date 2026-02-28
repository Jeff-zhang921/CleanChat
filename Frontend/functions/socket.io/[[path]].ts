interface Env {
  KOYEB_ORIGIN?: string;
}

type FunctionContext = {
  request: Request;
  env: Env;
};

const DEFAULT_KOYEB_ORIGIN = "https://clinical-ursulina-cleanchan-eb6e1ee6.koyeb.app";

export const onRequest = async ({ request, env }: FunctionContext) => {
  const incomingUrl = new URL(request.url);
  const upstreamBase = new URL(env.KOYEB_ORIGIN?.trim() || DEFAULT_KOYEB_ORIGIN);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamBase);

  // Socket.IO uses HTTP long-polling and websocket upgrade on this path.
  return fetch(new Request(upstreamUrl.toString(), request));
};
