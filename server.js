// Chess Academy: сервер. Оплата через Crypto Bot (Crypto Pay API), открытие уроков, онлайн-партии с другом.
// Запуск: CRYPTO_PAY_TOKEN=токен SITE_URL=https://ваш-домен node server.js
const express=require('express'),fs=require('fs'),crypto=require('crypto'),path=require('path'),E=require('./engine.js');
const TOKEN=process.env.CRYPTO_PAY_TOKEN,SITE=(process.env.SITE_URL||'').replace(/\/$/,''),CP=process.env.CRYPTO_PAY_API||'https://pay.crypt.bot/api';
if(!TOKEN){console.error('Задайте CRYPTO_PAY_TOKEN (токен приложения: @CryptoBot → Crypto Pay → Create App)');process.exit(1)}
const LESSONS=require('./lessons.json'),PRICE=id=>id=='all'?'2.59':LESSONS[id]?'0.99':null;
const F=path.join(process.env.DATA_DIR||__dirname,'data.json');let DB={orders:{},access:{}};try{DB=JSON.parse(fs.readFileSync(F))}catch(e){}
const save=()=>{fs.writeFileSync(F+'.tmp',JSON.stringify(DB));fs.renameSync(F+'.tmp',F)};
const app=express();app.use(express.json({limit:'20kb'}));app.use(express.urlencoded({extended:false}));
const okPid=p=>typeof p==='string'&&p.length>=10&&p.length<=64,clean=n=>String(n||'Игрок').replace(/[<>&"']/g,'').slice(0,16)||'Игрок';
app.get('/api/ping',(q,r)=>r.json({ok:1}));
// ---------- оплата через Crypto Bot ----------
// Для каждого заказа создаётся отдельный счёт. Оплату подтверждает только сам Crypto Pay API (сервер спрашивает статус счёта).
async function cp(method,params){const r=await fetch(CP+'/'+method,{method:'POST',headers:{'Content-Type':'application/json','Crypto-Pay-API-Token':TOKEN},body:JSON.stringify(params)});
 const j=await r.json();if(!j.ok)throw new Error(JSON.stringify(j.error||j));return j.result}
app.post('/api/order',async(q,r)=>{const{pid,item}=q.body,amount=PRICE(item);if(!amount||!okPid(pid))return r.status(400).json({});
 if(Object.values(DB.orders).filter(o=>o.pid===pid&&o.status=='pending'&&Date.now()-o.t<36e5).length>=10)return r.status(429).json({});
 const no=crypto.randomUUID();
 try{const p={currency_type:'fiat',fiat:'USD',amount,description:'Chess Academy: '+(item=='all'?'полный доступ':'урок '+item),payload:no,expires_in:3600,allow_comments:false,allow_anonymous:false};
  if(process.env.CRYPTO_ASSETS)p.accepted_assets=process.env.CRYPTO_ASSETS;if(SITE.startsWith('https://')){p.paid_btn_name='callback';p.paid_btn_url=SITE+'/?paid=1'}
  const inv=await cp('createInvoice',p);DB.orders[no]={pid,item,amount,status:'pending',inv:String(inv.invoice_id),t:Date.now()};save();
  r.json({no,url:inv.bot_invoice_url||inv.pay_url})}catch(e){console.error('createInvoice',e.message);r.status(502).json({})}});
const LAST={};
async function sync(pid){const pend=Object.entries(DB.orders).filter(([n,o])=>o.pid===pid&&o.status=='pending'&&Date.now()-o.t<864e5);if(!pend.length)return;
 if(LAST[pid]&&Date.now()-LAST[pid]<2500)return;LAST[pid]=Date.now();
 const res=await cp('getInvoices',{invoice_ids:pend.map(([n,o])=>o.inv).join(',')}),items=Array.isArray(res)?res:(res&&res.items)||[];let ch=0;
 for(const inv of items){const e=pend.find(([n,o])=>o.inv===String(inv.invoice_id));if(!e)continue;const[n,o]=e;
  if(inv.status=='paid'&&inv.payload===n&&Number(inv.amount)==Number(o.amount)&&(!inv.fiat||inv.fiat=='USD')&&o.status=='pending'){o.status='paid';(DB.access[o.pid]=DB.access[o.pid]||[]).push(o.item);ch=1}}
 if(ch)save()}
app.get('/api/access',async(q,r)=>{const pid=q.query.pid;if(!okPid(pid))return r.json([]);try{await sync(pid)}catch(e){console.error('getInvoices',e.message)}r.json(DB.access[pid]||[])});
app.get('/api/lesson',(q,r)=>{const a=DB.access[q.query.pid]||[],l=LESSONS[q.query.id];if(!l||!(a.includes('all')||a.includes(q.query.id)))return r.status(403).json({});r.json(l)});
// ---------- онлайн-партии (ходы проверяет сервер) ----------
const R=new Map(),view=r=>({id:r.id,status:r.status,s:r.s,moves:r.moves,last:r.last,names:{w:r.p.w&&r.p.w.name,b:r.p.b&&r.p.b.name},result:r.result});
const push=r=>{r.ts=Date.now();const d='data: '+JSON.stringify(view(r))+'\n\n';r.cl.forEach(c=>c.write(d))};
app.post('/api/room',(q,r)=>{const{pid,name,color}=q.body;if(!okPid(pid)||R.size>2000)return r.status(400).json({});
 const c=color=='b'?'b':color=='r'?(Math.random()<.5?'w':'b'):'w',id=crypto.randomBytes(4).toString('hex');
 R.set(id,{id,p:{[c]:{pid,name:clean(name)}},s:E.fen(E.START),moves:[],last:null,status:'wait',result:'',cl:new Set(),ts:Date.now()});r.json({id,color:c})});
app.post('/api/room/:id/join',(q,r)=>{const rm=R.get(q.params.id),{pid,name}=q.body;if(!rm||!okPid(pid))return r.status(404).json({});
 for(const c of['w','b'])if(rm.p[c]&&rm.p[c].pid===pid)return r.json({color:c});
 const c=!rm.p.w?'w':!rm.p.b?'b':null;if(!c)return r.status(409).json({});rm.p[c]={pid,name:clean(name)};rm.status='play';push(rm);r.json({color:c})});
app.get('/api/room/:id/events',(q,r)=>{const rm=R.get(q.params.id);if(!rm)return r.status(404).end();
 r.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive','X-Accel-Buffering':'no'});r.flushHeaders();
 r.write('data: '+JSON.stringify(view(rm))+'\n\n');rm.cl.add(r);const hb=setInterval(()=>r.write(':hb\n\n'),20000);q.on('close',()=>{clearInterval(hb);rm.cl.delete(r)})});
app.post('/api/room/:id/move',(q,r)=>{const rm=R.get(q.params.id),{pid,f,t,p}=q.body;if(!rm||rm.status!='play')return r.status(400).json({});
 const c=rm.s.t;if(!rm.p[c]||rm.p[c].pid!==pid)return r.status(403).json({});
 const m=E.legal(rm.s).find(x=>x.f===f&&x.t===t&&(x.p||'')===(p||''));if(!m)return r.status(400).json({});
 rm.moves.push(E.san(rm.s,m));rm.s=E.make(rm.s,m);rm.last={f:m.f,t:m.t};
 if(!E.legal(rm.s).length){rm.status='end';rm.result=E.inChk(rm.s)?'Мат. Победили '+(c=='w'?'белые':'чёрные'):'Пат. Ничья'}push(rm);r.json({ok:1})});
app.post('/api/room/:id/resign',(q,r)=>{const rm=R.get(q.params.id),{pid}=q.body;if(!rm||rm.status!='play')return r.status(400).json({});
 const c=['w','b'].find(k=>rm.p[k]&&rm.p[k].pid===pid);if(!c)return r.status(403).json({});
 rm.status='end';rm.result=(c=='w'?'Белые сдались. Победили чёрные':'Чёрные сдались. Победили белые');push(rm);r.json({ok:1})});
setInterval(()=>{for(const[id,rm]of R)if(Date.now()-rm.ts>6*36e5&&!rm.cl.size)R.delete(id)},36e5).unref();
app.use(express.static(path.join(__dirname,'public')));
app.listen(process.env.PORT||3000,()=>console.log('Chess Academy запущена'));
