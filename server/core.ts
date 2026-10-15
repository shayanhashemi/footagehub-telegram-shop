import 'dotenv/config';
import { PrismaClient, type Product } from '@prisma/client';
import crypto from 'node:crypto';
import {canPublish,allowedFileUrl,signClaims,readClaims,type DownloadClaims} from './policy.js';
export const prisma = new PrismaClient({log:process.env.NODE_ENV==='development'?['error','warn']:['error']});
export const isProd = process.env.NODE_ENV==='production';
export const baseUrl = (process.env.PUBLIC_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
export const signingSecret = process.env.DOWNLOAD_SIGNING_SECRET||'';
export const allowedHosts = (process.env.DOWNLOAD_ALLOWED_HOSTS||'dl.footagefx.com').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
export const sha = (s:string)=>crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = ()=>crypto.randomBytes(32).toString('hex');
export const safeUrl = (url:string)=>allowedFileUrl(url,allowedHosts);
export const publicMediaUrl = (raw:string|null|undefined) => !raw || (!isProd&&raw.startsWith(baseUrl+'/media/')) || (raw.startsWith('https://') && !/^(https:\/\/)(localhost|127\.|10\.|192\.168\.)/i.test(raw));
export async function getSetting(key:string, fallback=''){return (await prisma.setting.findUnique({where:{key}}))?.value??fallback;}
export async function setSettings(data:Record<string,string>){await prisma.$transaction(Object.entries(data).map(([key,value])=>prisma.setting.upsert({where:{key},create:{key,value},update:{value}})));}
export function publishedReady(p:Pick<Product,'status'|'rightsVerified'|'accessType'|'starsPrice'>,files:number){return canPublish(p,files);}
export type TokenData = DownloadClaims;
export const signDownload=(data:TokenData)=>signClaims(data,signingSecret);
export const verifyDownload=(token:string)=>readClaims(token,signingSecret);
export const formatError=(e:unknown)=>e instanceof Error?e.message:'Unknown error';
