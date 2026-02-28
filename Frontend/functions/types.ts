export type PagesFunction<Env = Record<string, unknown>> = (context: {
  request: Request;
  env: Env;
}) => Response | Promise<Response>;
