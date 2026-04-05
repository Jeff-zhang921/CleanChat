import express, { NextFunction, Request, Response } from "express";

import cors from "cors";
import profileRouter from "./src/routes/profile";
import chatRouter from "./src/routes/chat";
import conversationsRouter from "./src/routes/conversations";
import authRouter from "./src/routes/auth";
import opsRouter from "./src/routes/ops";
import http from "http";
import { initSocket } from "./src/socket";
import { startKeepAliveLoop, stopKeepAliveLoop } from "./src/keepAlive";
import {
  initializeRuntimeStatePersistence,
  shutdownRuntimeStatePersistence,
} from "./src/runtimePersistence";
const app = express();
const frontendEnv = `${process.env.FRONTEND_URL ?? ""},${process.env.FRONTEND_URLS ?? ""}`;
const hasRemoteHttpsFrontend = frontendEnv
  .split(",")
  .map((item) => item.trim())
  .some((item) => item.startsWith("https://"));
const isProduction = process.env.NODE_ENV === "production";
const useProxyTrust = isProduction || hasRemoteHttpsFrontend;

if (useProxyTrust) {
  app.set("trust proxy", 1);
}

const defaultOrigins = [
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:5273",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5273",
];
const envOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/chat", chatRouter);
app.get(
  "/api/unread-count",
  (request: Request, response: Response, next: NextFunction) => {
    request.url = "/unread-count";
    chatRouter(request, response, next);
  },
);
app.use("/conversations", conversationsRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/ops", opsRouter);

const forwardOpsAlias =
  (targetPath: "/healthz" | "/readyz" | "/keepalive" | "/push-config") =>
  (request: Request, response: Response, next: NextFunction) => {
    const queryStart = request.originalUrl.indexOf("?");
    const querySuffix =
      queryStart >= 0 ? request.originalUrl.slice(queryStart) : "";
    request.url = `${targetPath}${querySuffix}`;
    opsRouter(request, response, next);
  };

app.get("/healthz", forwardOpsAlias("/healthz"));
app.get("/readyz", forwardOpsAlias("/readyz"));
app.get("/keepalive", forwardOpsAlias("/keepalive"));
app.get("/push-config", forwardOpsAlias("/push-config"));

const PORT = Number(process.env.PORT || 4000);

app.get("/", (request: Request, response: Response) => {
  response.json({ message: "Hello CleanChat" });
  console.log("Root endpoint was called");
});

app.use((request: Request, response: Response) => {
  response.status(404).json({
    error: "Route not found",
    method: request.method,
    path: request.originalUrl,
  });
});

app.use(
  (
    error: unknown,
    request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    console.error("Unhandled server error", error);

    if (response.headersSent) {
      return;
    }

    const details = error instanceof Error ? error.message : String(error);

    response.status(500).json({
      error: "Internal server error",
      method: request.method,
      path: request.originalUrl,
      ...(process.env.NODE_ENV === "production" ? {} : { details }),
    });
  },
);

if (require.main === module) {
  const startServer = async () => {
    await initializeRuntimeStatePersistence();

    const server = http.createServer(app);
    initSocket(server);

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      console.log(`Received ${signal}, shutting down server...`);
      stopKeepAliveLoop();

      await shutdownRuntimeStatePersistence();

      server.close((error) => {
        if (error) {
          console.error("Error while closing HTTP server", error);
          process.exit(1);
          return;
        }

        process.exit(0);
      });
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      startKeepAliveLoop(PORT);
    });
  };

  void startServer();
}
export default app;
