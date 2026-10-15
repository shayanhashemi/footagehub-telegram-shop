# Footage Hub — ربات فروش فوتیج و پنل مدیریت

**نسخه سورس:** 1.0.0 | **پلتفرم:** Node.js 20.19+ یا 22.12+ / TypeScript / React / Vite / Express / grammY / Prisma ORM / MySQL 8.0+ | **بدون Docker**

این مخزن حاصل پیاده‌سازی ساختار منوها، دسته‌بندی‌ها و قوانین فروش سند PDF نسخه ۱.۱ و کاتالوگ Excel نسخه ۲ است. رابط پنل مدیریت راست‌به‌چپ و فارسی است و تقریباً هر بخش/فیلد راهنمای کاربری دارد. ربات برای زبان فارسی و انگلیسی طراحی شده است.

## امکانات موجود در سورس

- **ربات:** `/start` و انتخاب زبان؛ کتابخانه گروه/دسته/زیردسته با پیمایش عمق‌پذیر، مخفی‌شدن دسته‌های خالی، صفحه‌بندی، جست‌وجو با SKU و نام، جدیدترین‌ها، رایگان‌ها، صفحه محصول، پیش‌نمایش، سبد خرید تک‌محصول، «خریدهای من» و `/paysupport`.
- **فروش:** فاکتور واقعی Telegram Stars / XTR؛ اعتبارسنجی `pre_checkout_query`؛ ثبت `successful_payment` به‌شکل idempotent؛ شماره تراکنش و مجوز دانلود؛ استرداد Stars با API تلگرام از پنل. بانک و کارت‌به‌کارت عمداً *غیرفعال* هستند، همان‌طور که PDF الزام کرده است.
- **PRO:** قیمت اولیه ۱۰۰ Stars در ۳۰ روز؛ تنظیم شناسه کانال خصوصی، ساخت لینک اشتراک رسمی تلگرام، کنترل عضویت با `getChatMember` در هر درخواست دانلود.
- **پنل:** داشبورد، CRUD دسته‌ها/زیردسته‌ها، CRUD محصولات و چند فایل برای هر محصول، آپلود کاور (PNG/JPEG/WebP)، مشخصات فنی، قیمت و حقوق انتشار، وضعیت Draft/Published/Hidden/Archived، سفارش‌ها و استردادها، کاربران، تنظیمات و لاگ مدیریتی، توضیح کمکی فرم‌ها.
- **امنیت:** هش رمز مدیر با bcrypt، نشست‌های ذخیره‌شده با هش توکن و کوکی HttpOnly/SameSite، محدودسازی تلاش ورود، بررسی Origin، لیست مجاز هاست دانلود، لینک امضاشده ۵دقیقه‌ای و پروکسی جریان فایل (بدون ارسال آدرس منبع به مشتری در پیام ربات).
- **کاتالوگ:** `prisma/catalog-seed.json` از *خود فایل اکسل* استخراج شده؛ ۷ گروه، ۲۹ دسته، ۵۷۰ زیردسته. ۱۷۱۰ ردیف Excel جایگاه اولیه هستند و عمداً به کالای منتشرشده تبدیل نشده‌اند.
- **دو لینک واقعی ارسالی:** `VFX-BLOOD-SPLATTER-001` (ZIP) و `FOOT-DUST-001` (RAR) در seed وارد می‌شوند، با وضعیت **Draft**، بدون قیمت و بدون تأیید بازنشر. این عدم انتشار عمدی است.

## ۱. پیش‌نیازها (بدون Docker)

