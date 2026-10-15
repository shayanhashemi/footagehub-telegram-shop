import {Bot,InlineKeyboard, type Context} from 'grammy';
import {prisma,getSetting,signDownload,baseUrl,formatError} from './core.js';
import type {Product,User,Category} from '@prisma/client';

export const bot = process.env.BOT_TOKEN ? new Bot(process.env.BOT_TOKEN) : null;
type Lang='fa'|'en';
const msg = {
 fa:{welcome:'به فروشگاه Footage Hub خوش آمدید 💜\nفایل‌های تدوین را از منو پیدا کنید.',library:'📂 کتابخانه فایل‌ها',search:'🔎 جست‌وجو',latest:'🆕 جدیدترین‌ها',free:'🎁 دانلود رایگان',pro:'👑 عضویت PRO',purchases:'🛒 خریدهای من',support:'💬 پشتیبانی',language:'🌐 زبان',back:'↩ بازگشت',home:'⌂ منوی اصلی',empty:'فعلاً محصول منتشرشده‌ای در این بخش وجود ندارد.',notfound:'محصول پیدا نشد یا منتشر نشده است.',buy:'⭐ خرید محصول',preview:'▶️ پیش‌نمایش',download:'📥 دریافت فایل',proAccess:'👑 دسترسی PRO',stars:'⭐ پرداخت با استارز',bank:'🏦 درگاه بانکی (غیرفعال)',card:'💳 کارت‌به‌کارت (غیرفعال)',bankOff:'درگاه پرداخت بانکی در حال حاضر غیرفعال است. لطفاً برای خرید این محصول از پرداخت با ستاره‌های تلگرام استفاده کنید. 💜',cardOff:'پرداخت کارت‌به‌کارت برای خرید محصولات دیجیتال در این ربات فعال نیست. لطفاً از پرداخت با ستاره‌های تلگرام استفاده کنید.',noAccess:'برای دریافت این فایل، ابتدا محصول را خریداری کنید یا از طریق عضویت معتبر PRO به آن دسترسی بگیرید.',success:'پرداخت شما با موفقیت ثبت شد. فایل شما آماده دریافت است.',fileError:'در دریافت فایل مشکلی پیش آمده است. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',searchPrompt:'نام یا کد محصول را بفرستید:',choose:'یکی را انتخاب کنید:',proInfo:'👑 عضویت PRO\nدسترسی فقط برای محصولات دارای مجوز PRO و در مدت عضویت معتبر فعال است.',channelError:'بررسی عضویت PRO فعلاً ممکن نیست. لطفاً با پشتیبانی تماس بگیرید.',invoiceError:'در ایجاد فاکتور خطایی رخ داد. دوباره تلاش کنید.',priceNeeded:'قیمت این محصول هنوز تعیین نشده است.',rights:'این محصول برای دانلود در دسترس نیست.',noPurchases:'هنوز خرید موفقی ندارید.',page:'صفحه'},
 en:{welcome:'Welcome to Footage Hub 💜\nExplore editing assets from the menu.',library:'📂 Asset Library',search:'🔎 Search Assets',latest:'🆕 Latest Uploads',free:'🎁 Free Downloads',pro:'👑 PRO Access',purchases:'🛒 My Purchases',support:'💬 Support',language:'🌐 Language',back:'↩ Back',home:'⌂ Main Menu',empty:'No published products here yet.',notfound:'Product not found or unavailable.',buy:'⭐ Buy Pack',preview:'▶️ Preview',download:'📥 Download',proAccess:'👑 PRO Access',stars:'⭐ Pay with Stars',bank:'🏦 Bank gateway (disabled)',card:'💳 Card transfer (disabled)',bankOff:'Bank payment is currently unavailable. Please pay with Telegram Stars.',cardOff:'Card transfer is not available for digital products in this bot. Please use Telegram Stars.',noAccess:'Please buy this product or join PRO to download.',success:'Your payment was confirmed. Your file is ready.',fileError:'File delivery failed. Please retry or contact support.',searchPrompt:'Send a product name or SKU:',choose:'Choose an option:',proInfo:'👑 PRO subscription\nAccess applies only to PRO-eligible assets while your channel membership is active.',channelError:'Unable to verify your PRO membership. Contact support.',invoiceError:'Could not create invoice. Please retry.',priceNeeded:'The price is not configured yet.',rights:'This asset is not available for download.',noPurchases:'No paid purchases yet.',page:'Page'}
};
const t=(l:Lang,k:keyof typeof msg.fa)=>msg[l][k];
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const label=(x:{nameFa:string;nameEn:string},l:Lang)=>l==='fa'?(x.nameFa||x.nameEn):(x.nameEn||x.nameFa);
const title=(x:{titleFa:string;titleEn:string},l:Lang)=>l==='fa'?(x.titleFa||x.titleEn):(x.titleEn||x.titleFa);
const PAGE_SIZE=8;
async function ensureUser(ctx:Context){
 if (!ctx.from)throw new Error('no user');
 const telegramId=String(ctx.from.id);
 return prisma.user.upsert({where:{telegramId},create:{telegramId,displayName:ctx.from.first_name||'',language:ctx.from.language_code==='en'?'en':'fa'},update:{displayName:ctx.from.first_name||''}});
}
const locale=(u:User):Lang=>u.language==='en'?'en':'fa';
function homeKeyboard(l:Lang){return new InlineKeyboard().text(t(l,'library'),'nav:0:0').text(t(l,'search'),'search').row().text(t(l,'latest'),'latest:0').text(t(l,'free'),'free:0').row().text(t(l,'pro'),'pro').text(t(l,'purchases'),'purchases:0').row().text(t(l,'support'),'support').text(t(l,'language'),'language');}
function foot(k:InlineKeyboard,l:Lang,parentId:number|null=0){return k.row().text(t(l,'back'),`nav:${parentId??0}:0`).text(t(l,'home'),'home');}
async function reply(ctx:Context,text:string,k?:InlineKeyboard,html=false){if(!ctx.chat)return;await ctx.api.sendMessage(ctx.chat.id,text,{...(html?{parse_mode:'HTML' as const}:{}),...(k?{reply_markup:k}:{})});}
async function mainMenu(ctx:Context,u:User){await reply(ctx,t(locale(u),'welcome'),homeKeyboard(locale(u)));}
async function visibleCatalog(){
 const [categories,products]=await Promise.all([prisma.category.findMany({where:{active:true},orderBy:[{sortOrder:'asc'},{id:'asc'}]}),prisma.product.findMany({where:{status:'PUBLISHED',rightsVerified:true,category:{active:true},files:{some:{}}},select:{id:true,categoryId:true}})]);
 const byId=new Map(categories.map(c=>[c.id,c]));const counts=new Map<number,number>();
 for(const p of products){let cat=byId.get(p.categoryId);while(cat){counts.set(cat.id,(counts.get(cat.id)||0)+1);cat=cat.parentId?byId.get(cat.parentId):undefined;}}
 return {categories,byId,counts};
}
async function showNav(ctx:Context,u:User,parentId:number,page:number){
 const l=locale(u),{categories,counts,byId}=await visibleCatalog();
 if(parentId!==0 && !byId.has(parentId)){await reply(ctx,t(l,'notfound'),foot(new InlineKeyboard(),l,0));return;}
 const children=categories.filter(c=>(c.parentId??0)===parentId&&(counts.get(c.id)||0)>0);
 if(children.length===0){if(parentId)await showListing(ctx,u,{categoryId:parentId},0);else await reply(ctx,t(l,'empty'),foot(new InlineKeyboard(),l));return;}
 const total=Math.ceil(children.length/PAGE_SIZE),pg=Math.max(0,Math.min(page,total-1));
 const k=new InlineKeyboard();for(const c of children.slice(pg*PAGE_SIZE,(pg+1)*PAGE_SIZE))k.text(`${label(c,l)} (${counts.get(c.id)})`,`nav:${c.id}:0`).row();
 if(pg>0)k.text('◀',`nav:${parentId}:${pg-1}`);
 if(pg<total-1)k.text('▶',`nav:${parentId}:${pg+1}`);
 const breadcrumb=parentId?label(byId.get(parentId)!,l):t(l,'library');
 foot(k,l,byId.get(parentId)?.parentId);
 await reply(ctx,`${breadcrumb}\n${t(l,'page')} ${pg+1}/${total}`,k);
}
async function showListing(ctx:Context,u:User,where:{categoryId?:number;free?:boolean;latest?:boolean;search?:string},page:number){
 const l=locale(u);
 const findWhere={status:'PUBLISHED' as const,rightsVerified:true,category:{active:true},files:{some:{}},...(where.categoryId?{categoryId:where.categoryId}:{}),...(where.free?{accessType:'FREE' as const}:{}),...(where.search?{OR:[{titleFa:{contains:where.search}},{titleEn:{contains:where.search}},{sku:{contains:where.search}},{tags:{contains:where.search}}]}:{})};
 const total=await prisma.product.count({where:findWhere});const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),pg=Math.max(0,Math.min(page,pages-1));
 const products=await prisma.product.findMany({where:findWhere,orderBy:where.latest?[{createdAt:'desc'}]:[{sortOrder:'asc'},{createdAt:'desc'}],skip:pg*PAGE_SIZE,take:PAGE_SIZE});
 if(!products.length){await reply(ctx,t(l,'empty'),foot(new InlineKeyboard(),l,where.categoryId||0));return;}
 const k=new InlineKeyboard();for(const p of products)k.text(`${title(p,l)} · ${p.accessType==='FREE'?'🎁':p.accessType==='PRO'?'👑':'⭐'}`,`pr:${p.id}`).row();
 const mode=where.categoryId?`cat:${where.categoryId}`:where.free?'free':where.latest?'latest':'results';
 if(pg>0)k.text('◀',`${mode}:${pg-1}`);
 if(pg<pages-1)k.text('▶',`${mode}:${pg+1}`);
 foot(k,l,where.categoryId?(await prisma.category.findUnique({where:{id:where.categoryId},select:{parentId:true}}))?.parentId??0:0);
 await reply(ctx,`${t(l,'choose')}\n${t(l,'page')} ${pg+1}/${pages}`,k);
}
async function productDetails(ctx:Context,u:User,id:number){
 const l=locale(u),p=await prisma.product.findUnique({where:{id},include:{category:true,files:{select:{id:true}}}});
 if(!p||p.status!=='PUBLISHED'||!p.rightsVerified||!p.category.active||!p.files.length){await reply(ctx,t(l,'notfound'));return;}
 const desc=(l==='fa'?p.descriptionFa:p.descriptionEn).slice(0,2200);
 const name=title(p,l);
 const price=p.accessType==='FREE'?'🎁 Free':p.accessType==='PRO'?'👑 PRO':`${p.starsPrice||'—'} ⭐`;
 const lines=[`<b>${escape(name)}</b>`,`<code>${escape(p.sku)}</code>`,escape(desc||''),`<b>${escape(price)}</b>`,[p.fileFormat,p.resolution,p.fps?`${p.fps} FPS`:null,p.fileCount?`${p.fileCount} files`:null].filter(Boolean).map(s=>escape(String(s))).join(' · ')].filter(Boolean).join('\n');
 const k=new InlineKeyboard();
 if(p.previewUrl&&p.previewUrl.startsWith('https://'))k.url(t(l,'preview'),p.previewUrl);
 if(p.accessType==='PURCHASE'||p.accessType==='PURCHASE_OR_PRO')k.text(t(l,'buy'),`buy:${p.id}`);
 k.row().text(t(l,'download'),`dl:${p.id}`);
 if(p.accessType==='PRO'||p.accessType==='PURCHASE_OR_PRO')k.text(t(l,'proAccess'),'pro');
 foot(k,l,p.categoryId);
 if(p.coverUrl?.startsWith('https://')&&ctx.chat){
 try{await ctx.api.sendPhoto(ctx.chat.id,p.coverUrl,{caption:lines.slice(0,950),parse_mode:'HTML',reply_markup:k});return;}catch{/*fallback to text*/}
 }
 await reply(ctx,lines,k,true);
}
async function memberOfPro(telegramId:string){
 const channel=await getSetting('PRO_CHANNEL_ID');if(!channel||!bot)return false;
 try {const m=await bot.api.getChatMember(channel,Number(telegramId));return m.status==='creator'||m.status==='administrator'||m.status==='member'||(m.status==='restricted'&&m.is_member);}catch(e){console.error('PRO membership verification failed',formatError(e));return false;}
}
export async function mayDownload(user:User,p:Product){
 if(!p.rightsVerified||p.status==='DRAFT')return false;
 if(p.accessType==='FREE')return p.status==='PUBLISHED';
 const purchase=await prisma.entitlement.findFirst({where:{userId:user.id,productId:p.id,status:'ACTIVE',OR:[{validUntil:null},{validUntil:{gt:new Date()}}]}});
 if(purchase&&(p.status==='PUBLISHED'||p.status==='HIDDEN'||(p.status==='ARCHIVED'&&(await getSetting('ALLOW_ARCHIVED_DOWNLOADS','true'))==='true')))return true;
 if(p.status!=='PUBLISHED')return false;
 return (p.accessType==='PRO'||p.accessType==='PURCHASE_OR_PRO')&&await memberOfPro(user.telegramId);
}
async function download(ctx:Context,u:User,id:number){
 const p=await prisma.product.findUnique({where:{id},include:{files:true}});
 const l=locale(u);if(!p||!p.files.length||!await mayDownload(u,p)){await reply(ctx,t(l,'noAccess'),new InlineKeyboard().text(t(l,'buy'),`buy:${id}`).text(t(l,'proAccess'),'pro'));return;}
 const k=new InlineKeyboard();for(const file of p.files){const token=signDownload({p:id,f:file.id,u:u.telegramId,exp:Math.floor(Date.now()/1000)+5*60});k.url(`📥 ${file.label}`,`${baseUrl}/download/${token}`).row();}
 await reply(ctx,`${title(p,l)}\n${l==='fa'?'لینک‌ها ۵ دقیقه اعتبار دارند؛ برای دریافت مجدد همین دکمه را بزنید.':'Links expire in 5 minutes. Request another link here if needed.'}`,k);
}
async function showCheckout(ctx:Context,u:User,id:number){
 const p=await prisma.product.findUnique({where:{id}}),l=locale(u);
 if(!p||p.status!=='PUBLISHED'||!p.rightsVerified||!['PURCHASE','PURCHASE_OR_PRO'].includes(p.accessType)){await reply(ctx,t(l,'notfound'));return;}
 const k=new InlineKeyboard().text(`${t(l,'stars')} · ${p.starsPrice||0}`,`pay:${id}`).row().text(t(l,'card'),'cardoff').row().text(t(l,'bank'),'bankoff');foot(k,l,p.categoryId);
 await reply(ctx,`${title(p,l)}\n${t(l,'choose')}`,k);
}
async function invoice(ctx:Context,u:User,id:number){
 const p=await prisma.product.findUnique({where:{id},include:{files:{select:{id:true}}}}),l=locale(u);
 if(!p||p.status!=='PUBLISHED'||!p.rightsVerified||!p.files.length||!['PURCHASE','PURCHASE_OR_PRO'].includes(p.accessType))return reply(ctx,t(l,'notfound'));
 if(!p.starsPrice||p.starsPrice<1)return reply(ctx,t(l,'priceNeeded'));
 if(await prisma.entitlement.findFirst({where:{userId:u.id,productId:p.id,status:'ACTIVE'}}))return download(ctx,u,p.id);
 const order=await prisma.order.create({data:{userId:u.id,productId:p.id,amountXtr:p.starsPrice}});
 try {await ctx.api.sendInvoice(ctx.chat!.id,title(p,l).slice(0,32),((l==='fa'?p.descriptionFa:p.descriptionEn)||p.sku).slice(0,255),order.id,'XTR',[{label:title(p,l).slice(0,40),amount:order.amountXtr}],{provider_token:'',start_parameter:'footagehub'});}
 catch(e){console.error('Invoice failed',formatError(e));await prisma.order.update({where:{id:order.id},data:{status:'CANCELLED'}});await reply(ctx,t(l,'invoiceError'));}
}
async function pro(ctx:Context,u:User){
 const l=locale(u),price=await getSetting('PRO_PRICE_XTR','100'),url=await getSetting('PRO_INVITE_LINK');
 const member=await memberOfPro(u.telegramId);
 let text=`${t(l,'proInfo')}\n${l==='fa'?'هزینه ماهانه':'Monthly price'}: ${price} ⭐\n${member?(l==='fa'?'✅ عضویت شما تأیید شد.':'✅ Membership confirmed.'):(l==='fa'?'برای عضویت از لینک اشتراک رسمی تلگرام استفاده کنید.':'Subscribe via Telegram’s official invite link.')}`;
 const k=new InlineKeyboard();if(url&&url.startsWith('https://t.me/'))k.url(l==='fa'?'👑 عضویت در کانال PRO':'👑 Join PRO channel',url);else text+=`\n${l==='fa'?'لینک اشتراک هنوز در پنل تنظیم نشده است.':'Subscription link is not configured yet.'}`;
 foot(k,l);await reply(ctx,text,k);
}
async function purchases(ctx:Context,u:User,page:number){const l=locale(u);
 const where={userId:u.id,status:'PAID' as const};const total=await prisma.order.count({where}),pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),pg=Math.max(0,Math.min(page,pages-1));
 const orders=await prisma.order.findMany({where,include:{product:true},orderBy:{paidAt:'desc'},skip:pg*PAGE_SIZE,take:PAGE_SIZE});
 if(!orders.length)return reply(ctx,t(l,'noPurchases'),foot(new InlineKeyboard(),l));
 const k=new InlineKeyboard();for(const o of orders)k.text(title(o.product,l),`dl:${o.product.id}`).row();
 if(pg>0)k.text('◀',`purchases:${pg-1}`);if(pg<pages-1)k.text('▶',`purchases:${pg+1}`);foot(k,l);
 return reply(ctx,`${t(l,'purchases')} · ${pg+1}/${pages}`,k);
}
export function createBot(){if(!bot)return null;
 bot.catch(e=>console.error('Telegram update error:',formatError(e.error)));
 bot.command('start',async ctx=>{const u=await ensureUser(ctx);await mainMenu(ctx,u);});
 bot.command('paysupport',async ctx=>{const u=await ensureUser(ctx);const handle=await getSetting('SUPPORT_USERNAME','@FootageFX');await reply(ctx,`${t(locale(u),'support')}: ${handle}\n${locale(u)==='fa'?'برای پیگیری بازپرداخت کد سفارش و زمان خرید را ارسال کنید.':'Send your order ID and purchase time for refund support.'}`);});
 bot.command('language',async ctx=>{await ensureUser(ctx);await reply(ctx,'زبان / Language',new InlineKeyboard().text('🇮🇷 فارسی','lang:fa').text('🇬🇧 English','lang:en'));});
 bot.on('pre_checkout_query',async ctx=>{
  const q=ctx.preCheckoutQuery;
  try {const o=await prisma.order.findUnique({where:{id:q.invoice_payload},include:{product:true,user:true}});
   const valid=!!o&&o.status==='PENDING'&&o.user.telegramId===String(q.from.id)&&q.currency==='XTR'&&q.total_amount===o.amountXtr&&o.product.status==='PUBLISHED'&&o.product.rightsVerified&&o.product.starsPrice===o.amountXtr&&['PURCHASE','PURCHASE_OR_PRO'].includes(o.product.accessType)&&await prisma.productFile.count({where:{productId:o.product.id}})>0;
   await ctx.answerPreCheckoutQuery(valid,valid?undefined:'این فاکتور دیگر معتبر نیست. دوباره از صفحه محصول اقدام کنید.');
  }catch(e){console.error('Precheckout',formatError(e));await ctx.answerPreCheckoutQuery(false,'خطا در اعتبارسنجی سفارش.').catch(()=>{});}
 });
 bot.on('message:successful_payment',async ctx=>{
  const pay=ctx.message.successful_payment;
  try {
   const o=await prisma.order.findUnique({where:{id:pay.invoice_payload},include:{user:true}});
   if(!o||o.user.telegramId!==String(ctx.from.id)||pay.currency!=='XTR'||pay.total_amount!==o.amountXtr){console.error('Payment reconciliation mismatch');return;}
   if(o.status==='REFUNDED'||o.status==='CANCELLED')return;
   await prisma.$transaction(async tx=>{
    const updated=await tx.order.updateMany({where:{id:o.id,status:'PENDING'},data:{status:'PAID',paidAt:new Date()}});
    if(!updated.count)return;
    await tx.payment.create({data:{orderId:o.id,telegramPaymentChargeId:pay.telegram_payment_charge_id}});
    await tx.entitlement.upsert({where:{userId_productId_source:{userId:o.userId,productId:o.productId,source:'PURCHASE'}},create:{userId:o.userId,productId:o.productId,source:'PURCHASE'},update:{status:'ACTIVE',validUntil:null}});
   });
   const user=await ensureUser(ctx);await reply(ctx,t(locale(user),'success'),new InlineKeyboard().text(t(locale(user),'download'),`dl:${o.productId}`));
  }catch(e){console.error('Payment handling error; reconcile manually:',formatError(e));await reply(ctx,'پرداخت دریافت شد اما ثبت دسترسی نیازمند بررسی پشتیبانی است. /paysupport');}
 });
 bot.on('callback_query:data',async ctx=>{
  await ctx.answerCallbackQuery().catch(()=>{});
  const u=await ensureUser(ctx);if(u.isBlocked)return;
  const data=ctx.callbackQuery.data,l=locale(u),[cmd,...args]=data.split(':');const id=Number(args[0]),page=Number(args[1]||0);
  try {
   switch(cmd){
    case 'home':return mainMenu(ctx,u);
    case 'language':return reply(ctx,'زبان / Language',new InlineKeyboard().text('🇮🇷 فارسی','lang:fa').text('🇬🇧 English','lang:en'));
    case 'lang':{if(!['fa','en'].includes(args[0]))return;const next=await prisma.user.update({where:{id:u.id},data:{language:args[0]}});return mainMenu(ctx,next);}
    case 'nav':return showNav(ctx,u,Number.isFinite(id)?id:0,page);
    case 'cat':return showListing(ctx,u,{categoryId:id},page);
    case 'latest':return showListing(ctx,u,{latest:true},Number(args[0]||0));
    case 'free':return showListing(ctx,u,{free:true},Number(args[0]||0));
    case 'search':await prisma.user.update({where:{id:u.id},data:{awaitingSearch:true}});return reply(ctx,t(l,'searchPrompt'));
    case 'results':return u.searchTerm?showListing(ctx,u,{search:u.searchTerm},Number(args[0]||0)):reply(ctx,t(l,'searchPrompt'));
    case 'pr':return productDetails(ctx,u,id);
    case 'buy':return showCheckout(ctx,u,id);
    case 'pay':return invoice(ctx,u,id);
    case 'dl':return download(ctx,u,id);
    case 'pro':return pro(ctx,u);
    case 'purchases':return purchases(ctx,u,Number(args[0]||0));
    case 'cardoff':return reply(ctx,t(l,'cardOff'));
    case 'bankoff':return reply(ctx,t(l,'bankOff'));
    case 'support':return reply(ctx,`${t(l,'support')}: ${await getSetting('SUPPORT_USERNAME','@FootageFX')}\n/paysupport`);
   }
  }catch(e){console.error('Bot callback',formatError(e));await reply(ctx,t(l,'fileError'));}
 });
 bot.on('message:text',async ctx=>{
  const u=await ensureUser(ctx);if(u.isBlocked)return;
  if(u.awaitingSearch){const term=ctx.message.text.trim().slice(0,100);await prisma.user.update({where:{id:u.id},data:{awaitingSearch:false,searchTerm:term}});if(term.length>=2)return showListing(ctx,u,{search:term},0);return reply(ctx,t(locale(u),'searchPrompt'));}
  await mainMenu(ctx,u);
 });
 return bot;
}
