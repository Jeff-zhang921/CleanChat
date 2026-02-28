import { NextFunction,Request,Response,Router } from "express";
import { Avatar, PrismaClient } from "@prisma/client";
const router = Router();    
const prisma = new PrismaClient();

function requireProfileSession(req: Request, res: Response, next: NextFunction) {
    //from browser send cookie ID, interpret by express middleware
    //It uses the session id to load the session data from your session store
    //and attach to req
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }

  //Avoid repeating req.session.user in every handle
  res.locals.sessionUser = user;
  next();
}



router.get("/me",requireProfileSession,async (req,res)=>{
    const sessionUser=req.session.user
    if(!sessionUser){
        return res.status(401).json({error:"Not authenticated"})
    }
    const user=await prisma.user.findUnique({
        where:{id:sessionUser.id},
        select:{
            id:true,
            email:true,
            name:true,
            cleanId:true,
            avatar:true,
    }})
    if(!user){
        delete req.session.user
        return res.status(404).json({error:"User not found"})
    }
    res.json({user})
})
router.patch("/me",requireProfileSession,async (req,res)=>{
    const sessionUser=req.session.user
    if(!sessionUser){
        return res.status(401).json({error:"Not authenticated"})
    }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null

  const avatarRaw = req.body?.avatar
  const avatar = Object.values(Avatar).includes(avatarRaw as Avatar)
    ? (avatarRaw as Avatar)
    : null

  const updates: { name?: string; avatar?: Avatar } = {}
  if (name !== null) {
    updates.name = name
  }
  if (avatar !== null) {
    updates.avatar = avatar
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Invalid name or avatar" })
  }

  const updatedUser = await prisma.user.update({
    where: { id: sessionUser.id },
    data: updates,
    select: { id: true, email: true, name: true, cleanId: true, avatar: true },
  })

  req.session.user = {
    ...sessionUser,
    name: updatedUser.name ?? null,
    cleanId: updatedUser.cleanId,
    avatar: updatedUser.avatar ?? null,
  }

  res.json({ message: "Profile updated.", user: updatedUser })
})

router.delete("/me", requireProfileSession, async (req, res) => {
  const sessionUser = req.session.user;
  if (!sessionUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const threads = await tx.chatThread.findMany({
        where: {
          OR: [{ AID: sessionUser.id }, { BID: sessionUser.id }],
        },
        select: { id: true },
      });

      const threadIds = threads.map((item) => item.id);
      if (threadIds.length > 0) {
        await tx.chatMessage.deleteMany({
          where: {
            threadId: { in: threadIds },
          },
        });
      }

      await tx.chatThread.deleteMany({
        where: {
          OR: [{ AID: sessionUser.id }, { BID: sessionUser.id }],
        },
      });

      await tx.loginCode.deleteMany({
        where: { email: sessionUser.email },
      });

      await tx.user.delete({
        where: { id: sessionUser.id },
      });
    });

    req.session.destroy((error) => {
      if (error) {
        res.status(500).json({ error: "Account deleted, but failed to clear session." });
        return;
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Account deleted." });
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to delete account.", details });
  }
});


router.patch("/clean-id",requireProfileSession,async (req,res)=>{
  const sessionUser=req.session.user
  if(!sessionUser){
    return res.status(401).json({error:"Not authenticated"})
  }

  const cleanIdRaw = typeof req.body?.cleanId === "string" ? req.body.cleanId.trim().toLowerCase() : ""
  const CLEAN_ID_REGEX = /^[a-z0-9_]{3,20}$/
  if (!CLEAN_ID_REGEX.test(cleanIdRaw)) {
    return res.status(400).json({ error: "Invalid cleanId" })
  }
  if (cleanIdRaw === sessionUser.cleanId) {
    return res.json({ message: "cleanId unchanged", cleanId: cleanIdRaw })
  }

  const exists = await prisma.user.findUnique({ where: { cleanId: cleanIdRaw } })
  if (exists) {
    return res.status(409).json({ error: "cleanId already taken" })
  }

  const updatedUser = await prisma.user.update({
    where: { id: sessionUser.id },
    data: { cleanId: cleanIdRaw },
    select: { id: true, email: true, name: true, cleanId: true, avatar: true },
  })

  req.session.user = {
    ...sessionUser,
    cleanId: updatedUser.cleanId,
  }
  res.json({ message: "cleanId updated.", user: updatedUser })
})


router.get("/me/overview",async (req,res)=>{
    const sessionUser=req.session.user
    if(!sessionUser){
        return res.status(401).json({error:"Not authenticated"})
    }
    res.json({user:sessionUser})
})




export default router;
