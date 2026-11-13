// Шахматный движок: общий для сайта и сервера
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',FL='abcdefgh',PV={p:100,n:320,b:330,r:500,q:900,k:0};
const KN=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],KG=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],DR=[[1,0,'Rr'],[-1,0,'Rr'],[0,1,'Rr'],[0,-1,'Rr'],[1,1,'Bb'],[1,-1,'Bb'],[-1,1,'Bb'],[-1,-1,'Bb']];
const SQ=i=>FL[i&7]+(8-(i>>3)),isW=c=>c==c.toUpperCase();
function fen(f){const[p,t,c,e]=f.split(' ');const b=[];for(const ch of p){if(ch=='/')continue;if(/\d/.test(ch))for(let i=0;i<+ch;i++)b.push('');else b.push(ch)}return{b,t,c:c=='-'?'':c,e:e&&e!='-'?(8-e[1])*8+FL.indexOf(e[0]):-1,n:1}}
function att(b,sq,w){const r=sq>>3,f=sq&7,ok=(a,c)=>a>=0&&a<8&&c>=0&&c<8,pr=r+(w?1:-1);
for(const df of[-1,1])if(ok(pr,f+df)&&b[pr*8+f+df]==(w?'P':'p'))return 1;
for(const[a,c]of KN)if(ok(r+a,f+c)&&b[(r+a)*8+f+c]==(w?'N':'n'))return 1;
for(const[a,c]of KG)if(ok(r+a,f+c)&&b[(r+a)*8+f+c]==(w?'K':'k'))return 1;
for(const[a,c,t]of DR){let x=r+a,y=f+c;while(ok(x,y)){const q=b[x*8+y];if(q){if(q==(w?t[0]:t[1])||q==(w?'Q':'q'))return 1;break}x+=a;y+=c}}return 0}
function gen(s){const m=[],w=s.t=='w',b=s.b;const add=(f,t,fl)=>{const p=b[f].toLowerCase()=='p'&&((t>>3)==0||(t>>3)==7);if(p)for(const q of'qrbn')m.push({f,t,p:q});else m.push({f,t,fl})};
for(let i=0;i<64;i++){const c=b[i];if(!c||isW(c)!=w)continue;const p=c.toLowerCase(),r=i>>3,f=i&7;
if(p=='p'){const d=w?-1:1,one=i+d*8;if(one<0||one>63)continue;if(!b[one]){add(i,one);if(r==(w?6:1)&&!b[one+d*8])add(i,one+d*8,'d')}
for(const df of[-1,1]){if(f+df<0||f+df>7)continue;const t=one+df;if(b[t]&&isW(b[t])!=w)add(i,t);else if(t==s.e)add(i,t,'e')}}
else if(p=='n'||p=='k'){for(const[a,c2]of p=='n'?KN:KG){const x=r+a,y=f+c2;if(x<0||x>7||y<0||y>7)continue;const t=x*8+y;if(!b[t]||isW(b[t])!=w)add(i,t)}}
else for(const[a,c2,t0]of DR){if(p=='r'&&t0=='Bb'||p=='b'&&t0=='Rr')continue;let x=r+a,y=f+c2;while(x>=0&&x<8&&y>=0&&y<8){const t=x*8+y;if(!b[t])add(i,t);else{if(isW(b[t])!=w)add(i,t);break}x+=a;y+=c2}}}
const k=w?60:4,o=!w;if(b[k]==(w?'K':'k')&&!att(b,k,o)){if(s.c.includes(w?'K':'k')&&!b[k+1]&&!b[k+2]&&!att(b,k+1,o)&&!att(b,k+2,o))m.push({f:k,t:k+2,fl:'k'});
if(s.c.includes(w?'Q':'q')&&!b[k-1]&&!b[k-2]&&!b[k-3]&&!att(b,k-1,o)&&!att(b,k-2,o))m.push({f:k,t:k-2,fl:'q'})}return m}
function make(s,m){const b=s.b.slice(),c=b[m.f],w=s.t=='w';let e=-1;b[m.t]=m.p?(w?m.p.toUpperCase():m.p):c;b[m.f]='';if(m.fl=='e')b[m.t+(w?8:-8)]='';if(m.fl=='d')e=(m.f+m.t)/2;
if(m.fl=='k'){b[m.t-1]=b[m.t+1];b[m.t+1]=''}if(m.fl=='q'){b[m.t+1]=b[m.t-2];b[m.t-2]=''}let ca=s.c;if(c=='K')ca=ca.replace(/[KQ]/g,'');if(c=='k')ca=ca.replace(/[kq]/g,'');
for(const q of[m.f,m.t]){const z={63:'K',56:'Q',7:'k',0:'q'}[q];if(z)ca=ca.replace(z,'')}return{b,t:w?'b':'w',c:ca,e,n:s.n+(w?0:1)}}
const inChk=s=>att(s.b,s.b.indexOf(s.t=='w'?'K':'k'),s.t!='w');
function legal(s){const mv=s.t;return gen(s).filter(m=>{const n=make(s,m);return!att(n.b,n.b.indexOf(mv=='w'?'K':'k'),mv!='w')})}
function san(s,m){const c=s.b[m.f],p=c.toUpperCase();let x;if(m.fl=='k')x='O-O';else if(m.fl=='q')x='O-O-O';else{const cap=s.b[m.t]||m.fl=='e';
if(p=='P')x=(cap?FL[m.f&7]+'x':'')+SQ(m.t)+(m.p?'='+m.p.toUpperCase():'');else{let d='';const o=legal(s).filter(q=>q.f!=m.f&&s.b[q.f]==c&&q.t==m.t);if(o.length)d=o.some(q=>(q.f&7)==(m.f&7))?(o.some(q=>(q.f>>3)==(m.f>>3))?SQ(m.f):8-(m.f>>3)):FL[m.f&7];x=p+d+(cap?'x':'')+SQ(m.t)}}
const n=make(s,m);return x+(inChk(n)?(legal(n).length?'+':'#'):'')}
function ev(s){let v=0;for(let i=0;i<64;i++){const c=s.b[i];if(!c)continue;const p=c.toLowerCase(),w=isW(c),r=i>>3,f=i&7,cen=7-Math.abs(f-3.5)-Math.abs(r-3.5);let x=PV[p];if(p=='p')x+=(w?6-r:r-1)*8+cen*5;else if(p=='n'||p=='b')x+=cen*5;v+=w?x:-x}return v}
const sc=(m,s)=>(s.b[m.t]?PV[s.b[m.t].toLowerCase()]*10-PV[s.b[m.f].toLowerCase()]:0)+(m.p?800:0);
function nm(s,d,a,b,ply){if(!d)return(s.t=='w'?1:-1)*ev(s);const L=legal(s);if(!L.length)return inChk(s)?-1e5+ply:0;L.sort((x,y)=>sc(y,s)-sc(x,s));for(const m of L){const v=-nm(make(s,m),d-1,-b,-a,ply+1);if(v>a){a=v;if(a>=b)break}}return a}
if(typeof module!=='undefined')module.exports={START,FL,PV,fen,legal,make,san,inChk,SQ,isW,ev,sc,nm};
