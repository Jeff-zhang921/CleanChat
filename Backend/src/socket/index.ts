import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

import{sessionMiddleware} from '../session';
const prisma=new PrismaClient();

const defaultOrigins = ["http://localhost:5173", "http://localhost:5273"];
const envOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

export function initSocket(server: HTTPServer) {
    //io now is the big server
    const io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            credentials: true
        }
    });
    io.use((socket,next)=>{
        sessionMiddleware(socket.request as any, {} as any, next as any)
    })
    io.use((socket,next)=>{
        const session = (socket.request as any).session
        const user=session?.user
        if(!user){
            return next(new Error("Not authenticated"))
        }
        socket.data.user=user
        next()
    })
    io.on("connection",(socket)=>{
        console.log("A user connected:", socket.data.user)
        const sessionUser=socket.data.user
        const emitChatError = (message: string) => {
            socket.emit("chat:error", message)
            socket.emit("message:error", message)
            socket.emit("Thread:error", message)
            socket.emit("thread:error", message)
        }
        const ensureThreadValid=(raw:unknown):number|null=>{
            const candidate =
                typeof raw === "object" && raw !== null && "threadId" in raw
                    ? (raw as { threadId?: unknown }).threadId
                    : raw
            const parsedid=typeof candidate === "number" ? candidate:Number(candidate)
            if(!Number.isInteger(parsedid)||isNaN(parsedid)||parsedid<=0){
                console.warn("Invalid thread id:",raw)
                return null
            }
            return parsedid
        }
        const ensureMemberShip=async(threadId:number,userId:number)=>{
            if(!threadId||!userId){
                return null
            }
            const thread=await prisma.chatThread.findUnique({
                where:{
                    id:threadId
                },
                select:{id:true,AID:true,BID:true}
            })
            if(!thread){
                return null
            }       
            if(thread.AID!==userId&&thread.BID!==userId){
                return null
            }
            return thread
        }
        const handleJoinThread=async(threadIdRaw:unknown)=>{
            const threadId=ensureThreadValid(threadIdRaw)
            if(!threadId){
                emitChatError("Invalid thread ID")
                return
            }
            const thread=await ensureMemberShip(threadId,sessionUser.id)
            if(!thread){
                emitChatError("Thread not found or access denied")
                return
            }
            socket.join(`thread:${threadId}`)
            console.log(`User ${sessionUser.id} joined thread ${threadId}`)
        }
        socket.on("thread:join",handleJoinThread)
        socket.on("Thread:join",handleJoinThread)

        socket.on("message:send",async(data:unknown)=>{
            const payload = (typeof data === "object" && data !== null) ? data as { threadId?: unknown; content?: unknown; body?: unknown } : {}
            const {threadId}=payload
            const content =
                typeof payload.content === "string"
                    ? payload.content
                    : typeof payload.body === "string"
                        ? payload.body
                        : ""
            const validThreadId=ensureThreadValid(threadId)
            if(!validThreadId){
                emitChatError("Invalid thread ID")
                return
            }
            const thread=await ensureMemberShip(validThreadId,sessionUser.id)
            if(!thread){
                emitChatError("Thread not found or access denied")
                return
            }
            if(typeof content!=="string"||content.trim()===""){
                emitChatError("Content cannot be empty")
                return
            }
            const message=await prisma.chatMessage.create({
                data:{
                    threadId:validThreadId,
                    senderId:sessionUser.id,
                    body:content.trim(),
                },
                select:{
                    id:true,
                    body:true,
                    senderId:true,
                    createdAt:true,
                }
            })
            await prisma.chatThread.update({
                where:{id:validThreadId},
                data:{lastMessageAt:new Date()},
            })
            io.to(`thread:${validThreadId}`).emit("message:new",{
                id:message.id,
                threadId:validThreadId,
                body:message.body,
                senderId:message.senderId,
                createdAt:message.createdAt,
            })
            
        })
    }
)
return io




}
