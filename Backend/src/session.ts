import session from "express-session";

export const sessionMiddleware = session({
  secret: "CleanChat",
  saveUninitialized: false,
  resave: false,
});

export default sessionMiddleware;
