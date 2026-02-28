import session from "express-session";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || "CleanChat";

//this file define whole backend rules
export const sessionMiddleware = session({
  secret: sessionSecret,
  saveUninitialized: false,
  resave: false,
  cookie: {
    maxAge: SESSION_TTL_MS,
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  },
});

export default sessionMiddleware;
