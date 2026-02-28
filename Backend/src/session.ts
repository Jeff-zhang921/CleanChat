import session from "express-session";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const frontendEnv = `${process.env.FRONTEND_URL ?? ""},${process.env.FRONTEND_URLS ?? ""}`;
const hasRemoteHttpsFrontend = frontendEnv
  .split(",")
  .map((item) => item.trim())
  .some((item) => item.startsWith("https://"));
const isProduction = process.env.NODE_ENV === "production";
const useCrossSiteCookie = isProduction || hasRemoteHttpsFrontend;
const sessionSecret = process.env.SESSION_SECRET || "CleanChat";

//this file define whole backend rules
export const sessionMiddleware = session({
  secret: sessionSecret,
  saveUninitialized: false,
  resave: false,
  proxy: useCrossSiteCookie,
  cookie: {
    maxAge: SESSION_TTL_MS,
    httpOnly: true,
    sameSite: useCrossSiteCookie ? "none" : "lax",
    secure: useCrossSiteCookie,
  },
});

export default sessionMiddleware;
