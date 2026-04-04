import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload, TokenExpiredError } from "jsonwebtoken";

export type AuthenticatedUser = {
  userId: number;
};

const rawJwtSecret = process.env.JWT_SECRET?.trim();

if (process.env.NODE_ENV === "production" && !rawJwtSecret) {
  throw new Error("JWT_SECRET is required in production.");
}

const JWT_SECRET = rawJwtSecret || "dev-only-local-jwt-secret-change-me";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const parseBearerToken = (authorizationHeader: string | undefined) => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token.trim();
};

export const signAuthToken = (userId: number) =>
  jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "1y",
  });

export const getUserIdFromToken = (token: string) => {
  const payload = jwt.verify(token, JWT_SECRET) as JwtPayload | string;

  if (typeof payload === "string" || typeof payload.userId !== "number") {
    throw new Error("Invalid token payload.");
  }

  return payload.userId;
};

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  try {
    const userId = getUserIdFromToken(token);
    req.user = { userId };
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      res.status(401).json({ error: "Token expired." });
      return;
    }

    res.status(401).json({ error: "Invalid token." });
  }
};
