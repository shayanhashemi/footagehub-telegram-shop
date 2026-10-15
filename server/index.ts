import 'dotenv/config';
import {createApp} from './api.js';
import {createBot} from './bot.js';
import {prisma,isProd,signingSecret,baseUrl} from './core.js';

async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is missing');
 if(signingSecret.length<32)throw new Error('DOWNLOAD_SIGNING_SECRET must be at least 32 characters');
 if(isProd&&!baseUrl.startsWith('https://'))throw new Error('PUBLIC_BASE_URL must be HTTPS in production');
 await prisma.$connect();
 const app=createApp();
 const server=app.listen(Number(process.env.PORT||3000),()=>console.log(`Footage Hub API: ${baseUrl}`));
 const bot=createBot();
 if(bot){bot.start({onStart:info=>console.log(`Telegram bot @${info.username} polling`)}).catch(e=>console.error('Telegram bot stopped:',e));}
 else console.warn('BOT_TOKEN is not set; admin panel is available but bot is disabled.');
 async function shutdown(){try{if(bot?.botInfo)await bot.stop();}catch{} server.close();await prisma.$disconnect();process.exit(0);}
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
main().catch(e=>{console.error(e);process.exit(1)});
