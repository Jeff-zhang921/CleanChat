import session from "express-session";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

//this file define whole backend rules
export const sessionMiddleware = session({
  secret: "CleanChat",
  saveUninitialized: false,
  resave: false,
  cookie: {
    maxAge: SESSION_TTL_MS,
  },
});

export default sessionMiddleware;
