import {Router}from "express"
import{PrismaClient}from"@prisma/client"
import crypto from "crypto"
import nodemailer from "nodemailer"
import { DEFAULT_AVATAR } from "../avatar"

const router = Router()
const prisma = new PrismaClient()
const Email_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_LENGTH=6
//LIVE TIME
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const SMTP_USER =process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "CleanChat <no-reply@CleanChat.local>";
const LOGIN_CODE_SECRET = process.env.LOGIN_CODE_SECRET || "default_secret";
 
const mailer=nodemailer.createTransport({
    service:"gmail",
    auth:{
        user:SMTP_USER,
        pass:SMTP_PASS
    }
})

function generateLoginCode():string{
    const max=10**CODE_LENGTH
      return crypto.randomInt(0, max).toString().padStart(CODE_LENGTH, "0");
}
function hashCode(code:string):string{
    return crypto.createHmac("sha256", LOGIN_CODE_SECRET).update(code).digest("hex");
}

function generateCleanId(): string {
  return `u_${crypto.randomBytes(6).toString("hex")}`
}

async function generateUniqueCleanId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCleanId()
    const exists = await prisma.user.findUnique({ where: { cleanId: candidate } })
    if (!exists) {
      return candidate
    }
  }
  throw new Error("Failed to generate unique cleanId")
}

async function sendLoginCode(name:string,email:string, code:string){
const subject = "NO REPLY Your CleanCode verification code";


const text = `Hello ${name},

Your CleanCode verification code is: ${code}

It expires in 10 minutes.

If you didn’t request this code, you can ignore this email.`;

const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5;">
    <p>Hello ${name},</p>

    <p>Your CleanCode verification code is:</p>

    <div style="
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 6px;
      margin: 12px 0 8px 0;
    ">
      ${code}
    </div>

    <div style="font-size: 12px; color: #666; margin-top: 6px;">
      Expires in 10 minutes. You’re receiving this email because you requested access to your CleanCode account.
    </div>

    <p style="font-size: 12px; color: #666; margin-top: 16px;">
      If you didn’t request this code, you can ignore this email.
    </p>
  </div>
`;
await mailer.sendMail({
    from:SMTP_FROM,
    to:email,
    subject,
    text,
    html
})  
}


router.post("/email/start",async(req,res)=>{
  try{
    const email=typeof req.body.email==="string"?req.body.email.toLowerCase().trim():""
    if(!Email_REGEX.test(email)){
      return res.status(400).json({error:"Invalid email"})
    }
    if (!LOGIN_CODE_SECRET || !mailer) {
      res.status(500).json({ message: "Email login is not configured." });
      return;
    }

    const now = new Date()
    const user=await prisma.user.findUnique({where:{email},
      select:{name:true}})
    let name:string;
    if(!user){
      name="New User"

    }else{
      name = user.name
    }

    const activeCode = await prisma.loginCode.findFirst({
      where: {
        email,
        usedAt: null,
        expireAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    })
    if (activeCode) {
      res.status(429).json({ message: "A verification code is already active. Please wait for it to expire." });
      return;
    }

    const code=generateLoginCode()
    const hashedCode=hashCode(code)
    const expireAt=new Date(Date.now()+CODE_TTL_MS)
    await prisma.$transaction(
      [
        prisma.loginCode.deleteMany({
          where:{
            email,
          },
        }),
        prisma.loginCode.create({
          data:{
            email,
            codeHash:hashedCode,
            expireAt,
          }
        })
      ]
    )

    if(process.env.NODE_ENV !== "test"){
      await sendLoginCode(name,email,code)
    }

    res.json({message:"Verification code sent"})
  }catch(error){
    const details = error instanceof Error ? error.message : String(error)
    console.error("Failed to start email verification:", error)
    res.status(500).json({
      error: `Failed to send verification code email: ${details}`,
    })
  }
})


router.post("/email/verify",async(req,res)=>{
    const email=typeof req.body.email==="string"?req.body.email.toLowerCase().trim():""
    const code=typeof req.body.code==="string"?req.body.code.trim():""
    if(!Email_REGEX.test(email)){
        return res.status(400).json({error:"Invalid email"})
    }
    if(code.length!==CODE_LENGTH){
        return res.status(400).json({error:"Invalid code"})
    }
    if (!LOGIN_CODE_SECRET || !mailer) {
    res.status(500).json({ message: "Email login is not configured." });
    return;
  }
  const loginCode=await prisma.loginCode.findFirst({
    where:{
        email,
        usedAt: null,
        expireAt: { gt: new Date() },
    },
})
if(!loginCode){
    return res.status(400).json({error:"Invalid or expired code"})
}
 if (!loginCode) {
    res.status(401).json({ message: "Invalid or expired code." });
    return;
  }
if (loginCode.attempts >= MAX_ATTEMPTS) {
    res.status(429).json({ message: "Too many failed attempts. Please request a new code." });
    return;
  }
  const providedCodeHash = hashCode(code)
  const storedHash = loginCode.codeHash
  const hashesMatch=   providedCodeHash.length === storedHash.length && providedCodeHash === storedHash;

  if (!hashesMatch) {
    await prisma.loginCode.update({
      where: { id: loginCode.id },
      data: { attempts: loginCode.attempts + 1 },
    });
    res.status(401).json({ message: "Invalid or expired code." });
    return;
  }
  await prisma.loginCode.deleteMany({ where: { email } });

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, avatar: true, cleanId: true },
  });

  const isNewUser = !existingUser
  const user = existingUser
    ? existingUser
    : await prisma.user.create({
        data: {
          email,
          name: email.split("@")[0],
          avatar: DEFAULT_AVATAR,
          cleanId: await generateUniqueCleanId(),
        },
      });
    req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    cleanId: user.cleanId,
    provider: "email",
  };

 res.json({message:"Login code verified",user,isNewUser})
})



router.get("/me",(req,res)=>{
    if(!req.session.user){
        return res.status(401).json({error:"Not authenticated"})
    }
    res.json({user:req.session.user})

})
router.post("/logout",(req,res)=>{
    req.session.destroy((err)=>{
        if(err){ res.status(500).json({error:"Failed to log out"})}
        else{res.json({message:"Logged out successfully"})}
    })
})

export default router
