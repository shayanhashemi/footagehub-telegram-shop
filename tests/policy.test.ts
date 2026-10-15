import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedFileUrl,canPublish,signClaims,readClaims} from '../server/policy.ts';
const secret='32-chars-or-more-long-secret-for-tests';
test('published paid products require rights, a file, and a Stars price',()=>{
 assert.equal(canPublish({status:'PUBLISHED',rightsVerified:false,accessType:'PURCHASE',starsPrice:80},1),false);
 assert.equal(canPublish({status:'PUBLISHED',rightsVerified:true,accessType:'PURCHASE',starsPrice:null},1),false);
 assert.equal(canPublish({status:'PUBLISHED',rightsVerified:true,accessType:'PURCHASE',starsPrice:80},0),false);
 assert.equal(canPublish({status:'PUBLISHED',rightsVerified:true,accessType:'PURCHASE',starsPrice:80},1),true);
 assert.equal(canPublish({status:'PUBLISHED',rightsVerified:true,accessType:'FREE',starsPrice:null},1),true);
 assert.equal(canPublish({status:'DRAFT',rightsVerified:false,accessType:'PURCHASE',starsPrice:null},0),true);
});
test('files reject hosts outside allowlist, passwords, insecure urls and ports',()=>{
 const allow=['dl.footagefx.com'];
 assert.equal(allowedFileUrl('https://dl.footagefx.com/Footages/Bloods/001/Bloodspack001%40FootageFX.zip',allow),true);
 for(const url of ['http://dl.footagefx.com/x','https://127.0.0.1/a','https://dl.footagefx.com.evil.tld/x','https://foo:password@dl.footagefx.com/x','https://dl.footagefx.com:123/a','garbage'])assert.equal(allowedFileUrl(url,allow),false,url);
});
test('signed links are tamper-resistant, expire and are bound to claims',()=>{
 const now=1_800_000_000;
 const token=signClaims({p:3,f:4,u:'12345678',exp:now+300},secret);
 assert.deepEqual(readClaims(token,secret,now),{p:3,f:4,u:'12345678',exp:now+300});
 assert.equal(readClaims(token,secret,now+301),null);
 assert.equal(readClaims(token+'abc',secret,now),null);
 assert.equal(readClaims(token,'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxx',now),null);
});
