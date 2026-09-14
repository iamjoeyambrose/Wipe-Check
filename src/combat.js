/**
 * Damage, healing, the threat table and the three role abilities.
 *
 * Every hero hit goes through attackDamage() so gear flags -- execute,
 * first-strike, rooted, momentum -- land no matter which role swung, and
 * threat is always scaled by the hero's threatMul so a threat ring actually
 * changes who the room looks at.
 */

import { sfx } from './audio.js';
import { COL, ORDER, TAU, rnd } from './config.js';
import { wipe } from './flow.js';
import { S, mode, reduce, rt, nextId } from './state.js';
import { isHost } from './net.js';
import { heroInput } from './seats.js';
import { award } from './achievements.js';
import { evPush } from './snapshot.js';
import { syncAbil, syncFrames } from './ui.js';
import { launch } from './physics.js';
import { relic } from './relics.js';
import { championDown } from './objective.js';
import { $, dist, rr } from './util.js';

function alive(){return ORDER.map(function(k){return S.h[k]}).filter(function(h){return !h.down})}
/* cosmetics are created here and, when hosting, mirrored to every guest */
function floatTxt(x,y,txt,col,big){var o={x:x,y:y,t:0,txt:txt,col:col,big:big?1:0,dx:rr(-14,14)};S.floats.push(o);if(isHost())evPush(['fl',o])}
function pushFx(o){S.fx.push(o);if(isHost())evPush(['fx',o])}
function fx(x,y,r,col,life){pushFx({x:x,y:y,r:r,r0:r,col:col,t:0,life:life||.32,ring:r>90?1:0})}
function spark(x,y,n,col,sp){for(var i=0;i<n;i++){var a=rnd()*TAU,v=rr(.4,1)*(sp||130);
  S.fx.push({p:1,x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,col:col,t:0,life:rr(.22,.5)})}
  if(isHost())evPush(['sp',x,y,n,col,sp||130])}

/* Hit-stop in one place. `strength` is seconds of freeze. The camera never
   moves on a hit -- no shake, no kick, no zoom -- and per-hit freezes are gone
   too: dozens of tiny stalls a second read as a stutter. Only a boss kill
   stops the world. Reduced motion drops that as well. */
function impact(strength){
  if(reduce)return;
  rt.freeze=Math.max(rt.freeze,strength);
}

/* gear flags resolve here, against the actual target, at the moment of impact */
function attackDamage(h,e,base){
  var f=h.flags||{}, dmg=base, crit=false;
  if(f.firstStrike&&e.hp>=e.hpMax-0.01)crit=true;
  else if(rnd()<h.crit)crit=true;
  if(crit)dmg*=2+(h.critMul||0);
  if(f.execute&&e.hp<e.hpMax*0.34)dmg*=1+f.execute;
  if(f.rooted&&h.stillT>1)dmg*=1+f.rooted;
  if(f.momentum)dmg*=1+(h.momentum||0);
  return {dmg:dmg,crit:crit};
}

function threatFrom(h,amt){ h.threat+=amt*(h.threatMul==null?1:h.threatMul) }

