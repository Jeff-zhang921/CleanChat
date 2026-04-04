import crypto from "crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import jwt, {
  type JwtPayload,
  type SignOptions,
  TokenExpiredError,
} from "jsonwebtoken";

export type AuthenticatedUser = {
  userId: number;
};

const rawJwtSecret = process.env.JWT_SECRET?.trim();
const rawRefreshTokenSecret = process.env.REFRESH_TOKEN_SECRET?.trim();

if (process.env.NODE_ENV === "production" && !rawJwtSecret) {
  throw new Error("JWT_SECRET is required in production.");
}

if (process.env.NODE_ENV === "production" && !rawRefreshTokenSecret) {
  throw new Error("REFRESH_TOKEN_SECRET is required in production.");
}

const JWT_SECRET = rawJwtSecret || "dev-only-local-jwt-secret-change-me";
const REFRESH_TOKEN_SECRET =
  rawRefreshTokenSecret || "dev-only-local-refresh-secret-change-me";

const ACCESS_TOKEN_TTL: SignOptions["expiresIn"] =
  (process.env.ACCESS_TOKEN_TTL?.trim() || "15m") as SignOptions["expiresIn"];
const refreshTokenTtlDaysRaw = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS ?? "30",
);
const REFRESH_TOKEN_TTL_DAYS =
  Number.isFinite(refreshTokenTtlDaysRaw) && refreshTokenTtlDaysRaw > 0
    ? Math.floor(refreshTokenTtlDaysRaw)
    : 30;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const REFRESH_TOKEN_COOKIE_NAME =
  process.env.REFRESH_TOKEN_COOKIE_NAME?.trim() || "cleanchat_rt";
const REFRESH_COOKIE_DOMAIN =
  process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
const refreshCookieSameSiteRaw =
  process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase() || "lax";
const REFRESH_COOKIE_SAMESITE: CookieOptions["sameSite"] =
  refreshCookieSameSiteRaw === "none"
    ? "none"
    : refreshCookieSameSiteRaw === "strict"
      ? "strict"
      : "lax";
const REFRESH_COOKIE_SECURE =
  process.env.NODE_ENV === "production" || REFRESH_COOKIE_SAMESITE === "none";

const getRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: REFRESH_COOKIE_SECURE,
  sameSite: REFRESH_COOKIE_SAMESITE,
  path: "/",
  maxAge: REFRESH_TOKEN_TTL_MS,
  ...(REFRESH_COOKIE_DOMAIN ? { domain: REFRESH_COOKIE_DOMAIN } : {}),
});

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
    expiresIn: ACCESS_TOKEN_TTL,
  });

export const buildRefreshTokenExpiry = () =>
  new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

export const generateRefreshToken = () =>
  crypto.randomBytes(48).toString("base64url");

export const hashRefreshToken = (refreshToken: string) =>
  crypto
    .createHmac("sha256", REFRESH_TOKEN_SECRET)
    .update(refreshToken)
    .digest("hex");

export const readRefreshTokenFromRequest = (request: Request) => {
  const raw = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim();
};

export const setRefreshTokenCookie = (
  response: Response,
  refreshToken: string,
) => {
  response.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    getRefreshCookieOptions(),
  );
};

export const clearRefreshTokenCookie = (response: Response) => {
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    ...getRefreshCookieOptions(),
    maxAge: 0,
  });
};

export const getRequestClientMetadata = (request: Request) => {
  const userAgent = request.headers["user-agent"]?.trim() || null;
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded
      : "";
  const forwardedFirst = forwardedValue.split(",")[0]?.trim() || "";
  const ipAddress = forwardedFirst || request.ip || null;

  return {
    userAgent,
    ipAddress,
  };
};

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
