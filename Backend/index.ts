import express,{Request,Response} from 'express';

import cors from 'cors';
import { sessionMiddleware } from "./src/session";
import profileRouter from "./src/routes/profile";
import chatRouter from "./src/routes/chat";
import authRouter from "./src/routes/auth";
import http from "http";
import { initSocket } from "./src/socket";
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

const defaultOrigins = ["http://localhost:5173", "http://localhost:5273"];
const envOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(cors({
    origin: allowedOrigins,
    credentials:true
}));
app.use(express.json());
app.use(sessionMiddleware);
app.use("/auth",authRouter);
app.use("/profile",profileRouter);
app.use("/chat",chatRouter);



const PORT = Number(process.env.PORT || 4000);

app.get("/",(request:Request,response:Response)=>{
     response.json({message:"Hello CleanChat"});
     console.log("Root endpoint was called")
});

if (require.main === module) {
    const server=http.createServer(app);
    initSocket(server);
    server.listen(PORT,()=>{
        console.log(`Server is running on port ${PORT}`);
    });

}
export default app;
