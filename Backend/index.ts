import express,{Request,Response} from 'express';

import cors from 'cors';
import { sessionMiddleware } from "./src/session";
import profileRouter from "./src/routes/profile";
import chatRouter from "./src/routes/chat";
import http from "http";
import { initSocket } from "./src/socket";
const app = express();

app.use(cors({
    origin:"http://localhost:5273",
    credentials:true
}));
app.use(sessionMiddleware);
app.use("/profile",profileRouter);
app.use("/chat",chatRouter);
app.use(express.json());



const PORT = Number(process.env.PORT || 3000);

app.get("/",(request:Request,response:Response)=>{
     response.json({message:"Hello CleanChat"});
});

if (require.main === module) {
    const server=http.createServer(app);
    initSocket(server);
    server.listen(PORT,()=>{
        console.log(`Server is running on port ${PORT}`);
    });

}
export default app;
