/**
 * Enemy types and spawning, hero auto-attacks, and the party bot AI.
 */

import { sfx, musicBoss } from './audio.js';
import { props } from './art/room.js';
import { attackDamage, damageEnemy, floatTxt, healHero, nearestEnemy, pushFx, spark, threatFrom, useAbility } from './combat.js';
import { COL, GATE, H, ORDER, PI, PLAY, TAU, W, WALLY, WORLD_W, WORLD_H, rnd } from './config.js';
import { STAGES } from './content.js';
import { launch, airborne } from './physics.js';
import { relic } from './relics.js';
import { S, nextId } from './state.js';
import { floorTop } from './secret.js';
import { syncFrames } from './ui.js';
import { $, clamp, dist, ri, rr } from './util.js';

var ETYPES={
  grunt:{hp:34,sp:58,r:11,dmg:9,xp:1,col:'#D9463E'},
  runner:{hp:20,sp:104,r:9,dmg:7,xp:1,col:'#E8734A'},
  caster:{hp:30,sp:44,r:11,dmg:11,xp:2,col:'#C05CD8',ranged:280},
  brute:{hp:170,sp:38,r:20,dmg:22,xp:6,col:'#A335EE',elite:1}
};
function spawnEnemy(type,x,y,mul){
  var T=ETYPES[type],m=mul||1;
  var e={id:nextId(),type:type,art:type,x:x,y:y,hp:T.hp*m,hpMax:T.hp*m,sp:T.sp*(relic('frenzy')?1.2:1),r:T.r,dmg:T.dmg*Math.min(2.4,m),
    xp:T.xp,col:T.col,elite:T.elite||0,ranged:T.ranged||0,cd:rr(0,.8),flash:0,tgt:null,retgt:0,
    ph:rr(0,8),face:1,z:0,vz:0,ax:0,ay:0,bounces:0,sqx:1,sqy:1,rot:0,stun:0};
  S.enemies.push(e); return e;
}
/* Stage 5: a named warden carries a key fragment. A brute six times over,
   drawn larger, with its own health bar and the shard over its head. */
function spawnChampion(name,x,y,mul){
  var e=spawnEnemy('brute',x,y,mul);
  e.hp=e.hpMax=e.hpMax*4.5; e.dmg*=1.6; e.sp*=1.15; e.r=26;
  e.champion=1; e.name=name; e.home={x:x,y:y}; e.scale=1.35;
  return e;
}
/* Enemies come in from just past the edge of what you can see, on a ring
   around the camera -- so running never outruns them. The gate still pours
   when it is close enough to matter. */
function ringPoint(cam,pad0,pad1){
  /* an ellipse the shape of the screen, just past its edge -- so arrivals from
     above and below are as prompt as from the sides */
  for(var tries=0;tries<8;tries++){
    var a=rnd()*TAU, pad=rr(pad0,pad1);
    var x=cam.x+Math.cos(a)*(W/2+pad), y=cam.y+Math.sin(a)*(H/2+pad);
    if(x<PLAY.left-30||x>PLAY.right+30||y<WALLY-40||y>PLAY.bot+30)continue;
    return {x:x,y:y};
  }
  /* boxed into a corner: fall back to the far side of the room */
  return {x:clamp(cam.x+(cam.x<WORLD_W/2?620:-620),PLAY.left,PLAY.right),
          y:clamp(cam.y+rr(-200,200),WALLY,PLAY.bot)};
}
function edgeSpawn(){
  var cam=S.cam;
  if(rnd()<0.3&&dist(cam,GATE)<720)return{x:GATE.x+rr(-34,34),y:GATE.y-rr(0,18)};
  return ringPoint(cam,30,110);
}
function propPush(o,r){
  for(var i=0;i<props.length;i++){var p=props[i];
    if(!p.solid)continue;
    var dx=o.x-p.x, dy=(o.y-p.y)*1.7, d=Math.sqrt(dx*dx+dy*dy), mn=p.solid+r;
    if(d<mn&&d>0.01){o.x+=dx/d*(mn-d);o.y+=dy/d*(mn-d)/1.7}
  }
}
function spawnBoss(mul){
  var st=STAGES[S.stage], base=1+S.stage*0.9, m=mul||base, k=m/base;
  var b={id:nextId(),boss:1,type:'boss',art:'boss',name:st.boss,x:0,y:0,hp:900*(1+S.stage*0.85)*k,sp:42,r:34,
    dmg:(26+S.stage*6)*k,xp:40,col:'#D9463E',elite:1,flash:0,tgt:null,retgt:0,cd:1,slam:0,slamX:0,slamY:0,addT:5,mul:m,
    ph:0,face:1,z:0,vz:0,ax:0,ay:0,bounces:0,sqx:1,sqy:1,rot:0,stun:0};
  var bp=dist(S.cam,GATE)<720?{x:GATE.x,y:GATE.y-30}:ringPoint(S.cam,60,90);
  b.x=bp.x; b.y=bp.y;
  b.hpMax=b.hp; S.enemies.push(b); S.boss=b; S.bossT=0; S.enraged=false;
  $('bosshp').classList.add('on'); $('bossnm').textContent=st.boss;
  musicBoss(true);
  floatTxt(S.cam.x,S.cam.y-60,st.boss,'#FF6B62',1);
}

