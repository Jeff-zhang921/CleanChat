import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import {
    appendGroupMessage,
    deleteGroupMessage,
    getGroupById,
    isGroupMember,
    listGroupMemberIds,
    normalizeGroupId,
} from "../groupStore";

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
        socket.join(`user:${sessionUser.id}`)
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
        const ensureGroupId=(raw:unknown):string|null=>{
            const candidate =
                typeof raw === "object" && raw !== null && "groupId" in raw
                    ? (raw as { groupId?: unknown }).groupId
                    : raw
            return normalizeGroupId(candidate)
        }
        const ensureMessageId=(raw:unknown):number|null=>{
            const candidate =
                typeof raw === "object" && raw !== null && "messageId" in raw
                    ? (raw as { messageId?: unknown }).messageId
                    : raw
            const parsedId = typeof candidate === "number" ? candidate : Number(candidate)
            if(!Number.isInteger(parsedId)||isNaN(parsedId)||parsedId<=0){
                console.warn("Invalid message id:", raw)
                return null
            }
            return parsedId
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
        const handleJoinGroup=(groupIdRaw:unknown)=>{
            const groupId=ensureGroupId(groupIdRaw)
            if(!groupId){
                emitChatError("Invalid group ID")
                return
            }
            if(!getGroupById(groupId)){
                emitChatError("Group not found")
                return
            }
            if(!isGroupMember(groupId,sessionUser.id)){
                emitChatError("Join this group first")
                return
            }
            socket.join(`group:${groupId}`)
            console.log(`User ${sessionUser.id} joined group ${groupId}`)
        }
        socket.on("thread:join",handleJoinThread)
        socket.on("Thread:join",handleJoinThread)
        socket.on("group:join",handleJoinGroup)

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
            const messagePayload = {
                id:message.id,
                threadId:validThreadId,
                body:message.body,
                senderId:message.senderId,
                createdAt:message.createdAt,
            }

            io.to(`thread:${validThreadId}`).emit("message:new", messagePayload)
            io.to(`user:${thread.AID}`).emit("inbox:new", messagePayload)
            io.to(`user:${thread.BID}`).emit("inbox:new", messagePayload)
             
        })
        socket.on(
            "message:delete",
            async (
                data:unknown,
                callback?: (result: { ok: boolean; message?: string }) => void
            )=>{
                const reply = (ok: boolean, message?: string) => {
                    if (typeof callback === "function") {
                        callback({ ok, message })
                    }
                }
                try{
                    const payload =
                        typeof data === "object" && data !== null
                            ? data as { threadId?: unknown; messageId?: unknown }
                            : {}
                    const validThreadId=ensureThreadValid(payload.threadId)
                    if(!validThreadId){
                        const errorMessage = "Invalid thread ID"
                        emitChatError(errorMessage)
                        reply(false, errorMessage)
                        return
                    }
                    const messageId = ensureMessageId(payload.messageId)
                    if(!messageId){
                        const errorMessage = "Invalid message ID"
                        emitChatError(errorMessage)
                        reply(false, errorMessage)
                        return
                    }

                    const thread=await ensureMemberShip(validThreadId,sessionUser.id)
                    if(!thread){
                        const errorMessage = "Thread not found or access denied"
                        emitChatError(errorMessage)
                        reply(false, errorMessage)
                        return
                    }

                    const targetMessage = await prisma.chatMessage.findUnique({
                        where: { id: messageId },
                        select: { id: true, threadId: true, senderId: true },
                    })
                    if(!targetMessage || targetMessage.threadId !== validThreadId){
                        const errorMessage = "Message not found"
                        emitChatError(errorMessage)
                        reply(false, errorMessage)
                        return
                    }
                    if(targetMessage.senderId !== sessionUser.id){
                        const errorMessage = "You can only delete your own messages."
                        emitChatError(errorMessage)
                        reply(false, errorMessage)
                        return
                    }

                    await prisma.chatMessage.delete({
                        where: { id: targetMessage.id },
                    })
                    const latestMessage = await prisma.chatMessage.findFirst({
                        where: { threadId: validThreadId },
                        orderBy: { createdAt: "desc" },
                        select: { createdAt: true },
                    })
                    await prisma.chatThread.update({
                        where: { id: validThreadId },
                        data: { lastMessageAt: latestMessage?.createdAt ?? null },
                    })

                    const deletedPayload = {
                        id: targetMessage.id,
                        threadId: validThreadId,
                        deletedBy: sessionUser.id,
                    }
                    io.to(`thread:${validThreadId}`).emit("message:deleted", deletedPayload)
                    io.to(`user:${thread.AID}`).emit("message:deleted", deletedPayload)
                    io.to(`user:${thread.BID}`).emit("message:deleted", deletedPayload)
                    reply(true)
                }catch{
                    const errorMessage = "Failed to delete message."
                    emitChatError(errorMessage)
                    reply(false, errorMessage)
                }
            }
        )

        socket.on("group:message:send",(data:unknown)=>{
            const payload =
                typeof data === "object" && data !== null
                    ? data as { groupId?: unknown; content?: unknown; body?: unknown }
                    : {}
            const groupId=ensureGroupId(payload.groupId)
            if(!groupId){
                emitChatError("Invalid group ID")
                return
            }
            if(!getGroupById(groupId)){
                emitChatError("Group not found")
                return
            }
            if(!isGroupMember(groupId,sessionUser.id)){
                emitChatError("Join this group first")
                return
            }

            const content =
                typeof payload.content === "string"
                    ? payload.content
                    : typeof payload.body === "string"
                        ? payload.body
                        : ""
            if(content.trim()===""){
                emitChatError("Content cannot be empty")
                return
            }

            const message = appendGroupMessage(groupId, sessionUser, content.trim())
            socket.join(`group:${groupId}`)
            const memberIds = listGroupMemberIds(groupId)
                memberIds.forEach((memberId) => {
                    io.to(`user:${memberId}`).emit("group:message:new", message)
                })
        })
        socket.on(
            "group:message:delete",
            (
                data:unknown,
                callback?: (result: { ok: boolean; message?: string }) => void
            )=>{
                const reply = (ok: boolean, message?: string) => {
                    if (typeof callback === "function") {
                        callback({ ok, message })
                    }
                }
                const payload =
                    typeof data === "object" && data !== null
                        ? data as { groupId?: unknown; messageId?: unknown }
                        : {}
                const groupId=ensureGroupId(payload.groupId)
                if(!groupId){
                    const errorMessage = "Invalid group ID"
                    emitChatError(errorMessage)
                    reply(false, errorMessage)
                    return
                }
                if(!getGroupById(groupId)){
                    const errorMessage = "Group not found"
                    emitChatError(errorMessage)
                    reply(false, errorMessage)
                    return
                }
                if(!isGroupMember(groupId,sessionUser.id)){
                    const errorMessage = "Join this group first"
                    emitChatError(errorMessage)
                    reply(false, errorMessage)
                    return
                }
                const messageId = ensureMessageId(payload.messageId)
                if(!messageId){
                    const errorMessage = "Invalid message ID"
                    emitChatError(errorMessage)
                    reply(false, errorMessage)
                    return
                }

                const deleted = deleteGroupMessage(groupId, messageId, sessionUser.id)
                if(!deleted.deleted){
                    const errorMessage =
                        deleted.reason === "forbidden"
                            ? "You can only delete your own group messages."
                            : "Message not found"
                    emitChatError(errorMessage)
                    reply(false, errorMessage)
                    return
                }

                socket.join(`group:${groupId}`)
                const deletedPayload = {
                    id: deleted.message.id,
                    groupId,
                    deletedBy: sessionUser.id,
                }
                io.to(`group:${groupId}`).emit("group:message:deleted", deletedPayload)
                const memberIds = listGroupMemberIds(groupId)
                memberIds.forEach((memberId) => {
                    io.to(`user:${memberId}`).emit("group:message:deleted", deletedPayload)
                })
                reply(true)
            }
        )
    }
)
return io




}
