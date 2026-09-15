import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const code = readFileSync(new URL('Code.gs',import.meta.url),'utf8');
const rows = [Array.from({length:15},(_,i)=>i === 0 ? '問題' : ''), ...Array.from({length:25},(_,i)=>['（標準）電気の問題'+i+'①条件','1 V','2 V','3 V','4 V','','','','','',2,'','','①電圧の条件を確認します。',''])];
function runtime(shared = new Map()) {
 let now = Date.now(), calls = 0, locked = false, hook, reads = 0;
 const table = structuredClone(rows), h2Table = structuredClone(rows), cache = new Map();
 h2Table[1][13] = '高校物理の条件と符号を確認します。';
 const props = {getProperty:k=>shared.get(k)??null,setProperty:(k,v)=>{assert(Buffer.byteLength(v)<9000);shared.set(k,v);},deleteProperty:k=>shared.delete(k),getProperties:()=>Object.fromEntries(shared)};
 const response = () => ({getResponseCode:()=>200,getContentText:()=>JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'ok',conclusion:'電圧を比べます。',distinction:'単位を確認します。',checkQuestion:'単位は何ですか？'})}]}]})});
 const context = vm.createContext({Date:class extends Date {constructor(v){super(v??now)}static now(){return now;}},
  Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,t)=>Array.from(createHash(a).update(t).digest()),newBlob:x=>({getBytes:()=>Array.from(Buffer.from(x))}),formatDate:d=>new Date(+d+9*3600000).toISOString().slice(0,10)},
  PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},releaseLock:()=>{locked=false}})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)??null,put:(k,v)=>cache.set(k,v)})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>({text})})},
  SpreadsheetApp:{openById:id=>{assert(['1LCGCVjeiTicyclXFTP0EaxxB_RluZJrveWPo1FdLzsk','15hI6L62uw7iR10mhGc0c24g2SWx5lx0srAInRQZmswo'].includes(id));const selected=id.startsWith('15h')?h2Table:table;return {getSheetByName:name=>{assert.equal(name,'4-1電気');reads++;return {getLastRow:()=>selected.length,getLastColumn:()=>selected[0].length,getDataRange:()=>({getValues:()=>structuredClone(selected)})};}};}},
  UrlFetchApp:{fetch:(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer sk-test');const data=JSON.parse(options.payload);assert.equal(data.store,false);return hook ? hook(data) : response();}}
 });
 vm.runInContext(code,context);
 const post=d=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(d)}}).text);
 const configure=()=>{props.setProperty('SCIENCE_AI_ENABLED','true');props.setProperty('OPENAI_API_KEY','sk-test');for(const app of ['M2','H2'])props.setProperty('SCIENCE_AI_'+app+'_SHEETS','["4-1電気"]');};
 const question=(i=1,appId='m2')=>context.scienceAiQuestion_('4-1電気',appId,'4-1電気-'+i);
 const request=(token,i=1,appId='m2')=>{const q=question(i,appId);return {operation:'answer',appId,token,requestId:randomUUID(),id:q.id,category:q.category,mode:q.mode,signature:q.signature,selected:q.choices[0],action:'difference'};};
 return {context,props,shared,post,configure,question,request,table,h2Table,response,get calls(){return calls},get reads(){return reads},set hook(v){hook=v},advance:ms=>{now+=ms},lock:()=>{locked=true}};
}
const ready=()=>{const r=runtime();r.configure();return r;};
const session=(r,appId='m2')=>{const s=r.post({operation:'session',appId});assert(s.token,s.error);assert.equal(s.appId,appId);return s.token;};
test('disabled by default; health contains no secret and reads no sheets',()=>{const r=runtime();assert.equal(r.post({operation:'session',appId:'m2'}).error,'not_configured');assert.equal(JSON.parse(r.context.doGet().text).bankVersion,'science-sheets-v2');assert.equal(r.reads,0);});
test('sheet conversion matches actual M2 frontend parser, including signature',()=>{
 const r=ready(),html=readFileSync(new URL('../science2.0.html',import.meta.url),'utf8');
 const parser=html.slice(html.indexOf('function parseTSVText('),html.indexOf('window.renderEraMenu ='));
 const ctx=vm.createContext({});vm.runInContext(parser,ctx);
 const tsv=rows.map(row=>row.map(c=>String(c||'').trim().replace(/[\t\n\r]/g,' ')).join('\t')).join('\n');
 const parsed=ctx.parseTSVText(tsv,'4-1電気');assert.equal(parsed.length,25);
 for(let i=0;i<25;i++){const q=parsed[i],actual=r.question(i+1);assert.equal(actual.prompt,q.question);assert.equal(actual.correct,q.answer);assert.equal(actual.explanation,q.explanation);assert.equal(actual.signature,createHash('sha256').update(JSON.stringify(['m2',q.id,q.era,q.question,q.options,q.answer,q.explanation])).digest('hex'));}
});
test('success and duplicate survive execution restart, conflict is rejected',()=>{const r=ready(),d=r.request(session(r)),a=r.post(d);assert.equal(a.budget.dailyUsed,1);assert.deepEqual(r.post(d),a);assert.equal(r.calls,1);const next=runtime(r.shared);assert.deepEqual(next.post(d),a);assert.equal(next.calls,0);assert.equal(next.post({...d,text:'changed'}).error,'request_id_conflict');});
test('mismatch, unallowed sheets, invalid choices and text never reach provider',()=>{const r=ready(),d=r.request(session(r));for(const [patch,error] of [[{signature:'wrong'},'material_mismatch'],[{category:'履歴ログ'},'material_mismatch'],[{selected:'other'},'invalid_choice'],[{text:'a'.repeat(301)},'invalid_request'],[{action:'question',text:' '},'invalid_request'],[{token:'x'},'invalid_request']])assert.equal(r.post({...d,...patch}).error,error);assert.equal(r.calls,0);r.table[1][13]='更新';assert.equal(r.post(d).error,'material_mismatch');assert.equal(r.calls,0);});
test('per-question and session limit',()=>{const r=ready(),t=session(r);for(let i=0;i<3;i++)assert(r.post(r.request(t)).reply);assert.equal(r.post(r.request(t)).error,'usage_limit');for(let i=2;i<=18;i++)assert(r.post(r.request(t,i)).reply);assert.equal(r.post(r.request(t,19)).error,'usage_limit');assert.equal(r.calls,20);});
test('global daily limit persists and Japan day rollover resets it',()=>{const r=ready();for(let j=0;j<2;j++){const t=session(r);for(let i=1;i<=15;i++)assert(r.post(r.request(t,i)).reply);}const next=runtime(r.shared);assert.equal(next.post({operation:'session',appId:'m2'}).error,'daily_limit');next.advance(25*3600000);assert(next.post({operation:'session',appId:'m2'}).token);});
test('failed call consumes one reservation and never retries',()=>{const r=ready(),d=r.request(session(r));r.hook=()=>{throw new Error('private error')};const a=r.post(d);assert.equal(a.error,'connection_failed');assert.equal(a.budget.dailyUsed,1);assert.deepEqual(r.post(d),a);assert.equal(r.calls,1);});
test('concurrency and pending duplicate are blocked',()=>{const r=ready(),d=r.request(session(r));r.hook=()=>{assert.equal(r.post({...d,requestId:randomUUID()}).error,'request_busy');assert.equal(r.post(d).error,'request_pending');return r.response();};assert(r.post(d).reply);assert.equal(r.calls,1);});
test('expiry and session startup limits',()=>{const r=ready(),d=r.request(session(r));r.advance(3*3600000);assert.equal(r.post(d).error,'session_expired');for(let i=0;i<10;i++)session(r);assert.equal(r.post({operation:'session',appId:'m2'}).error,'session_limit');r.lock();assert.equal(r.post({operation:'session',appId:'m2'}).error,'request_busy');});
test('follow-up retains context without identity',()=>{const r=ready(),t=session(r);r.post(r.request(t));r.hook=data=>{const input=JSON.parse(data.input);assert.equal(input.history.length,1);assert.equal(input.question.selectedAnswer,'1 V');for(const key of ['userId','userName','token','score','class'])assert(!JSON.stringify(input).includes('"'+key+'"'));return r.response();};assert(r.post({...r.request(t),action:'question',text:'なぜですか'}).reply);});
test('non-15-column material is rejected before provider',()=>{const r=ready(),d=r.request(session(r));r.table[0].pop();assert.equal(r.post(d).error,'material_source_error');assert.equal(r.calls,0);});
test('app is explicit, unknown and disabled profiles fail closed',()=>{
 const r=ready();for(const appId of [undefined,'unknown','__proto__','constructor'])assert.equal(r.post({operation:'session',appId}).error,'invalid_app');
 r.props.deleteProperty('SCIENCE_AI_H2_SHEETS');assert.equal(r.post({operation:'session',appId:'h2'}).error,'not_configured');assert(session(r));assert.equal(r.reads,0);
});
test('token cannot cross apps, including identical problem IDs',()=>{
 const r=ready(),m=session(r),h=session(r,'h2');
 const d=r.request(m);const reads=r.reads;
 assert.equal(r.post({...d,appId:'h2',mode:'h2'}).error,'app_mismatch');assert.equal(r.reads,reads);
 assert.equal(r.post({...r.request(h,1,'h2'),signature:d.signature}).error,'material_mismatch');
 assert.notEqual(r.question().signature,r.question(1,'h2').signature);assert.equal(r.calls,0);
});
test('same IDs have isolated histories, per-question budgets and app daily counts',()=>{
 const r=ready(),m=session(r),h=session(r,'h2');
 const m1=r.post(r.request(m));assert.equal(m1.budget.dailyUsed,1);
 r.hook=data=>{const input=JSON.parse(data.input);assert.equal(input.history.length,0);assert.match(data.instructions,/高校2年物理/);assert(!data.instructions.includes('中学2年'));assert.match(input.question.explanation,/高校物理/);return r.response();};
 const h1=r.post(r.request(h,1,'h2'));assert(h1.reply);assert.equal(h1.budget.dailyUsed,1);assert.equal(h1.budget.globalDailyUsed,2);assert.equal(h1.budget.questionUsed,1);
 r.hook=data=>{const input=JSON.parse(data.input);assert.equal(input.history.length,1);assert.match(data.instructions,/中学2年理科/);assert(!data.instructions.includes('高校2年'));return r.response();};
 assert(r.post(r.request(m)).reply);r.hook=null;assert(r.post(r.request(m)).reply);assert.equal(r.post(r.request(m)).error,'usage_limit');assert(r.post(r.request(h,1,'h2')).reply);
});
test('combined ceiling remains 30 across M2 and H2',()=>{
 const r=ready(),m=session(r),h=session(r,'h2');for(let i=1;i<=15;i++)assert(r.post(r.request(m,i)).reply);for(let i=1;i<=15;i++)assert(r.post(r.request(h,i,'h2')).reply);
 assert.equal(r.calls,30);assert.equal(r.post(r.request(m,16)).error,'daily_limit');assert.equal(r.post(r.request(h,16,'h2')).error,'daily_limit');
 assert.equal(JSON.parse(r.shared.get('SCIENCE_AI_DAILY_m2')).count,15);assert.equal(JSON.parse(r.shared.get('SCIENCE_AI_DAILY_h2')).count,15);
});
test('H2 actual frontend parser agrees when H2_HTML is supplied', {skip:!process.env.H2_HTML},()=>{
 const r=ready(),html=readFileSync(process.env.H2_HTML,'utf8'),ctx=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('function parseTSVText('),html.indexOf('window.renderEraMenu =')),ctx);
 const tsv=r.h2Table.map(row=>row.map(c=>String(c||'').trim().replace(/[\t\n\r]/g,' ')).join('\t')).join('\n');
 const parsed=ctx.parseTSVText(tsv,'4-1電気');assert.equal(parsed.length,25);
 for(let i=0;i<25;i++){const q=parsed[i],actual=r.question(i+1,'h2');assert.equal(actual.signature,createHash('sha256').update(JSON.stringify(['h2',q.id,q.era,q.question,q.options,q.answer,q.explanation])).digest('hex'));}
});
