import session from "express-session";

//this file define whole backend rules
export const sessionMiddleware = session({
  secret: "CleanChat",
  saveUninitialized: false,
  resave: false,
});

export default sessionMiddleware;
