// Chess Academy: сервер. Оплата WebMoney, открытие уроков, онлайн-партии с другом.
// Запуск: WM_SECRET=ваш_ключ node server.js   (WM_PURSE по умолчанию Z326768612767)
const express=require('express'),fs=require('fs'),crypto=require('crypto'),path=require('path'),E=require('./engine.js');
const PURSE=process.env.WM_PURSE||'Z326768612767',SECRET=process.env.WM_SECRET;
if(!SECRET){console.error('Задайте WM_SECRET (Secret Key из настроек Merchant WebMoney)');process.exit(1)}
const LESSONS=require('./lessons.json'),PRICE=id=>id=='all'?'2.59':LESSONS[id]?'0.99':null;
const F=path.join(process.env.DATA_DIR||__dirname,'data.json');let DB={orders:{},access:{}};try{DB=JSON.parse(fs.readFileSync(F))}catch(e){}
const save=()=>{fs.writeFileSync(F+'.tmp',JSON.stringify(DB));fs.renameSync(F+'.tmp',F)};
const app=express();app.use(express.json({limit:'20kb'}));app.use(express.urlencoded({extended:false}));
const okPid=p=>typeof p==='string'&&p.length>=10&&p.length<=64,clean=n=>String(n||'Игрок').replace(/[<>&"']/g,'').slice(0,16)||'Игрок';
app.get('/api/ping',(q,r)=>r.json({ok:1}));
app.use(express.static(__dirname));
app.get('/', (q, r) => r.sendFile(path.join(__dirname, 'index.html')));
// ---------- оплата WebMoney ----------
app.post('/api/order',(q,r)=>{const{pid,item}=q.body,amount=PRICE(item);if(!amount||!okPid(pid))return r.status(400).json({});
 let no;do{no=crypto.randomInt(1,2e9)}while(DB.orders[no]);
 DB.orders[no]={pid,item,amount,status:'pending',t:Date.now()};save();
 r.json({no,purse:PURSE,amount,desc:'Chess Academy: '+(item=='all'?'full access':'lesson '+item)})});
// Result URL в WebMoney: https://chessacademy.fun/api/wm/result (POST)
app.post('/api/wm/result',(q,r)=>{const b=q.body,o=DB.orders[b.LMI_PAYMENT_NO];
 if(b.LMI_PREREQUEST=='1')return r.send(o&&o.status=='pending'&&b.LMI_PAYEE_PURSE==PURSE&&b.LMI_PAYMENT_AMOUNT==o.amount?'YES':'NO');
 const s=[b.LMI_PAYEE_PURSE,b.LMI_PAYMENT_AMOUNT,b.LMI_PAYMENT_NO,b.LMI_MODE,b.LMI_SYS_INVS_NO,b.LMI_SYS_TRANS_NO,b.LMI_SYS_TRANS_DATE,SECRET,b.LMI_PAYER_PURSE,b.LMI_PAYER_WM].join('');
 const h=crypto.createHash('sha256').update(s).digest('hex').toUpperCase();
 if(!o||h!==String(b.LMI_HASH||'').toUpperCase()||b.LMI_PAYEE_PURSE!==PURSE||b.LMI_PAYMENT_AMOUNT!=o.amount||b.LMI_MODE!='0')return r.status(400).send('bad');
 if(o.status=='pending'){o.status='paid';(DB.access[o.pid]=DB.access[o.pid]||[]).push(o.item);save()}r.send('OK')});
app.get('/api/access',(q,r)=>r.json(okPid(q.query.pid)?DB.access[q.query.pid]||[]:[]));
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
