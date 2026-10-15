import crypto from 'node:crypto';

/** Pure business/security rules (no DB dependency); unit tested. */
export type Publishable={status:string;rightsVerified:boolean;accessType:string;starsPrice:number|null};
export function canPublish(p:Publishable,fileCount:number){
 if(p.status!=='PUBLISHED')return true;
 if(!p.rightsVerified||fileCount<1)return false;
 if(['PURCHASE','PURCHASE_OR_PRO'].includes(p.accessType)&&(!Number.isInteger(p.starsPrice)||(p.starsPrice??0)<1))return false;
 return true;
}
export function allowedFileUrl(raw:string,allowedHosts:string[]){
 try {const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&allowedHosts.includes(url.hostname.toLowerCase());}catch{return false;}
}
export type DownloadClaims={p:number;f:number;u:string;exp:number};
export function signClaims(data:DownloadClaims,secret:string){
 if(secret.length<32)throw new Error('Signing secret too short');
 const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
 const hmac=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 return `${payload}.${hmac}`;
}
export function readClaims(token:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):DownloadClaims|null{
 if(!/^[\w-]+\.[\w-]+$/.test(token)||secret.length<32)return null;
 const [payload,mac]=token.split('.');const computed=crypto.createHmac('sha256',secret).update(payload).digest();const supplied=Buffer.from(mac,'base64url');
 if(computed.length!==supplied.length||!crypto.timingSafeEqual(computed,supplied))return null;
 try {const data=JSON.parse(Buffer.from(payload,'base64url').toString()) as DownloadClaims;
  if(Number.isSafeInteger(data.p)&&data.p>0&&Number.isSafeInteger(data.f)&&data.f>0&&/^\d{1,20}$/.test(data.u)&&Number.isSafeInteger(data.exp)&&data.exp>nowSeconds&&data.exp<=nowSeconds+3600)return data;
  return null;
 }catch{return null;}
}
