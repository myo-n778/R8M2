/* M2/H2共通AI専用GAS。登録済み教材は読取のみ。成績にはアクセスしません。 */
__SHEETS_SOURCE__
const SCIENCE_AI_MODEL = __MODEL__;
const SCIENCE_AI_SCHEMA = __SCHEMA__;
const SCIENCE_AI_INSTRUCTIONS = __INSTRUCTIONS__;
const SCIENCE_AI_LIMITS = {question:3,session:20,daily:30};
const SCIENCE_AI_TTL = 2*60*60*1000;
function scienceAiError_(code,budget) {const e=new Error(code);e.scienceCode=code;e.budget=budget;throw e;}
function scienceAiJson_(data) {return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function scienceAiHash_(text) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function scienceAiRead_(p,k,fallback) {const v=p.getProperty(k);return v===null?fallback:JSON.parse(v);}
function scienceAiPut_(p,k,v) {const data=JSON.stringify(v);if(Utilities.newBlob(data).getBytes().length>8500)scienceAiError_('state_too_large');p.setProperty(k,data);}
function scienceAiLock_(fn) {const lock=LockService.getScriptLock();if(!lock.tryLock(2000))scienceAiError_('request_busy');try{return fn(PropertiesService.getScriptProperties());}finally{lock.releaseLock();}}
function scienceAiReady_(p) {if(p.getProperty('SCIENCE_AI_ENABLED')!=='true'||!/^sk-/.test(p.getProperty('OPENAI_API_KEY')||''))scienceAiError_('not_configured');}
function doGet() {return scienceAiJson_({service:'science-ai',version:'gas-sheets-v1',bankVersion:SCIENCE_AI_PROTOCOL});}
function doPost(e) {
  try {
    const text=e&&e.postData&&e.postData.contents;
    if(typeof text!=='string'||text.length>12000)scienceAiError_('invalid_request');
    let d;try{d=JSON.parse(text);}catch(_){scienceAiError_('invalid_json');}
    if(!d||typeof d!=='object'||Array.isArray(d))scienceAiError_('invalid_request');
    if(d.operation==='session')return scienceAiJson_(scienceAiSession_(d.appId));
    if(d.operation==='answer')return scienceAiJson_(scienceAiAnswer_(d));
    scienceAiError_('invalid_operation');
  } catch(e) {return scienceAiJson_({error:e.scienceCode||'internal_error',...(e.budget?{budget:e.budget}:{})});}
}
function scienceAiSession_(appId) {
 scienceAiProfile_(appId);
 return scienceAiLock_(p=>{
  scienceAiReady_(p);const now=Date.now();let sessions=0;
  const values=p.getProperties();
  Object.keys(values).filter(k=>/^SCIENCE_AI_(SESSION|REQUEST)_[a-f0-9]{64}$/.test(k)).forEach(k=>{const x=JSON.parse(values[k]);if(x.expires<=now)p.deleteProperty(k);else if(k.indexOf('SCIENCE_AI_SESSION_')===0)sessions++;});
  const day=Utilities.formatDate(new Date(now),'Asia/Tokyo','yyyy-MM-dd');const daily=scienceAiRead_(p,'SCIENCE_AI_DAILY',{day:day,count:0});
  if(daily.day===day&&daily.count>=SCIENCE_AI_LIMITS.daily)scienceAiError_('daily_limit');
  let rate=scienceAiRead_(p,'SCIENCE_AI_SESSION_RATE',{minute:0,count:0});const minute=Math.floor(now/60000);
  if(rate.minute!==minute)rate={minute:minute,count:0};if(rate.count>=10||sessions>=60)scienceAiError_('session_limit');
  scienceAiPut_(p,'SCIENCE_AI_SESSION_RATE',{minute:minute,count:rate.count+1});
  const token=Utilities.getUuid()+Utilities.getUuid();
  scienceAiPut_(p,'SCIENCE_AI_SESSION_'+scienceAiHash_(token),{appId:appId,expires:now+SCIENCE_AI_TTL,total:0,questions:{}});
  return {token:token,appId:appId,bankVersion:SCIENCE_AI_PROTOCOL,limits:SCIENCE_AI_LIMITS,model:SCIENCE_AI_MODEL};
 });
}
function scienceAiAnswer_(d) {
 const {requestId,id,category,mode,appId,signature,selected,action,text=''}=d;
 if(typeof d.token!=='string'||!/^[a-f0-9-]{72}$/.test(d.token)||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)||typeof id!=='string'||id.length>500||typeof category!=='string'||category.length>100||!['m2','h2'].includes(appId)||mode!==appId||typeof selected!=='string'||selected.length>3000||!['difference','simple','question'].includes(action)||typeof text!=='string'||text.length>300||(action==='question'&&!text.trim()))scienceAiError_('invalid_request');
 const preflight=PropertiesService.getScriptProperties();scienceAiReady_(preflight);
 const liveSession=scienceAiRead_(preflight,'SCIENCE_AI_SESSION_'+scienceAiHash_(d.token),null);
 if(!liveSession||liveSession.expires<=Date.now())scienceAiError_('session_expired');
 if(liveSession.appId!==appId)scienceAiError_('app_mismatch');
 const profile=scienceAiProfile_(appId);
 const key=appId+':'+category+':'+id,q=scienceAiQuestion_(category,mode,id);
 if(!q||q.signature!==signature)scienceAiError_('material_mismatch');
 if(!q.choices.includes(selected))scienceAiError_('invalid_choice');
 const sk='SCIENCE_AI_SESSION_'+scienceAiHash_(d.token),qk=scienceAiHash_(key),rk='SCIENCE_AI_REQUEST_'+scienceAiHash_(d.token+':'+requestId);
 const digest=scienceAiHash_(JSON.stringify([appId,id,category,mode,signature,selected,action,text]));
 const reserved=scienceAiLock_(p=>{
  scienceAiReady_(p);const now=Date.now(),s=scienceAiRead_(p,sk,null);
  if(!s||s.expires<=now)scienceAiError_('session_expired');
  if(s.appId!==appId)scienceAiError_('app_mismatch');
  const previous=scienceAiRead_(p,rk,null);
  if(previous){if(previous.digest!==digest)scienceAiError_('request_id_conflict');return {existing:previous.result||{error:'request_pending',budget:previous.budget}};}
  const budget={questionUsed:s.questions[qk]||0,sessionUsed:s.total};
  if(s.total>=SCIENCE_AI_LIMITS.session||budget.questionUsed>=SCIENCE_AI_LIMITS.question)scienceAiError_('usage_limit',budget);
  // Global serialization avoids overlapping provider charges. Lock is not held during fetch.
  if(scienceAiRead_(p,'SCIENCE_AI_BUSY',{until:0}).until>now)scienceAiError_('request_busy',budget);
  const day=Utilities.formatDate(new Date(now),'Asia/Tokyo','yyyy-MM-dd');
  let daily=scienceAiRead_(p,'SCIENCE_AI_DAILY',{day:day,count:0});if(daily.day!==day)daily={day:day,count:0};
  const appDailyKey='SCIENCE_AI_DAILY_'+appId;
  let appDaily=scienceAiRead_(p,appDailyKey,{day:day,count:0});if(appDaily.day!==day)appDaily={day:day,count:0};
  if(daily.count>=SCIENCE_AI_LIMITS.daily)scienceAiError_('daily_limit',budget);
  if(appDaily.count>=SCIENCE_AI_LIMITS.daily)scienceAiError_('daily_limit',budget);
  daily.count++;appDaily.count++;s.total++;s.questions[qk]=budget.questionUsed+1;
  const next={appId:appId,questionUsed:s.questions[qk],sessionUsed:s.total,dailyUsed:appDaily.count,globalDailyUsed:daily.count};
  // Charge reservation is persisted first: a partial storage failure can over-count, never under-count.
  scienceAiPut_(p,'SCIENCE_AI_DAILY',daily);scienceAiPut_(p,appDailyKey,appDaily);scienceAiPut_(p,sk,s);
  scienceAiPut_(p,rk,{expires:s.expires,digest:digest,budget:next});
  scienceAiPut_(p,'SCIENCE_AI_BUSY',{until:now+7*60*1000,request:rk});
  return {budget:next,expires:s.expires};
 });
 if(reserved.existing)return reserved.existing;
 const hk='history-'+scienceAiHash_(d.token+':'+key+':'+signature);let result;
 try {
  const {choices,signature:unused,...material}=q;
  let history=[];try{history=JSON.parse(CacheService.getScriptCache().get(hk)||'[]');}catch(_){}
  const reply=scienceAiProvider_({...material,selectedAnswer:selected},action,text.trim(),history,profile);
  result={reply:reply,appId:appId,requestId:requestId,bankVersion:SCIENCE_AI_PROTOCOL,model:SCIENCE_AI_MODEL,budget:reserved.budget};
  try{CacheService.getScriptCache().put(hk,JSON.stringify([...history,{action:action,studentQuestion:text.trim(),reply:reply}].slice(-2)),7200);}catch(_){}
 } catch(e) {result={error:e.scienceCode||'connection_failed',requestId:requestId,budget:reserved.budget};}
 // Completion storage failures still leave the reserved request, preventing duplicate provider calls.
 scienceAiLock_(p=>{
  scienceAiPut_(p,rk,{expires:reserved.expires,digest:digest,budget:reserved.budget,result:result});
  if(scienceAiRead_(p,'SCIENCE_AI_BUSY',{}).request===rk)p.deleteProperty('SCIENCE_AI_BUSY');
 });
 return result;
}
function scienceAiProvider_(question,action,text,history,profile) {
 const response=UrlFetchApp.fetch('https://api.openai.com/v1/responses',{
  method:'post',contentType:'application/json',muteHttpExceptions:true,
  headers:{Authorization:'Bearer '+PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY')},
  payload:JSON.stringify({model:SCIENCE_AI_MODEL,store:false,reasoning:{effort:'none'},max_output_tokens:1000,instructions:profile.instruction+'\n'+SCIENCE_AI_INSTRUCTIONS,input:JSON.stringify({question:question,action:action,studentQuestion:text,history:history}),text:{format:{type:'json_schema',name:'science_tutor',strict:true,schema:SCIENCE_AI_SCHEMA}}})
 });
 let data;try{data=JSON.parse(response.getContentText());}catch(_){scienceAiError_('provider_error');}
 if(response.getResponseCode()!==200)scienceAiError_(['insufficient_quota','rate_limit_exceeded'].includes(data.error&&data.error.code)?data.error.code:'provider_error');
 if(data.status!=='completed')scienceAiError_('incomplete_response');
 const content=(data.output||[]).reduce((a,o)=>a.concat(o.content||[]),[]);
 if(content.some(c=>c.type==='refusal'))scienceAiError_('refused');
 let reply;try{reply=JSON.parse(content.filter(c=>c.type==='output_text').map(c=>c.text).join(''));}catch(_){scienceAiError_('invalid_response');}
 if(!reply||!['ok','insufficient_context','out_of_scope'].includes(reply.status)||['conclusion','distinction','checkQuestion'].some(k=>typeof reply[k]!=='string'||reply[k].length>1200)||!reply.conclusion.trim())scienceAiError_('invalid_response');
 // Keep each PropertiesService value below its byte limit, including JSON and multibyte characters.
 if(Utilities.newBlob(JSON.stringify(reply)).getBytes().length>6500)scienceAiError_('invalid_response');
 return {status:reply.status,conclusion:reply.conclusion,distinction:reply.distinction,checkQuestion:reply.checkQuestion};
}
