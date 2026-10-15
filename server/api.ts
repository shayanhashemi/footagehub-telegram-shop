import express, {type Express, type Request, type Response, type NextFunction} from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import {z,ZodError} from 'zod';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prisma,getSetting,setSettings,verifyDownload,safeUrl,publicMediaUrl,publishedReady,formatError,baseUrl,isProd} from './core.js';
import {login,logout,requireAdmin,originGuard,loginLimiter,audit,type AdminRequest} from './auth.js';
import {bot} from './bot.js';

const bool=z.boolean();
const maybeText=z.string().trim().max(8000).nullish();
const categorySchema=z.object({code:z.string().trim().min(1).max(100),parentId:z.number().int().positive().nullable(),nameFa:z.string().trim().min(1).max(190),nameEn:z.string().trim().min(1).max(190),slug:z.string().trim().min(1).max(210),groupKey:z.string().max(80).nullish(),active:bool,sortOrder:z.number().int()});
const fileSchema=z.object({label:z.string().trim().min(1).max(190),privateUrl:z.string().trim().url().max(8000),fileName:z.string().trim().max(255).nullish()});
const productSchema=z.object({
 sku:z.string().trim().min(3).max(100),categoryId:z.number().int().positive(),titleFa:z.string().trim().min(2).max(255),titleEn:z.string().trim().min(2).max(255),
 descriptionFa:z.string().max(8000).default(''),descriptionEn:z.string().max(8000).default(''),type:z.enum(['PACK','SINGLE']),status:z.enum(['DRAFT','PUBLISHED','HIDDEN','ARCHIVED']),accessType:z.enum(['FREE','PURCHASE','PRO','PURCHASE_OR_PRO']),rightsVerified:bool,
 starsPrice:z.number().int().min(1).max(1000000).nullable(),coverUrl:maybeText,previewUrl:maybeText,fileFormat:z.string().max(80).nullish(),fileCount:z.number().int().nonnegative().nullish(),fileSizeMb:z.number().nonnegative().nullish(),resolution:z.string().max(120).nullish(),fps:z.number().int().nonnegative().nullish(),software:z.string().max(160).nullish(),tags:z.string().max(8000).default(''),sortOrder:z.number().int().default(0),files:z.array(fileSchema).max(25)
});
const number=(raw:unknown,defaultVal=1)=>Math.max(1,Math.min(100000,Number(raw)||defaultVal));
const pageNum=(raw:unknown)=>Math.max(1,Math.min(99999,Number(raw)||1));
const intId=(raw:unknown)=>{const n=Number(raw);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(new Error('شناسه نامعتبر است.'),{status:400});return n;};
const asyncSafe=(fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req,res,next)).catch(next);};
async function log(req:Request,action:string,entity:string,id?:string,detail?:string){await audit((req as AdminRequest).adminId,action,entity,id,detail);}
function normalizeProduct(body:unknown){const data=productSchema.parse(body);
 if(!data.files.every(f=>safeUrl(f.privateUrl)))throw Object.assign(new Error('هاست لینک دانلود مجاز نیست. فقط HTTPS و دامنه‌های DOWNLOAD_ALLOWED_HOSTS پذیرفته می‌شوند.'),{status:400});
 if(!publicMediaUrl(data.coverUrl)||!publicMediaUrl(data.previewUrl))throw Object.assign(new Error('آدرس کاور/پیش‌نمایش باید HTTPS عمومی باشد.'),{status:400});
 if(!publishedReady(data,data.files.length))throw Object.assign(new Error('برای انتشار: حق بازنشر تأیید شود، حداقل یک فایل ثبت شود و قیمت استارزی (در حالت خریدی) معتبر باشد.'),{status:400});
 return {...data,coverUrl:data.coverUrl||null,previewUrl:data.previewUrl||null,fileFormat:data.fileFormat||null,fileCount:data.fileCount??null,fileSizeMb:data.fileSizeMb??null,resolution:data.resolution||null,fps:data.fps??null,software:data.software||null,starsPrice:data.starsPrice??null};
}
async function createsCycle(id:number,parentId:number|null){if(parentId===null)return false;const all=await prisma.category.findMany({select:{id:true,parentId:true}});const map=new Map(all.map(c=>[c.id,c.parentId]));let curr:number|null|undefined=parentId;const seen=new Set<number>();while(curr!==null&&curr!==undefined){if(curr===id||seen.has(curr))return true;seen.add(curr);curr=map.get(curr);}return false;}
export function createApp():Express{
 const app=express();app.disable('x-powered-by');app.set('trust proxy',process.env.TRUST_PROXY==='true'?1:false);
 app.use(helmet({contentSecurityPolicy:isProd?{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:','https:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"]}}:false}));app.use(express.json({limit:'1mb'}));app.use(cookieParser());
 const mediaDir=path.resolve(process.env.MEDIA_DIR||'uploads');
 app.use('/media',express.static(mediaDir,{index:false,maxAge:'7d',immutable:true,setHeaders:(res)=>res.setHeader('X-Content-Type-Options','nosniff')}));
 app.get('/api/health',(_req,res)=>res.json({ok:true,service:'FootageHub',botConfigured:!!bot}));
 app.use('/api',originGuard);
 app.post('/api/login',loginLimiter,asyncSafe(login));
 app.get('/api/me',requireAdmin,(req,res)=>res.json({email:res.locals.email}));
 app.post('/api/logout',requireAdmin,asyncSafe(logout));
 app.use('/api',requireAdmin);
 app.post('/api/media/upload',express.raw({type:['image/png','image/jpeg','image/webp'],limit:'5mb'}),asyncSafe(async(req,res)=>{
  const data=req.body as Buffer;
  const mime=req.get('Content-Type')?.split(';')[0];
  const valid=Buffer.isBuffer(data)&&data.length>16&&data.length<=5*1024*1024&&(
   (mime==='image/png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
   (mime==='image/jpeg'&&data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)||
   (mime==='image/webp'&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')
  );
  if(!valid)return res.status(400).json({error:'فقط PNG/JPEG/WebP معتبر تا حجم ۵ مگابایت قابل بارگذاری است.'});
  const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  await mkdir(mediaDir,{recursive:true,mode:0o750});
  const name=`${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${ext}`;
  await writeFile(path.join(mediaDir,name),data,{flag:'wx',mode:0o640});
  await log(req,'UPLOAD','media',name);res.status(201).json({url:`${baseUrl}/media/${name}`});
 }));
 app.get('/api/dashboard',asyncSafe(async(_req,res)=>{
  const [products,published,drafts,categories,users,paidOrders,stars,recent,activePro]=await Promise.all([
   prisma.product.count(),prisma.product.count({where:{status:'PUBLISHED'}}),prisma.product.count({where:{status:'DRAFT'}}),prisma.category.count(),prisma.user.count(),prisma.order.count({where:{status:'PAID'}}),prisma.order.aggregate({where:{status:'PAID'},_sum:{amountXtr:true}}),prisma.order.findMany({take:7,orderBy:{createdAt:'desc'},include:{user:{select:{telegramId:true,displayName:true}},product:{select:{titleFa:true,sku:true}}}}),getSetting('PRO_CHANNEL_ID')]);
  res.json({products,published,drafts,categories,users,paidOrders,totalStars:stars._sum.amountXtr||0,recent,proConfigured:!!activePro});
 }));
 app.get('/api/categories',asyncSafe(async(_req,res)=>{
  const data=await prisma.category.findMany({orderBy:[{parentId:'asc'},{sortOrder:'asc'},{id:'asc'}],include:{_count:{select:{products:true,children:true}}}});res.json(data);
 }));
 app.post('/api/categories',asyncSafe(async(req,res)=>{
  const data=categorySchema.parse(req.body);
  if(data.parentId&&!await prisma.category.findUnique({where:{id:data.parentId}}))return res.status(400).json({error:'دسته والد وجود ندارد.'});
  const row=await prisma.category.create({data:{...data,groupKey:data.groupKey||null}});await log(req,'CREATE','category',String(row.id),row.code);res.status(201).json(row);
 }));
 app.put('/api/categories/:id',asyncSafe(async(req,res)=>{
  const id=intId(req.params.id),data=categorySchema.parse(req.body);
  if(await createsCycle(id,data.parentId))return res.status(400).json({error:'دسته نمی‌تواند زیرمجموعه خودش باشد.'});
  if(data.parentId&&!await prisma.category.findUnique({where:{id:data.parentId}}))return res.status(400).json({error:'والد یافت نشد.'});
  const row=await prisma.category.update({where:{id},data:{...data,groupKey:data.groupKey||null}});await log(req,'UPDATE','category',String(id),row.code);res.json(row);
 }));
 app.delete('/api/categories/:id',asyncSafe(async(req,res)=>{
  const id=intId(req.params.id),[children,products]=await Promise.all([prisma.category.count({where:{parentId:id}}),prisma.product.count({where:{categoryId:id}})]);
  if(children||products)return res.status(409).json({error:'ابتدا زیردسته‌ها و محصولات این دسته را منتقل یا حذف کنید.'});
  await prisma.category.delete({where:{id}});await log(req,'DELETE','category',String(id));res.json({ok:true});
 }));
 app.get('/api/products',asyncSafe(async(req,res)=>{
  const pg=pageNum(req.query.page),take=20,search=String(req.query.search||'').trim().slice(0,100);
  const status=String(req.query.status||''),where={...(status&&status!=='ALL'?{status:status as 'DRAFT'|'PUBLISHED'|'HIDDEN'|'ARCHIVED'}:{}),...(req.query.categoryId?{categoryId:intId(req.query.categoryId)}:{}),...(search?{OR:[{titleFa:{contains:search}},{titleEn:{contains:search}},{sku:{contains:search}}]}:{})};
  const [total,rows]=await Promise.all([prisma.product.count({where}),prisma.product.findMany({where,orderBy:{updatedAt:'desc'},skip:(pg-1)*take,take,include:{category:{select:{nameFa:true,nameEn:true}},files:true}})]);
  res.json({total,page:pg,pages:Math.max(1,Math.ceil(total/take)),rows});
 }));
 app.post('/api/products',asyncSafe(async(req,res)=>{
  const data=normalizeProduct(req.body),{files,...product}=data;
  const row=await prisma.product.create({data:{...product,files:{create:files.map(f=>({...f,fileName:f.fileName||null}))}}});await log(req,'CREATE','product',String(row.id),row.sku);res.status(201).json(row);
 }));
 app.put('/api/products/:id',asyncSafe(async(req,res)=>{
  const id=intId(req.params.id),data=normalizeProduct(req.body),{files,...product}=data;
  const row=await prisma.$transaction(async tx=>{
   const updated=await tx.product.update({where:{id},data:product});
   await tx.productFile.deleteMany({where:{productId:id}});
   if(files.length)await tx.productFile.createMany({data:files.map(f=>({productId:id,label:f.label,privateUrl:f.privateUrl,fileName:f.fileName||null}))});
   return updated;
  });
  await log(req,'UPDATE','product',String(id),row.sku);res.json(row);
 }));
 app.delete('/api/products/:id',asyncSafe(async(req,res)=>{
  const id=intId(req.params.id),row=await prisma.product.findUnique({where:{id},include:{_count:{select:{orders:true,entitlements:true}}}});
  if(!row)return res.status(404).json({error:'محصول یافت نشد.'});
  if(row._count.orders||row._count.entitlements)return res.status(409).json({error:'این محصول سابقه فروش دارد. به‌جای حذف، آن را بایگانی کنید.'});
  await prisma.product.delete({where:{id}});await log(req,'DELETE','product',String(id),row.sku);res.json({ok:true});
 }));
 app.get('/api/orders',asyncSafe(async(req,res)=>{
  const pg=pageNum(req.query.page),take=25;
  const [total,rows]=await Promise.all([prisma.order.count(),prisma.order.findMany({orderBy:{createdAt:'desc'},take,skip:(pg-1)*take,include:{product:{select:{titleFa:true,sku:true}},user:{select:{telegramId:true,displayName:true}},payments:true}})]);
  res.json({rows,total,page:pg,pages:Math.max(1,Math.ceil(total/take))});
 }));
 app.post('/api/orders/:id/refund',asyncSafe(async(req,res)=>{
  if(!bot)return res.status(503).json({error:'BOT_TOKEN تعریف نشده است.'});
  const order=await prisma.order.findUnique({where:{id:String(req.params.id)},include:{payments:true,user:true}});
  if(!order||order.status!=='PAID'||order.payments.length!==1)return res.status(400).json({error:'سفارش پرداخت‌شده معتبر برای استرداد یافت نشد.'});
  // Do not refund DB-side before Telegram confirms success.
  await bot.api.refundStarPayment(Number(order.user.telegramId),order.payments[0].telegramPaymentChargeId);
  await prisma.$transaction(async tx=>{
   await tx.order.update({where:{id:order.id},data:{status:'REFUNDED'}});
   await tx.payment.update({where:{orderId:order.id},data:{refundStatus:'REFUNDED'}});
   // Keep entitlement if a different paid order for this product still exists.
   const activePaid=await tx.order.count({where:{userId:order.userId,productId:order.productId,status:'PAID'}});
   if(activePaid===0)await tx.entitlement.updateMany({where:{userId:order.userId,productId:order.productId,source:'PURCHASE'},data:{status:'REVOKED'}});
  });
  await log(req,'REFUND','order',order.id,'Telegram Star refund');res.json({ok:true});
 }));
 app.get('/api/users',asyncSafe(async(req,res)=>{
  const pg=pageNum(req.query.page),take=25,search=String(req.query.search||'').slice(0,100);
  const where=search?{OR:[{telegramId:{contains:search}},{displayName:{contains:search}}]}:{};
  const [total,rows]=await Promise.all([prisma.user.count({where}),prisma.user.findMany({where,orderBy:{createdAt:'desc'},skip:(pg-1)*take,take,include:{_count:{select:{orders:true,entitlements:true}}}})]);
  res.json({total,rows,page:pg,pages:Math.max(1,Math.ceil(total/take))});
 }));
 app.patch('/api/users/:id',asyncSafe(async(req,res)=>{
  const id=intId(req.params.id),data=z.object({isBlocked:z.boolean()}).parse(req.body);
  const row=await prisma.user.update({where:{id},data});await log(req,'UPDATE','user',String(id),`blocked=${row.isBlocked}`);res.json(row);
 }));
 app.get('/api/settings',asyncSafe(async(_req,res)=>{
  const rows=await prisma.setting.findMany();res.json(Object.fromEntries(rows.map(r=>[r.key,r.value])));
 }));
 app.put('/api/settings',asyncSafe(async(req,res)=>{
  const data=z.object({STORE_NAME:z.string().trim().min(1).max(100),SUPPORT_USERNAME:z.string().trim().max(100),PRO_CHANNEL_ID:z.string().trim().max(100),PRO_PRICE_XTR:z.coerce.number().int().min(1).max(10000),ALLOW_ARCHIVED_DOWNLOADS:z.enum(['true','false'])}).parse(req.body);
  const oldPrice=await getSetting('PRO_PRICE_XTR','100'),oldChannel=await getSetting('PRO_CHANNEL_ID');
  await setSettings({...data,PRO_PRICE_XTR:String(data.PRO_PRICE_XTR),...((oldPrice!==String(data.PRO_PRICE_XTR)||oldChannel!==data.PRO_CHANNEL_ID)?{PRO_INVITE_LINK:''}:{})});
  await log(req,'UPDATE','settings',undefined,'General and PRO settings');res.json({ok:true});
 }));
 app.post('/api/settings/generate-pro-link',asyncSafe(async(req,res)=>{
  const channel=await getSetting('PRO_CHANNEL_ID'),price=Number(await getSetting('PRO_PRICE_XTR','100'));
  if(!bot||!channel)return res.status(400).json({error:'ابتدا BOT_TOKEN و شناسه کانال PRO را تنظیم کنید.'});
  const invitation=await bot.api.createChatSubscriptionInviteLink(channel,2592000,price,{name:'Footage Hub PRO'});
  await setSettings({PRO_INVITE_LINK:invitation.invite_link});await log(req,'GENERATE','pro_subscription',undefined,`price=${price}`);res.json({link:invitation.invite_link});
 }));
 app.get('/api/audit',asyncSafe(async(req,res)=>{
  const pg=pageNum(req.query.page),take=30;const [total,rows]=await Promise.all([prisma.auditLog.count(),prisma.auditLog.findMany({orderBy:{createdAt:'desc'},take,skip:(pg-1)*take})]);res.json({rows,total,page:pg,pages:Math.max(1,Math.ceil(total/take))});
 }));
 app.get('/download/:token',rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false}),asyncSafe(async(req,res)=>{
  const token=verifyDownload(String(req.params.token));if(!token)return res.status(403).send('Download link expired or invalid. Request a new link in the bot.');
  const file=await prisma.productFile.findUnique({where:{id:token.f},include:{product:true}});
  if(!file||file.productId!==token.p||!file.product.rightsVerified||file.product.status==='DRAFT'||!safeUrl(file.privateUrl))return res.status(403).send('File unavailable');
  if(file.product.status==='ARCHIVED'&&(await getSetting('ALLOW_ARCHIVED_DOWNLOADS','true'))!=='true')return res.status(403).send('Archived file unavailable');
  const user=await prisma.user.findUnique({where:{telegramId:token.u}});if(!user||user.isBlocked)return res.status(403).send('Account unavailable');
  // Signed URL proves authorization at issuance. Verify paid entitlement again unless FREE;
  // PRO was verified live when signing, and token is valid only for five minutes.
  if(file.product.accessType!=='FREE'&&file.product.accessType!=='PRO'){
   const hasEnt=await prisma.entitlement.count({where:{userId:user.id,productId:file.productId,status:'ACTIVE',OR:[{validUntil:null},{validUntil:{gt:new Date()}}]}});
   if(!hasEnt&&file.product.accessType==='PURCHASE')return res.status(403).send('Entitlement revoked');
  }
  try{
   const headers:Record<string,string>={'Accept-Encoding':'identity'};const range=req.get('range');if(range&&/^bytes=\d*-\d*$/.test(range))headers.Range=range;
   const upstream=await fetch(file.privateUrl,{headers,redirect:'manual',signal:AbortSignal.timeout(600000)});
   if(upstream.status!==200&&upstream.status!==206||!upstream.body)throw new Error(`Upstream rejected: ${upstream.status}`);
   res.status(upstream.status);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/octet-stream');res.setHeader('Accept-Ranges','bytes');
   const name=(file.fileName||`footagehub-${file.id}.zip`).replace(/[\r\n"\\/]/g,'_');res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
   for(const h of ['content-length','content-range']){const value=upstream.headers.get(h);if(value)res.setHeader(h,value);}
   await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream),res);
  }catch(e){console.error('Download proxy:',formatError(e));if(!res.headersSent)res.status(502).send('The upstream file server is unavailable. Please retry later.');else res.destroy();}
 }));
 // Serve the compiled dashboard only in deployment. Vite dev serves it separately.
 const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../dist');
 if(existsSync(path.join(dist,'index.html'))){app.use(express.static(dist,{index:false,maxAge:'1h'}));app.get(/^(?!\/api\/|\/download\/).*/,(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
 app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  const status=err instanceof ZodError?400:typeof err==='object'&&err!==null&&'status'in err?Number((err as {status:number}).status)||500:500;
  if(status>=500)console.error('API error:',formatError(err));
  const message=err instanceof ZodError?err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' | '):status>=500?'خطای داخلی سرور. لطفاً دوباره تلاش کنید.':formatError(err);
  if(!res.headersSent)res.status(status).json({error:message});
 });
 return app;
}