function heroAttack(h,dt){
  h.atk-=dt; if(h.atk>0)return;
  if(h.key==='tank'){
    var hit=false, arc=0.9*h.arc;
    var aim=nearestEnemy(h,h.reach+40);
    var face=aim?Math.atan2(aim.y-h.y,aim.x-h.x):Math.atan2(h.vy,h.vx);
    S.enemies.slice().forEach(function(e){
      var d=dist(h,e); if(d>h.reach+e.r||airborne(e))return;
      var a=Math.atan2(e.y-h.y,e.x-h.x), df=Math.abs(((a-face+PI*3)%TAU)-PI);
      if(df<arc){
        var r1=attackDamage(h,e,h.dmg); damageEnemy(e,r1.dmg,r1.crit,h); hit=true;
        if(h.flags.knockback&&!e.boss)launch(e,240,Math.cos(a),Math.sin(a),260);
      }
    });
    if(aim){pushFx({arc:1,x:h.x,y:h.y,a:face,sp:arc,rad:h.reach,col:COL.tank,t:0,life:.18})}
    if(hit)sfx('cleave',{gap:0.10}); else if(aim)sfx('swing',{gap:0.14});
    threatFrom(h,h.dmg*2.2);
    h.atk=h.atkCd; h.swing=h.swingDur; h.sqx=1.12; h.sqy=0.9;
  } else if(h.key==='dps'&&h.cls==='rogue'){
    /* the Shade: quick dagger strikes; anything not looking at you is a backstab */
    var rt2=nearestEnemy(h,h.reach+10); if(!rt2||airborne(rt2)){h.atk=.08;return}
    var ra=Math.atan2(rt2.y-h.y,rt2.x-h.x);
    h.strikes=(h.strikes||0)+1;
    var hits=(h.flags.twinfangs&&h.strikes%3===0)?2:1;
    for(var si=0;si<hits;si++){
      var rr1=attackDamage(h,rt2,h.dmg);
      if(rt2.tgt!==h&&!rr1.crit){rr1.crit=true;rr1.dmg*=2+(h.critMul||0)}
      damageEnemy(rt2,rr1.dmg,rr1.crit,h);
      if(rr1.crit&&h.flags.hemorrhage)rt2.bleed={dps:rr1.dmg*0.4/3,t:3,acc:0,by:h};
      if(rt2.hp<=0)break;
    }
    pushFx({arc:1,x:h.x,y:h.y,a:ra,sp:0.55,rad:h.reach+6,col:COL.rogue,t:0,life:.12});
    sfx('slash',{gap:0.06});
    if(Math.abs(rt2.x-h.x)>4)h.face=rt2.x>h.x?1:-1;
    h.atk=h.atkCd; h.swing=h.swingDur; h.sqx=1.1; h.sqy=0.92;
  } else if(h.key==='dps'){
    var t=nearestEnemy(h,h.reach); if(!t){h.atk=.1;return}
    var base=Math.atan2(t.y-h.y,t.x-h.x);
    for(var i=0;i<h.shots;i++){
      var off=(i-(h.shots-1)/2)*0.14;
      S.bullets.push({id:nextId(),x:h.x,y:h.y,a:base+off,sp:520,base:h.dmg,r:4,
        pierce:h.pierce,hit:[],col:COL.dps,by:h,t:0,z:14,vz:0});
    }
    sfx('bow',{gap:0.05});
    h.atk=h.atkCd; h.swing=h.swingDur; h.sqx=0.94; h.sqy=1.08;
  } else {
    var t2=nearestEnemy(h,h.reach);
    if(t2){ S.bullets.push({id:nextId(),x:h.x,y:h.y,a:Math.atan2(t2.y-h.y,t2.x-h.x),sp:430,base:h.dmg,r:5,
      pierce:0,hit:[],col:'#FFE9F4',by:h,t:0}); h.swing=h.swingDur; sfx('smite',{gap:0.12}); }
    h.atk=h.atkCd;
  }
}
function healerLogic(h,dt){
  if(h.down)return;
  h.mp=Math.min(h.mpMax,h.mp+h.mpRegen*dt);
  h.hcd=(h.hcd||0)-dt;
  // rez channel
  var downed=ORDER.map(function(k){return S.h[k]}).filter(function(a){return a.down});
  if(downed.length){
    var d0=downed[0];
    if(dist(h,d0)<62){ d0.rez+=dt; if(d0.rez>=2.4){ d0.down=false;d0.hp=d0.hpMax*0.45;d0.rez=0;
      launch(d0,260,0,0,0);
      floatTxt(d0.x,d0.y-26,'REZZED',COL.heal,1); spark(d0.x,d0.y,14,COL.heal,150);
      sfx('rez'); syncFrames(); } }
    else d0.rez=Math.max(0,d0.rez-dt*0.6);
  }
  if(h.hcd>0||h.mp<h.cost)return;
  var pool=ORDER.map(function(k){return S.h[k]}).filter(function(a){return !a.down&&a.hp<a.hpMax*0.985&&dist(h,a)<420});
  if(!pool.length)return;
  pool.sort(function(a,b){return a.hp/a.hpMax-b.hp/b.hpMax});
  var amt=38*h.healPow, total=0;
  for(var i=0;i<Math.min(pool.length,h.bounce);i++){
    total+=healHero(pool[i],amt*(i===0?1:0.6),h);
  }
  h.mp-=h.cost; h.hcd=1.0;
  if(total>0)sfx('heal',{gap:0.14});
  threatFrom(h,total*1.15);           // healing generates the most threat
}

