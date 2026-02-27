import {Router}from "express"
import{PrismaClient}from"@prisma/client"
import crypto from "crypto"
import nodemailer from "nodemailer"
import {AVATAR_URLS, DEFAULT_AVATAR} from "../avatar"
import { setDefaultAutoSelectFamily } from "net"

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


