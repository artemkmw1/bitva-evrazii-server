// Сервер онлайн-режима «Битвы стран Евразии»: комнаты, передача ходов, чат с фильтром брани.
// Запуск: npm install && node server.js   (порт задаётся переменной PORT, по умолчанию 8080)
const http=require('http');const fs=require('fs');const {WebSocketServer}=require('ws');
const PORT=process.env.PORT||8080;const SAVE=process.env.SAVE_FILE||'rooms.json';
const BAD=/(х[уy]й|х[уy][её]в|хуя|пизд|[её]б[аоуеиы]|ебл|бля|сук[аи]|муда|пид[оа]р|шлюх|fuck|shit|bitch|cunt|nigg|fag|dick|whore)/gi;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,200).replace(BAD,m=>'*'.repeat(m.length));
const rooms=new Map();
try{for(const [c,R] of Object.entries(JSON.parse(fs.readFileSync(SAVE,'utf8'))))rooms.set(c,{...R,subs:new Set()})}catch(e){}
const persist=()=>{const o={};for(const [c,R] of rooms)o[c]={room:R.room,claims:R.claims,chat:R.chat,ts:R.ts};try{fs.writeFileSync(SAVE,JSON.stringify(o))}catch(e){}};
setInterval(persist,30000);
const gen=()=>{let c;do{c=Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('')}while(rooms.has(c));return c};
const send=(ws,m)=>{if(ws.readyState===1)ws.send(JSON.stringify(m))};
const bcast=(R,m)=>{for(const w of R.subs)send(w,m)};
// Мест в партии: в лобби — любое свободное; во время игры — только страна под управлением компьютера, и не больше одной на человека.
function canClaim(R,s,uid){const r=R.room;if(r.status==='lobby')return true;if(r.status!=='play'||!Array.isArray(r.open)||!r.open.includes(s))return false;for(const k in R.claims)if(R.claims[k].uid===uid)return false;return true}
// Общий список открытых комнат: видна, не окончена, кто-то из игроков сейчас на связи, есть свободные места.
function listRooms(){const now=Date.now(),out=[];
 for(const [code,R] of rooms){const r=R.room||{};if(r.pub===false||r.status==='over'||!R.subs.size)continue;
  const seated=new Set(Object.values(R.claims).map(c=>c.uid));if(![...R.subs].some(w=>seated.has(w.uid)))continue;
  if(r.status==='play'&&now-R.ts>20*60e3)continue;
  const seats=(r.seats||[]).map(x=>String(x&&x.id||'')).slice(0,8);const open=(r.status==='lobby'?seats.map((x,i)=>i):(Array.isArray(r.open)?r.open:[])).filter(i=>!R.claims[i]);if(!open.length)continue;
  out.push({code,map:String(r.map||'eurasia').slice(0,12),host:String(r.hostName||'').slice(0,16),seats,open,humans:Object.keys(R.claims).length,status:r.status,round:+r.round||1,diff:+r.diff||1})}
 out.sort((a,b)=>(a.status==='lobby'?0:1)-(b.status==='lobby'?0:1)||b.humans-a.humans);return out.slice(0,30)}
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/plain; charset=utf-8','access-control-allow-origin':'*'});r.end('Battle for Eurasia server: '+rooms.size+' rooms')});
const wss=new WebSocketServer({server:srv,maxPayload:700*1024});
wss.on('connection',ws=>{
 ws.on('message',buf=>{let m;try{m=JSON.parse(buf)}catch(e){return}
  if(m.t==='ping')return;
  if(m.t==='list'){send(ws,{t:'list',rooms:listRooms()});return}
  if(m.t==='create'){const code=gen();rooms.set(code,{room:{...(m.room||{}),code},claims:{},chat:[],subs:new Set(),ts:Date.now()});send(ws,{t:'created',code});return}
  const R=rooms.get(String(m.code||'').toUpperCase());
  if(!R){send(ws,{t:'room',room:null});return}
  R.ts=Date.now();
  if(m.t==='sub'){if(ws.R)ws.R.subs.delete(ws);R.subs.add(ws);ws.R=R;ws.uid=String(m.uid||'').slice(0,40);send(ws,{t:'room',room:R.room});send(ws,{t:'claims',claims:R.claims});send(ws,{t:'chat',msgs:R.chat});return}
  if(m.t==='set'){const p=m.patch||{};if(p.state&&typeof p.ver==='number'&&p.ver<=(R.room.ver||0))return;Object.assign(R.room,p);bcast(R,{t:'room',room:R.room});return}
  if(m.t==='claim'){const s=+m.seat,uid=String(m.uid).slice(0,40);if(!(s>=0&&s<8)||R.claims[s]||!canClaim(R,s,uid))return;for(const k in R.claims)if(R.claims[k].uid===uid)delete R.claims[k];R.claims[s]={uid,name:clean(m.name).slice(0,16)||'Player'};bcast(R,{t:'claims',claims:R.claims});return}
  if(m.t==='unclaim'){const s=+m.seat;if(R.claims[s]&&R.claims[s].uid===m.uid){delete R.claims[s];bcast(R,{t:'claims',claims:R.claims})}return}
  if(m.t==='chat'){const now=Date.now();if(now-(ws.lastChat||0)<1200)return;ws.lastChat=now;const text=clean(m.text);if(!text)return;R.chat.push({uid:String(m.uid).slice(0,40),name:clean(m.name).slice(0,16)||'Player',text,ts:now});if(R.chat.length>60)R.chat.shift();bcast(R,{t:'chat',msgs:R.chat})}
 });
 ws.on('close',()=>{if(ws.R)ws.R.subs.delete(ws)});
});
setInterval(()=>{const now=Date.now();for(const [c,R] of rooms)if(!R.subs.size&&now-R.ts>72*3600e3)rooms.delete(c)},3600e3);
srv.listen(PORT,()=>console.log('Battle for Eurasia server on port',PORT));