- یک VPS یا هاست قابل اجرای Node.js، با Node 20.19 یا 22.12 و جدیدتر و npm.
- MySQL **8.0+** با پشتیبانی `utf8mb4`.
- توکن ربات از [BotFather](https://t.me/BotFather)؛ فعال بودن پرداخت Telegram Stars برای ربات.
- دامنه اینترنتی با HTTPS برای `PUBLIC_BASE_URL` (برای لینک‌های دانلود در تلگرام الزامی است)؛ Nginx یا reverse proxy مشابه.
- برای PRO: ربات را ادمین کانال خصوصی کنید و مجوز دعوت کاربران بدهید.

## ۲. ساخت دیتابیس

با کاربر root در کنسول MySQL اجرا کنید (رمز قوی جداگانه انتخاب کنید):

```sql
CREATE DATABASE footagehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'footagehub'@'localhost' IDENTIFIED BY 'CHANGE_THIS_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON footagehub.* TO 'footagehub'@'localhost';
FLUSH PRIVILEGES;
```

اگر اتصال با `127.0.0.1` به جای localhost است، MySQL account host را `127.0.0.1` یا مطابق تنظیمات سرور تعریف کنید. رمزهای خاص در DATABASE_URL باید URL-encode شوند.

## ۳. نصب و اولین راه‌اندازی

```bash
# پوشه پروژه را از فایل ZIP خارج کنید و وارد آن شوید
cd footagehub-source
cp .env.example .env
# فایل .env را ویرایش کنید: DATABASE_URL، BOT_TOKEN، PUBLIC_BASE_URL، ADMIN_EMAIL، ADMIN_PASSWORD
# تولید یک کلید تصادفی معتبر:
openssl rand -hex 32
# خروجی ۶۴ کاراکتری را به DOWNLOAD_SIGNING_SECRET منتقل کنید
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

`db:migrate` در این بسته از **Prisma db push** برای ایجاد ساختار مطابق `schema.prisma` استفاده می‌کند (نیازی به فایل migration آماده ندارد). برای تغییرات نسخه‌های بعد، حتماً فرآیند migrations با `prisma migrate dev` در محیط توسعه و `migrate deploy` را مستقر و از دیتابیس نسخه پشتیبان تهیه کنید. در دیتابیس پرمحتوا، از `db push` بدون بررسی تغییرات استفاده نکنید.

> **نکته حساس:** دستور seed قابل تکرار است و رکوردهای قبلی را بازنویسی نمی‌کند؛ رمز admin در اولین seed ثبت می‌شود. برای عوض کردن آن بعداً باید هش جدید را با یک فرمان/اسکریپت مدیریتی جایگزین کنید. هرگز مقدار `.env` را در گیت قرار ندهید.

**ورود به پنل:** `http://localhost:3000` در توسعه، یا دامنه HTTPS روی سرور. نام کاربری و رمز همان مقادیر `.env` در زمان اولین seed هستند.

## ۴. توسعه محلی

```bash
npm run dev
# پنل Vite: http://localhost:5173
# API:       http://localhost:3000/api/health
# تست‌ها:
npm test
npm run typecheck
```

در حالت توسعه، سرور و UI هم‌زمان اجرا می‌شوند. ربات با **long polling** به API تلگرام متصل می‌شود و فقط یک نمونه از سرویس باید polling انجام دهد. در production از PM2/Systemd برای پایدار نگه‌داشتن `npm start` استفاده کنید:

```bash
npm install -g pm2
pm2 start npm --name footagehub -- start
pm2 save
pm2 startup
```

**نمونه پیکربندی Nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN;
    ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Range $http_range;
        proxy_read_timeout 600s;
        proxy_buffering off;  # stream archives instead of buffering on Nginx disk
    }
}
```

برای Production، `NODE_ENV=production`، `PUBLIC_BASE_URL=https://YOUR_DOMAIN` و `SESSION_COOKIE_SECURE=true` را تنظیم کنید. ابتدا گواهی HTTPS را معتبر کنید. پورت برنامه را از اینترنت عمومی ببندید و فقط Nginx را منتشر کنید.

## ۵. راهنمای عملی پنل

1. **تنظیمات و PRO:** آیدی کانال خصوصی را ثبت کنید، «ذخیره تنظیمات» بزنید و سپس «ساخت لینک اشتراک رسمی» را انتخاب کنید. اگر قیمت/کانال تغییر کرد، لینک جدید بسازید و لینک قبلی را در تلگرام نیز مدیریت/ابطال کنید.
2. **محصولات و فایل‌ها:** دو پک ورودی اولیه را در حالت Draft باز کنید؛ مشخصات و محتوای واقعی را بازبینی کنید، قیمت Stars بگذارید یا دسترسی FREE/PRO تعیین کنید؛ مجوز انتشار را واقعاً تأیید کنید؛ سپس وضعیت Published را ذخیره کنید. بدون فایل، حق بازنشر و قیمت معتبر، انتشار ممکن نیست.
3. **دسته‌بندی‌ها:** همه گروه‌ها و زیردسته‌ها در دیتابیس وجود دارند، اما تا محصول Published نداشته باشند در ربات نمایش داده نمی‌شوند. ساختار تا عمق دلخواه قابل گسترش است.
4. **سفارش‌ها:** بازپرداخت واقعی با `refundStarPayment` است؛ بعد از تأیید تلگرام، سفارش و حق دانلود خرید (به‌جز سفارش‌های موفق دیگر همان فایل) به‌روزرسانی می‌شوند.
5. **تاریخچه:** اقدامات مدیریتی مهم ثبت می‌شوند. برای جلوگیری از حذف داده با سابقه، محصول فروخته‌شده فقط بایگانی می‌شود.