function damageHero(h,amt,src){
  if(h.down||h.dash)return;
  amt*=h.dr;
  if(h.thorns&&src&&src.hp>0){
    src.hp-=amt*h.thorns;
    floatTxt(src.x,src.y-12,Math.round(amt*h.thorns),'#C79C6E');
    if(src.hp<=0)killEnemy(src,h);
  }
  h.hp-=amt; h.hitFlash=1;
  floatTxt(h.x,h.y-h.r-6,'-'+Math.round(amt),'#FF6B62');
  sfx('hurt',{v:Math.min(1,amt/40),gap:0.09});
  if(h.hp<=0){
    var guard=(h.flags&&h.flags.guardian)||(S.h.heal.flags&&S.h.heal.flags.guardian&&!S.h.heal.down);
    if(guard&&!h.guardUsed){h.guardUsed=true;h.hp=1;
      floatTxt(h.x,h.y-26,'GUARDIAN SPIRIT',COL.heal,1);sfx('rez');return}
    h.hp=0;h.down=true;h.downT=0;h.rez=0; S.downs++;
    floatTxt(h.x,h.y-24,h.role.name+' is down','#FF6B62',1);
    spark(h.x,h.y,16,'#FF6B62',180);
    sfx('down');
    if(!reduce)rt.shake=9;
    if(alive().length===0)wipe();
    else if(S.ctrl===h.key){var a=alive();S.ctrl=a[0].key}
    syncFrames();
  }
}
function healHero(h,amt,from){
  if(h.down||h.hp>=h.hpMax)return 0;
  var hcrit=relic('night')&&rnd()<0.2;      // Long Night's consolation
  if(hcrit)amt*=2;
  var real=Math.min(amt,h.hpMax-h.hp); h.hp+=real;
  floatTxt(h.x+rr(-8,8),h.y-h.r-6,'+'+Math.round(real),hcrit?'#FFD86B':'#6EE7A0',hcrit);
  if(from){ pushFx({beam:1,x:from.x,y:from.y,x2:h.x,y2:h.y,col:COL.heal,t:0,life:.22}); }
  return real;
}
function damageEnemy(e,amt,crit,by){
  e.hp-=amt; e.flash=1;
  /* the body gives: flatten toward the blow, spring back next frames */
  e.sqx=Math.max(e.sqx||1,crit?1.4:1.22); e.sqy=Math.min(e.sqy||1,crit?0.66:0.8);
  var kx=by?e.x-by.x:0, ky=by?e.y-by.y:0, kl=Math.hypot(kx,ky)||1;
  if(crit&&!e.boss&&!(by&&by.cls==='rogue'))launch(e,Math.min(560,220+amt*2.2),kx/kl,ky/kl,120);
  floatTxt(e.x+rr(-6,6),e.y-e.r-4-(e.z||0),Math.round(amt),crit?'#FFD86B':'#F2F5FA',crit||amt>=40);
  if(by){
    threatFrom(by,amt);
    if(by.flags&&by.flags.lifesteal&&!by.down){
      var got=Math.min(amt*by.flags.lifesteal,by.hpMax-by.hp);
      if(got>0.4){by.hp+=got;floatTxt(by.x+rr(-6,6),by.y-by.r-10,'+'+Math.round(got),'#8FE3B0')}
    }
  }
  if(crit)sfx('crit',{gap:0.10});
  if(e.hp>0&&!e.elite&&e.hp<e.hpMax*0.25&&relic('frenzy')&&rnd()<0.15){
    e.hp=0; floatTxt(e.x,e.y-e.r-14,'FRENZY','#FF6B62');
  }
  if(e.hp<=0)killEnemy(e,by,amt);
}
function killEnemy(e,by,blow){
  var i=S.enemies.indexOf(e); if(i<0)return;
  S.enemies.splice(i,1); S.kills++;
  if(e.champion)championDown(e);
  if(e.boss)S.bossKilledEnraged=!!S.enraged;
  if(by&&by.flags&&by.flags.momentum)by.momentum=(by.momentum||0)+by.flags.momentum;
  var fx0=by?e.x-by.x:rr(-1,1), fy0=by?e.y-by.y:rr(-1,1), fl=Math.hypot(fx0,fy0)||1;
  var corpse={id:nextId(),art:e.art,x:e.x,y:e.y,r:e.r,face:e.face,t:0,dur:e.boss?1.6:e.elite?1.0:0.7,
    z:e.z||0,vz:0,ax:0,ay:0,bounces:0,rot:0,spin:(rnd()<.5?-1:1)*rr(4,9)};
  if(!e.boss)launch(corpse,200+Math.min(320,(blow||0)*3),fx0/fl,fy0/fl,e.elite?120:200);
  S.corpses.push(corpse);
  if(S.corpses.length>34)S.corpses.shift();
  if(e.boss)impact(0.32);   /* the only hit-stop left: the boss going down */
  spark(e.x,e.y,e.elite?14:7,e.elite?COL.elite:COL.hostile,e.elite?190:130);
  var n=(e.elite?4:1)*(relic('bloodmoon')?2:1);
  var per=e.xp/(e.elite?4:1);
  for(var j=0;j<n;j++){var gem={id:nextId(),x:e.x+rr(-6,6),y:e.y+rr(-6,6),v:per,t:0,z:0,vz:0,ax:0,ay:0,bounces:0};
    var ga=rnd()*TAU; launch(gem,rr(170,320),Math.cos(ga),Math.sin(ga),rr(30,90)); S.gems.push(gem)}
  $('sKills').textContent=S.kills;
  if(S.kills===100)award('century');
  /* relics that fire on a kill. Neighbours are damaged through damageEnemy, so
     chains can cascade -- each enemy is spliced before its own kill fires, so
     the cascade always terminates. */
  if(relic('chain')&&blow>0&&rnd()<0.2){
    var arcs=S.enemies.map(function(o){return {o:o,d:dist(e,o)}}).filter(function(z){return z.d<170})
      .sort(function(a,b){return a.d-b.d}).slice(0,2);
    arcs.forEach(function(z){
      pushFx({beam:1,x:e.x,y:e.y-e.r,x2:z.o.x,y2:z.o.y-z.o.r,col:'#9BE8FF',t:0,life:.16});
      damageEnemy(z.o,blow*0.4,false,by);
    });
    if(arcs.length)sfx('smite',{gap:0.08});
  }
  if(relic('toll')&&e.hpMax>40){
    fx(e.x,e.y,96,'#FFB04A',.32);
    S.enemies.slice().forEach(function(o){ if(dist(e,o)<96)damageEnemy(o,e.hpMax*0.3,false,by) });
  }
}

