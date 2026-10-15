import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';

const prisma = new PrismaClient();
const catalog = JSON.parse(fs.readFileSync('prisma/catalog-seed.json','utf8')) as {
  groups: string[];
  categories: {number:number;group:string;nameEn:string;nameFa:string;code:string}[];
  subcategories: {code:string;parentNumber:number;nameEn:string;prefix:string}[];
};
const slug = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
async function main(){
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 14 || password.includes('REPLACE_')) throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (14+ characters) in .env before seeding');
  await prisma.admin.upsert({where:{email},create:{email,passwordHash:await bcrypt.hash(password,12)},update:{}});
  const groups = new Map<string,number>();
  for (let i=0;i<catalog.groups.length;i++){
    const name = catalog.groups[i];
    const row=await prisma.category.upsert({where:{code:`GROUP-${i+1}`},create:{code:`GROUP-${i+1}`,slug:slug(name),nameEn:name,nameFa:name,sortOrder:i+1,groupKey:name},update:{}});
    groups.set(name,row.id);
  }
  const mains = new Map<number,number>();
  for(const c of catalog.categories){
    const row=await prisma.category.upsert({where:{code:`CAT-${String(c.number).padStart(2,'0')}`},create:{code:`CAT-${String(c.number).padStart(2,'0')}`,parentId:groups.get(c.group)!,slug:slug(c.nameEn),nameEn:c.nameEn,nameFa:c.nameFa,sortOrder:c.number,groupKey:c.group},update:{}});
    mains.set(c.number,row.id);
  }
  for(const [i,s] of catalog.subcategories.entries()){
    await prisma.category.upsert({where:{code:s.code},create:{code:s.code,parentId:mains.get(s.parentNumber)!,slug:slug(s.nameEn),nameEn:s.nameEn,nameFa:s.nameEn,sortOrder:i,groupKey:catalog.categories.find(c=>c.number===s.parentNumber)?.group},update:{}});
  }
  const records=[
    {sku:'VFX-BLOOD-SPLATTER-001',sub:'Blood Splatter',main:'VFX Elements',titleFa:'پک ۰۰۱ پاشیدن خون آلفا',titleEn:'Blood Splatter Alpha Pack 001',privateUrl:'https://dl.footagefx.com/Footages/Bloods/001/Bloodspack001%40FootageFX.zip',fileFormat:'ZIP',fileCount:null,descriptionFa:'پک فوتیج آلفای پاشیدن خون. تعداد و مشخصات فایل‌ها پس از بررسی توسط مدیر تکمیل شود.'},
    {sku:'FOOT-DUST-001',sub:'Dust',main:'Footages',titleFa:'پک دو عددی فوتیج آلفا گرد و غبار',titleEn:'Dust Tornado Alpha Footage Pack 001',privateUrl:'https://dl.footagefx.com/Footages/Dust/dust-tornado-40241-%40FootageFX.rar',fileFormat:'RAR',fileCount:2,descriptionFa:'پک دو عددی فوتیج آلفا گرد و غبار (طبق توضیح ارائه‌شده). پیش از انتشار محتوای آرشیو بررسی شود.'}
  ];
  for(const p of records){
    const main = await prisma.category.findUniqueOrThrow({where:{code:`CAT-${p.main==='VFX Elements'?'02':'01'}`}});
    const sub=await prisma.category.findFirstOrThrow({where:{parentId:main.id,nameEn:p.sub}});
    const existing=await prisma.product.findUnique({where:{sku:p.sku}});
    if (!existing){
      await prisma.product.create({data:{sku:p.sku,categoryId:sub.id,titleFa:p.titleFa,titleEn:p.titleEn,descriptionFa:p.descriptionFa,type:'PACK',status:'DRAFT',accessType:'PURCHASE',rightsVerified:false,starsPrice:null,fileFormat:p.fileFormat,fileCount:p.fileCount,files:{create:[{label:'دانلود فایل اصلی',privateUrl:p.privateUrl,fileName:p.privateUrl.split('/').pop()?.replace('%40','@')}]}}});
    }
  }
  const initial:Record<string,string> = {STORE_NAME:'Footage Hub',SUPPORT_USERNAME:'@FootageFX',PRO_CHANNEL_ID:'',PRO_PRICE_XTR:'100',PRO_INVITE_LINK:'',ALLOW_ARCHIVED_DOWNLOADS:'true'};
  for (const [key,value] of Object.entries(initial)) await prisma.setting.upsert({where:{key},create:{key,value},update:{}});
  console.log('Seed complete: 7 groups, 29 main categories, 570 subcategories, 2 draft products. Admin:',email);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
