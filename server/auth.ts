import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import {prisma,sha,randomToken,isProd,baseUrl} from './core.js';
import { rateLimit } from 'express-rate-limit';

const cookie='fh_admin_session';
const days=7*24*60*60*1000;
export type AdminRequest=Request & {adminId?:number};
export const loginLimiter=rateLimit({windowMs:15*60_000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'تلاش‌های زیادی انجام شده؛ ۱۵ دقیقه بعد دوباره امتحان کنید.'}});
function cookieOptions(){return {httpOnly:true,sameSite:'strict' as const,secure: isProd||process.env.SESSION_COOKIE_SECURE==='true',maxAge:days,path:'/'};}
export async function login(req:Request,res:Response){
 const email=String(req.body?.email||'').trim().toLowerCase(), pass=String(req.body?.password||'');
 const admin=await prisma.admin.findUnique({where:{email}});
 if(!admin||!await bcrypt.compare(pass,admin.passwordHash)) {res.status(401).json({error:'ایمیل یا رمز عبور اشتباه است.'});return;}
 const token=randomToken(); await prisma.adminSession.create({data:{adminId:admin.id,tokenHash:sha(token),expiresAt:new Date(Date.now()+days)}});
 res.cookie(cookie,token,cookieOptions());res.json({email:admin.email});
}
export async function requireAdmin(req:AdminRequest,res:Response,next:NextFunction){
 try {const token=req.cookies?.[cookie];if(!token||typeof token!=='string'){res.status(401).json({error:'لطفاً وارد پنل شوید.'});return;}
 const session=await prisma.adminSession.findUnique({where:{tokenHash:sha(token)},include:{admin:true}});
 if(!session||session.expiresAt<new Date()){res.status(401).json({error:'نشست شما منقضی شده است.'});return;}
 req.adminId=session.adminId;res.locals.email=session.admin.email;next();}catch(e){next(e);}
}
export async function logout(req:Request,res:Response){if(typeof req.cookies?.[cookie]==='string')await prisma.adminSession.deleteMany({where:{tokenHash:sha(req.cookies[cookie])}});res.clearCookie(cookie,{path:'/',sameSite:'strict',secure:isProd||process.env.SESSION_COOKIE_SECURE==='true'});res.json({ok:true});}
export function originGuard(req:Request,res:Response,next:NextFunction){
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 const origin=req.get('Origin');
 const allowed=[new URL(baseUrl).origin];if(!isProd)allowed.push('http://localhost:5173','http://127.0.0.1:5173');
 // Browser-origin requests only; stops cross-site POSTs even with session cookies.
 if(origin&&!allowed.includes(origin)){res.status(403).json({error:'مبدأ درخواست مجاز نیست.'});return;}
 if(!origin && req.path!=='/login' && req.path!=='/health' && !req.get('X-FootageHub-CLI')){res.status(403).json({error:'Origin لازم است.'});return;}
 next();
}
export async function audit(adminId:number|undefined,action:string,entity:string,entityId?:string,detail?:string){await prisma.auditLog.create({data:{adminId,action,entity,entityId,detail:detail?.slice(0,2000)}});}