## ۶. سیاست دانلود، حق نشر و محدودیت فنی

- فایل‌ها روی `dl.footagefx.com` قرار دارند. این آدرس‌ها **از ابتدا عمومی هستند**. مخفی‌کردن لینک داخل ربات و پروکسی‌کردن دانلود، امکان دستیابی به **URL اصلی از خارج ربات** را نمی‌بندد؛ برای حفاظت واقعی باید خود هاست فایل با ACL، storage خصوصی یا لینک امضاشده از سمت هاست محافظت شود. این پروژه چنین تغییری در هاست خارجی انجام نمی‌دهد.
- آپلود کاور در مسیر `MEDIA_DIR` ذخیره می‌شود. برای محیط واقعی این مسیر را در یک پوشه پایدار و قابل بکاپ خارج از سورس تنظیم کنید و مالکیت نوشتن به سرویس Node بدهید.
- آدرس اصلی در دیتابیس و API پنل ادمین ذخیره می‌شود، در پیام مشتری درج نمی‌شود. هر لینک خروجی پروکسی ۵ دقیقه معتبر است و ترافیک/هزینه دانلود روی سرور Node شما نیز عبور می‌کند.
- اگر فایل‌ها از CDN با ریدایرکت می‌آیند، این پیاده‌سازی برای جلوگیری از SSRF، ریدایرکت خودکار دانلود را دنبال نمی‌کند. هاست را برای پاسخ مستقیم پیکربندی کنید یا پیاده‌سازی redirect با allowlist مقصد را توسعه دهید.
- تعداد `2` برای پک Dust بر اساس متن ارسالی ثبت شده، نه با خواندن و بررسی خود RAR. فرمت/اندازه/کیفیت/مجوز نهایی باید توسط صاحب محصول بررسی شوند.
- قیمت فروش فایل، آیدی کانال PRO، توکن ربات، رمز مدیر و اطلاعات مهم عملیاتی **در سند مشخص نشده‌اند** و باید واقعی تنظیم شوند.
- اجرای هم‌زمان چند instance از bot polling مجاز نیست؛ نسخه حاضر queue/webhook چندنودی ندارد. تنظیم webhook و مقیاس‌پذیری افقی پروژه‌ای مستقل است.

## ۷. وضعیت آزمایش و پذیرش

- اجرای تست‌های مستقل `server/policy.ts`: قوانین انتشار، کنترل دامنه فایل و امضای لینک.
- **نیازمند تست در محیط واقعی شما:** `npm install`، build/typecheck با وابستگی‌ها، Prisma روی MySQL 8، بوت واقعی، فاکتور XTR واقعی و پیام successful_payment، refund واقعی، لینک اشتراک PRO و دانلود ZIP/RAR روی دامنه HTTPS.
- بدون BOT_TOKEN و MySQL فعال و بدون دسترسی به پکیج رجیستری در محیط تولید سورس، ادعای تست انتهابه‌انتها یا استقرار آماده نداریم.

### راهنمای ساختار پروژه

```text
src/             React dashboard (RTL), styles, types, API client
server/          Express API, admin authentication, Telegram bot, download gateway, policies
prisma/          Prisma schema, seed implementation, full 606-node taxonomy JSON
tests/           independent security/publishing unit tests
.env.example     environment variable template
```

**مرجع سیاست خرید دیجیتال تلگرام:** https://core.telegram.org/bots/payments-stars

**مرجع اشتراک کانال:** https://core.telegram.org/bots/api#createchatsubscriptioninvitelink
