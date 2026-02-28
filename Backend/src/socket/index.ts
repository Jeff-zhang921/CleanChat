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
        const ensureThreadValid=(raw:unknown):number|null=>{
            const parsedid=typeof raw === "number" ? raw:Number(raw)
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
        socket.on("Thread:join",async(threadIdRaw:unknown)=>{

            const threadId=ensureThreadValid(threadIdRaw)
            if(!threadId){
                socket.emit("Thread:error","Invalid thread ID")
                return
            }
            const thread=await ensureMemberShip(threadId,sessionUser.id)
            if(!thread){
                socket.emit("Thread:error","Thread not found or access denied")
                return
            }
            socket.join(`thread_${threadId}`)
            console.log(`User ${sessionUser.id} joined thread ${threadId}`)
        })

        socket.on("message:send",async(data)=>{
            const {threadId,content}=data
            const validThreadId=ensureThreadValid(threadId)
            if(!validThreadId){
                socket.emit("message:error","Invalid thread ID")
                return
            }
            const thread=await ensureMemberShip(validThreadId,sessionUser.id)
            if(!thread){
                socket.emit("message:error","Thread not found or access denied")
                return
            }
            if(typeof content!=="string"||content.trim()===""){
                socket.emit("message:error","Content cannot be empty")
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
                content:message.body,
                senderId:message.senderId,
                createdAt:message.createdAt,
            })
            
        })
    }
)
return io




}
