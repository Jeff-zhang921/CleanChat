interface Env {
  KOYEB_ORIGIN: string;
}

type FunctionContext = {
  request: Request;
  env: Env;
};

export const onRequest = async ({ request, env }: FunctionContext) => {
  if (!env.KOYEB_ORIGIN) {
    return new Response("Missing KOYEB_ORIGIN env var", { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const upstreamBase = new URL(env.KOYEB_ORIGIN);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamBase);

  // Socket.IO uses HTTP long-polling and websocket upgrade on this path.
  return fetch(new Request(upstreamUrl.toString(), request));
};
