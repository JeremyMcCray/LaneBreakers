// @ts-nocheck
import { ITEMS } from '../data/items';
import { CLEAVE_R, clamp, dist, rnd } from '../data/world';
import { G } from '../app/state';

export function part(x,y,col,n,spd,life,size,rise){
  for (let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=rnd(spd*.3,spd);
    G.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s - (rise||0),
                  life:rnd(life*.5,life),max:life,col,r:rnd(size*.5,size)});
  }
}
export function ring(x,y,r,col,life,w){ G.rings.push({x,y,r0:r*.2,r,life,max:life,col,w:w||3}); }
export function num(x,y,txt,col,size,vy){
  const n={x,y,txt,col,size:size||16,life:1,vy:vy||-42,vx:0};
  G.nums.push(n); return n;
}
export function line(x,y,x2,y2,col,life){ G.lines.push({x,y,x2,y2,col,life,max:life}); }
export function addToast(txt){
  const d=document.createElement('div'); d.className='tmsg'; d.textContent=txt;
  document.getElementById('toast').appendChild(d);
  setTimeout(()=>d.remove(), 2600);
}
export function spawnFx(f){
  switch(f.t){
    // damage numbers fly out to the SIDE so they never sit on top of the health bar
    case 'dmg':  { const side = Math.random()<.5 ? -1 : 1;
                   const n2 = num(f.x + side*((f.r||16) + rnd(16,34)), f.y + rnd(-6,10),
                       '-'+f.v, f.cr?'#ff9b4a':(f.ab?'#ffd166':(f.c?'#ffffff':'#ffb1b1')), f.cr?21:(f.ab?19:15), -26);
                   if (n2) n2.vx = side*46;
                   break; }
    case 'gold': num(f.x, f.y-46, '+'+f.v+'g', f.passive?'#b08d3c':(f.pet?'#9fe870':'#ffcc55'),
                     f.passive?13:17, -50); break;
    case 'deny': num(f.x, f.y-46, 'DENIED', '#9ad6ff', 16, -50); break;
    case 'mark': ring(f.x,f.y,58,'#c9f06a',.5,4); break;
    case 'heal': part(f.x, f.y-10, '#6ef0a0', 3, 60, .5, 3); break;
    case 'die':  part(f.x, f.y, f.team? '#ff8080':'#7fc4ff', f.big?26:11, f.big?300:180, .6, f.big?5:3.4);
                 ring(f.x,f.y,f.big?90:44, f.team?'#ff5f5f':'#4aa8ff', .45, 3); break;
    case 'kill': G.shake=Math.max(G.shake,16); ring(f.x,f.y,180,'#ffcc55',.7,5);
                 addToast(f.team===G.myTeam?'You slew the enemy hero!':'You have been slain.'); break;
    case 'lvlup':ring(f.x,f.y,70,'#ffcc55',.6,4); part(f.x,f.y,'#ffcc55',14,150,.7,3); break;
    case 'cast': ring(f.x,f.y,44,f.col,.32,3); break;
    case 'dash': line(f.x,f.y,f.x2,f.y2,f.col,.3); part(f.x2,f.y2,f.col,10,180,.4,3); break;
    case 'blast':ring(f.x,f.y,f.r,f.col||'#fff',.42,5); part(f.x,f.y,f.col||'#fff',Math.min(24,f.r/8),f.r*1.6,.45,3.6);
                 G.shake=Math.max(G.shake, clamp(f.r/26,2,12)); break;
    case 'cleave':{
      const a=f.a;
      for (let k=-2;k<=2;k++){
        const aa = a + k*0.42;
        line(f.x+Math.cos(aa)*10, f.y+Math.sin(aa)*10,
             f.x+Math.cos(aa)*CLEAVE_R*0.8, f.y+Math.sin(aa)*CLEAVE_R*0.8,
             f.team? '#ffb0b0aa':'#b6dcffaa', .16);
      }
      ring(f.x,f.y,CLEAVE_R*0.75,'#ffffff66',.22,2);
      break; }
    case 'slash':{const a=f.a; line(f.x+Math.cos(a)*18,f.y+Math.sin(a)*18,
                   f.x+Math.cos(a)*70,f.y+Math.sin(a)*70, f.team?'#ffb0b0':'#b6dcff', .13); break;}
    case 'hit':  part(f.x,f.y-8,'#ffffff',4,110,.28,2.6); break;
    case 'disjoint': ring(f.x,f.y,26,'#9fe6ff',.3,2); part(f.x,f.y,'#9fe6ff',5,90,.3,2.2); break;
    case 'counter': ring(f.x,f.y,54,'#ffd166',.45,4); part(f.x,f.y,'#ffd166',10,140,.5,3); break;
    case 'purge': ring(f.x,f.y,58,'#8fe3ff',.45,3); part(f.x,f.y,'#8fe3ff',12,130,.5,3); break;
    case 'towerdown': G.shake=Math.max(G.shake,22); ring(f.x,f.y,220,'#ffcc55',.9,6);
                      num(f.x,f.y-60,'+'+f.v+' SCORE','#ffcc55',22,-38); break;
    case 'shield':ring(f.x,f.y,40,'#8fe3ff',.3,3); break;
    case 'stun': ring(f.x,f.y-20,26,'#ffe066',.4,3); break;
    case 'root': ring(f.x,f.y,52,'#7fdc6a',.45,4); part(f.x,f.y,'#7fdc6a',8,90,.5,3); break;
    case 'silence': ring(f.x,f.y-16,34,'#6ce0e8',.45,3); break;
    case 'buff': ring(f.x,f.y,50,f.col,.5,4); part(f.x,f.y,f.col,12,120,.6,3); break;
    case 'exec': ring(f.x,f.y,110,'#ff5f5f',.5,6); G.shake=Math.max(G.shake,14); break;
    case 'bloodlet': ring(f.x,f.y,70,'#ff6b6b',.5,4);
                     if (f.v>0) num(f.x,f.y-44,'-'+f.v+' PENDING','#ff9b9b',15,-40); break;
    case 'cdcut': num(f.x,f.y-52,'-'+f.v+'s','#5ef0c8',16,-40); break;
    case 'windup': line(f.x,f.y,f.x2,f.y2,'#ff6b6b66',.55); break;
    case 'echodash':{
      line(f.x,f.y,f.x2,f.y2,'#ff9b9bcc',.30);
      const a=Math.atan2(f.y2-f.y, f.x2-f.x), L=dist(f.x,f.y,f.x2,f.y2);
      for (let k=0;k<7;k++){
        const t2=k/6;
        part(f.x+Math.cos(a)*L*t2, f.y+Math.sin(a)*L*t2, '#ff8f8f', 3, 110, .45, 3);
      }
      ring(f.x2,f.y2,60,'#ff6b6b',.35,3); break; }
    case 'quake':ring(f.x,f.y,f.r,'#c8945a',.45,3); break;
    case 'twrfire':part(f.x,f.y,'#ffd28a',5,120,.3,3); break;
    case 'respawn':ring(f.x,f.y,80,f.team?'#ff5f5f':'#4aa8ff',.6,4); break;
    case 'sell': if (f.team===G.myTeam) num(f.x,f.y-40,'+'+f.v+'g SOLD','#ffcc55',15,-44); break;
    case 'deliver':{
      const nm = f.id && ITEMS[f.id] ? ITEMS[f.id].name : 'ITEM';
      if (f.team===G.myTeam){ num(f.x,f.y-40,nm.toUpperCase(),'#5ef0c8',14,-40); }
      else addToast('Enemy picked up: '+nm);
      break; }
    case 'wave': break;
    case 'telegraph': G.rings.push({x:f.x,y:f.y,r0:f.r,r:f.r,life:f.life||f.t,max:f.life||f.t,col:f.col,w:2,flat:true}); break;
  }
}

