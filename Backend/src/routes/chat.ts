import {Router,Request,Response,NextFunction} from "express"
import { PrismaClient, Avatar } from "@prisma/client";
const router=Router()
const prisma=new PrismaClient()

router.post("/threads",async (req,res)=>{
    const sessionUser=req.session.user
    if(!sessionUser){
        return res.status(401).json({error:"Not authenticated"})
    }
    const AId=typeof req.body?.AId === "number" ? req.body.AId : Number(req.body?.AId)
    if(!Number.isInteger(AId)||isNaN(AId)||AId<=0){
        return res.status(400).json({error:"Invalid A ID"})
    }
    const BId=typeof req.body?.BId === "number" ? req.body.BId : Number(req.body?.BId)
    if(!Number.isInteger(BId)||isNaN(BId)||BId<=0){
        return res.status(400).json({error:"Invalid B ID"})
    }
    if(AId===BId){
        return res.status(400).json({error:"A and B cannot be the same user"})
    }

    const BIDExists=await prisma.user.findUnique({
        where:{id:BId},
        select:{id:true}
    })
    if(!BIDExists){
        return res.status(404).json({error:"B user not found"})
    }

    const existingThread=await prisma.chatThread.findFirst({
        where:{
            AID:AId,
            BID:BId
        }
    })
    if(existingThread){
        return res.status(409).json({error:"Thread already exists"})
    }
    const newThread=await prisma.chatThread.create({
        data:{
            AID:AId,
            BID:BId
        }
    })
    res.status(201).json({thread:newThread})
})

router.get("/threads",async(req,res)=>{
    const userId=req.session.user?.id
    
    if(!userId){
        res.status(401).json({message:"Unauthorized"})
        return
    }
    const threads=await prisma.chatThread.findMany({
        where:{
            OR:[
                {AID:userId},
                {BID:userId}]
        },
        include:{
    UserA:{select:{id:true,name:true,email:true}},
    UserB:{select:{id:true,name:true,email:true}},
    //get one msg for display
    Messages:{
                take:1,
                orderBy:{createdAt:"desc"},
                select:{id:true,body:true,createdAt:true,senderId:true}
            }
        },
        orderBy:[{lastMessageAt:"desc"},
        {updatedAt:"desc"}
        ]
    })
    res.json(threads)
})

router.get("/threads/:threadId/messages",async(req,res)=>{
    const userId=req.session.user?.id
    if(!userId){
        res.status(401).json({message:"Unauthorized"})
        return
    }
    const threadId=Number(req.params.threadId)
    if(!Number.isInteger(threadId)||isNaN(threadId)||threadId<=0){
        res.status(400).json({message:"Invalid thread ID"})
        return
    }
    const thread=await prisma.chatThread.findUnique({
        where:{id:threadId},
        include:{
            Messages:{orderBy:{createdAt:"asc"}}
        }
    })
    if(!thread){
        res.status(404).json({message:"Thread not found"})
        return
    }
    if(thread.AID!==userId && thread.BID!==userId){
        res.status(403).json({message:"Forbidden"})
        return
    }
    res.json(thread.Messages)
})


export default router