function botVec(h){
  var vx=0,vy=0,near=nearestEnemy(h,900);
  var tank=S.h.tank, heal=S.h.heal;
  if(h.key==='tank'){
    // move to the densest cluster; body-block anything hunting the healer
    var hunter=null;
    for(var i=0;i<S.enemies.length;i++){var e=S.enemies[i];
      if(e.tgt&&e.tgt!==tank&&dist(e,e.tgt)<300){hunter=e;break}}
    var goal=hunter||near;
    if(goal){var d=dist(h,goal);
      var a=Math.atan2(goal.y-h.y,goal.x-h.x);
      var want=d>52?1:-0.3;
      vx+=Math.cos(a)*want; vy+=Math.sin(a)*want;
    }
  } else if(h.key==='dps'&&h.cls==='rogue'){
    /* the Shade bot skirmishes: close to dagger reach, circle, and slip away when hurt */
    var healer=S.h.heal;
    if(h.hp<h.hpMax*0.3&&!healer.down){var ah=Math.atan2(healer.y-h.y,healer.x-h.x);vx+=Math.cos(ah)*1.4;vy+=Math.sin(ah)*1.4;
      if(near&&dist(h,near)<120){var af=Math.atan2(h.y-near.y,h.x-near.x);vx+=Math.cos(af)*1.2;vy+=Math.sin(af)*1.2}}
    else if(near){var dn=dist(h,near),an=Math.atan2(near.y-h.y,near.x-h.x);
      var wn=dn>h.reach-6?1:-0.4;
      vx+=Math.cos(an)*wn; vy+=Math.sin(an)*wn;
      vx+=Math.cos(an+PI/2)*0.5; vy+=Math.sin(an+PI/2)*0.5;
    }
    if(!tank.down){var dl3=dist(h,tank);
      if(dl3>360){var al3=Math.atan2(tank.y-h.y,tank.x-h.x);vx+=Math.cos(al3)*1.1;vy+=Math.sin(al3)*1.1}}
  } else if(h.key==='dps'){
    if(near){var d=dist(h,near),a=Math.atan2(near.y-h.y,near.x-h.x);
      var want=d<190?-1:(d>320?0.8:0);
      vx+=Math.cos(a)*want; vy+=Math.sin(a)*want;
      vx+=Math.cos(a+PI/2)*0.45; vy+=Math.sin(a+PI/2)*0.45;
    }
    if(!tank.down){var dl=dist(h,tank);
      if(dl>330){var al=Math.atan2(tank.y-h.y,tank.x-h.x);vx+=Math.cos(al)*1.1;vy+=Math.sin(al)*1.1}}
  } else {
    var downed=ORDER.map(function(k){return S.h[k]}).filter(function(a){return a.down});
    if(downed.length){
      /* the rez is the job. Bodies drop in the middle of the fight, so waiting
         for the area to clear meant the healer never came; go now and only
         sidestep an enemy that is actually on top of the healer. */
      var body=downed[0], a2=Math.atan2(body.y-h.y,body.x-h.x);
      if(dist(h,body)>40){vx+=Math.cos(a2)*1.6;vy+=Math.sin(a2)*1.6}
      if(near&&dist(h,near)<90){var a5=Math.atan2(h.y-near.y,h.x-near.x);vx+=Math.cos(a5)*0.8;vy+=Math.sin(a5)*0.8}
    } else {
      if(near){var d3=dist(h,near);
        if(d3<230){var a3=Math.atan2(h.y-near.y,h.x-near.x);vx+=Math.cos(a3)*1.2;vy+=Math.sin(a3)*1.2}
      }
      if(!tank.down){var dt2=dist(h,tank);
        if(dt2>250){var a4=Math.atan2(tank.y-h.y,tank.x-h.x);vx+=Math.cos(a4)*0.7;vy+=Math.sin(a4)*0.7}}
    }
  }
  // room-edge repulsion, a leash to whoever the player is driving, ally separation
  var pad=54;
  if(h.x<PLAY.left+pad)vx+=(PLAY.left+pad-h.x)/pad;
  if(h.x>PLAY.right-pad)vx-=(h.x-(PLAY.right-pad))/pad;
  var ftop=floorTop(h.x);
  if(h.y<ftop+pad)vy+=(ftop+pad-h.y)/pad;
  if(h.y>PLAY.bot-pad)vy-=(h.y-(PLAY.bot-pad))/pad;
  var lead=S.h[S.ctrl];
  /* the leash lets go of a healer mid-rez, as long as the body is near the fight */
  var rezzing=h.key==='heal'&&downed&&downed.length&&dist(lead,downed[0])<560;
  if(lead!==h&&!lead.down&&!rezzing){
    var dl2=dist(h,lead);
    if(dl2>250){var al2=Math.atan2(lead.y-h.y,lead.x-h.x), w2=Math.min(2.4,(dl2-250)/110);
      vx+=Math.cos(al2)*w2; vy+=Math.sin(al2)*w2}
  }
  ORDER.forEach(function(k){var o=S.h[k]; if(o===h||o.down)return;
    var d=dist(h,o); if(d<46&&d>0){vx+=(h.x-o.x)/d*0.6;vy+=(h.y-o.y)/d*0.6}});
  var m=Math.sqrt(vx*vx+vy*vy);
  return m>0.05?{x:vx/m,y:vy/m}:{x:0,y:0};
}
function botAbility(h){
  if(h.abil>0||h.down)return;
  var close=0,i;
  for(i=0;i<S.enemies.length;i++)if(dist(h,S.enemies[i])<h.taunt||dist(h,S.enemies[i])<180)close++;
  if(h.key==='tank'&&close>=5)useAbility(h);
  if(h.key==='dps'&&h.cls==='rogue'){var nr=0;for(i=0;i<S.enemies.length;i++)if(dist(h,S.enemies[i])<150)nr++; if(nr>=3)useAbility(h)}
  else if(h.key==='dps'){var t=nearestEnemy(h,480);
    if(t){var n=0;for(i=0;i<S.enemies.length;i++)if(dist(t,S.enemies[i])<130)n++; if(n>=5)useAbility(h)}}
  if(h.key==='heal'){
    var hurt=0,down=0;
    ORDER.forEach(function(k){var a=S.h[k]; if(a.down)down++; else if(a.hp/a.hpMax<0.55)hurt++});
    if(down>0||hurt>=2)useAbility(h);
  }
}

export { ETYPES, spawnEnemy, spawnChampion, edgeSpawn, ringPoint, propPush, spawnBoss, heroAttack, healerLogic, botVec, botAbility };