function pickTarget(e){
  var bestH=null,bs=-1;
  for(var i=0;i<ORDER.length;i++){
    var h=S.h[ORDER[i]]; if(h.down)continue;
    var d=dist(e,h), base=h.threat;
    if(h.key==='tank'&&d<h.taunt) base+=900*(h.threatMul==null?1:h.threatMul);
    var sc=(base+30)/(1+d/260);
    if(sc>bs){bs=sc;bestH=h}
  }
  return bestH;
}

function useAbility(h){
  if(!h||mode!=='play'||h.down||h.abil>0)return;
  h.abil=h.abilCd;
  if(h.key==='tank'){
    fx(h.x,h.y,h.taunt,COL.tank,.42);
    sfx('shock');
    S.enemies.slice().forEach(function(e){
      var d=dist(h,e); if(d<h.taunt){
        var a=Math.atan2(e.y-h.y,e.x-h.x), p=(1-d/h.taunt);
        damageEnemy(e,h.dmg*1.4,false,h); e.tgt=h;
        /* the wave reaches the far ring a beat later: it ripples outward */
        if(!e.boss)(function(en,aa,pp,dd){setTimeout(function(){
          if(mode!=='play'||S.enemies.indexOf(en)<0)return;
          launch(en,300+220*pp,Math.cos(aa),Math.sin(aa),320)},dd*0.9)})(e,a,p,d);
      }
    });
    threatFrom(h,400);
    if(h.flags.rally)ORDER.forEach(function(k){healHero(S.h[k],S.h[k].hpMax*0.12,h)});
    if(!reduce)rt.shake=6;
  } else if(h.key==='dps'&&h.cls==='rogue'){
    /* Shadowstep: a dash along your stick (or at the nearest enemy), cutting
       everything on the line; you are untouchable for it and forgotten after */
    var iv=heroInput(h.key), dx=iv.x, dy=iv.y;
    if(Math.abs(dx)+Math.abs(dy)<0.1){var tn=nearestEnemy(h,400);
      if(tn){var dd=dist(h,tn)||1;dx=(tn.x-h.x)/dd;dy=(tn.y-h.y)/dd}else{dx=h.face;dy=0}}
    h.dash={t:0,dur:0.18,dx:dx,dy:dy,hit:[],len:220};
    h.threat=0; h.face=dx<0?-1:1;
    sfx('shadow'); spark(h.x,h.y-10,14,COL.rogue,160);
  } else if(h.key==='dps'){
    var shots=h.flags.volleyTwice?2:1;
    sfx('volley');
    for(var v=0;v<shots;v++){
      (function(delay){setTimeout(function(){
        if(mode!=='play')return;
        var t=nearestEnemy(h,520)||{x:h.x+rr(-120,120),y:h.y+rr(-120,120)};
        var R=120*h.volleyR;
        fx(t.x,t.y,R,COL.dps,.4);
        S.enemies.slice().forEach(function(e){ if(dist(t,e)<R){
          var r2=attackDamage(h,e,h.dmg*2.2); damageEnemy(e,r2.dmg,r2.crit,h)} });
        spark(t.x,t.y,12,COL.dps,150);
      },delay)})(v*260);
    }
  } else {
    fx(h.x,h.y,240,COL.heal,.45);
    sfx('bene');
    ORDER.forEach(function(k){var a=S.h[k];
      if(a.down){a.rez=Math.max(a.rez,2.2)} else healHero(a,60*h.healPow+a.hpMax*0.18,h)});
    threatFrom(h,120);
  }
  syncAbil();
}
function nearestEnemy(p,max){
  var b=null,bd=max||1e9;
  for(var i=0;i<S.enemies.length;i++){var d=dist(p,S.enemies[i]); if(d<bd){bd=d;b=S.enemies[i]}}
  return b;
}

export { alive, floatTxt, fx, pushFx, spark, impact, attackDamage, threatFrom, damageHero, healHero,
         damageEnemy, killEnemy, pickTarget, useAbility, nearestEnemy };
