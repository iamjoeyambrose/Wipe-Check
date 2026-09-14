/**
 * The fixed update step: spawning, movement, collisions, XP.
 */

import { edgeSpawn, healerLogic, heroAttack, propPush, spawnBoss, spawnEnemy, ringPoint } from './actors.js';
import { musicIntensity, sfx } from './audio.js';
import { motes } from './art/atlas.js';
import { attackDamage, damageEnemy, damageHero, floatTxt, fx, nearestEnemy, pickTarget, pushFx, spark } from './combat.js';
import { COL, H, ORDER, PLAY, W, WALLY, WORLD_W, WORLD_H, rnd } from './config.js';
import { STAGES } from './content.js';
import { openChest, openLevel, stageClear } from './flow.js';
import { heroInput, pumpRemoteActions } from './seats.js';
import { airborne, launch, step } from './physics.js';
import { objectiveUpdate, hordeTier, spawnCap, enemyMul } from './objective.js';
import { alcoveClamp, floorTop, secretUpdate } from './secret.js';
import { chestInterval, relic } from './relics.js';
import { S, mode, reduce, rt, nextId } from './state.js';
import { syncBars, syncFrames, syncXp } from './ui.js';
import { $, clamp, dist, rr } from './util.js';

/* a chest lands just past the edge of the screen and waits */
function spawnChest(x,y){
  var p= x==null ? ringPoint(S.cam,40,120) : {x:x,y:y};
  var c={id:nextId(),x:clamp(p.x,PLAY.left+30,PLAY.right-30),y:clamp(p.y,PLAY.top+30,PLAY.bot-30),t:0,r:16,
    z:560,vz:0,ax:0,ay:0,bounces:1,sqx:1,sqy:1,landed:false};
  S.chests.push(c);
  return c;
}
/* an enemy hitting the floor hard staggers whatever is standing next to it */
function onEnemyLand(e,speed){
  e.sqx=1.4; e.sqy=0.62;
  if(speed>300){
    fx(e.x,e.y,44,'#C8B79A',.25);
    for(var i=0;i<S.enemies.length;i++){var o=S.enemies[i];
      if(o!==e&&!airborne(o)&&dist(o,e)<40)o.stun=Math.max(o.stun||0,0.35)}
  }
}

/* the camera does nothing on impacts any more; kept so the loop's call site
   and the state fields stay stable if we ever want a gentle version back */
function decayCamera(dt){ rt.kick.x=0; rt.kick.y=0; rt.zoom=1; }

function update(dt){
  S.t+=dt; S.elapsed+=dt;
  var st=STAGES[S.stage];

  // spawning: the horde tier decides what comes and how fast; nothing but
  // the key ever ends this
  if(!S.boss&&!S.keyTurned){
    S.spawnT-=dt;
    var tier=hordeTier(S.t,S.stage);
    if(S.spawnT<=0&&S.enemies.length<spawnCap(S.stage,tier)){
      var rate=Math.max(0.10,0.46-S.stage*0.045-S.t*0.0008);
      if(tier>=4)rate*=0.5;
      if(relic('bloodmoon'))rate/=1.4;
      S.spawnT=rate;
      var mul=enemyMul(S.t,S.stage);
      var roll=rnd(), type='grunt', n=1+(rnd()<0.55?1:0)+(rnd()<0.25?1:0);
      if(tier>=1&&roll<0.30)type='runner';
      else if(tier>=2&&roll<0.50)type='caster';
      if(tier>=3&&rnd()<(tier>=4?0.22:0.12)){
        /* a brute pack: the brute and its escort */
        var bp=edgeSpawn(); spawnEnemy('brute',bp.x,bp.y,mul);
        for(var g2=0;g2<3;g2++)spawnEnemy('grunt',bp.x+rr(-30,30),bp.y+rr(-24,24),mul);
        if(tier>=4){for(var g3=0;g3<2;g3++){var bq=edgeSpawn();spawnEnemy('brute',bq.x,bq.y,mul)}}
      }
      for(var q=0;q<n;q++){var p=edgeSpawn();spawnEnemy(type,p.x,p.y,mul)}
    }
    var want=tier>=4||S.enemies.length>30?2:S.enemies.length>12?1:0;
    if(want!==S.musIntensity){S.musIntensity=want;musicIntensity(want)}
    // chests: one about every minute, sooner with luck; none once the boss is up
    S.chestT-=dt;
    if(S.chestT<=0&&S.chests.length<2){ spawnChest(); S.chestT=chestInterval(); }
  } else {
    S.bossT+=dt;
    if(S.bossT>48&&!S.enraged){S.enraged=true;S.boss.dmg*=2.6;S.boss.sp*=1.4;
      floatTxt(S.cam.x,S.cam.y-H/2+60,'ENRAGED','#FF4A3F',1); sfx('enrage'); $('enrage').classList.add('hot')}
  }

  // camera: follow the driven hero, clamped to the room
  var lead=S.h[S.ctrl];
  var cx=clamp(lead.x,W/2,WORLD_W-W/2), cy=clamp(lead.y,H/2,WORLD_H-H/2);
  var f=Math.min(1,dt*5.5);
  S.cam.x+=(cx-S.cam.x)*f; S.cam.y+=(cy-S.cam.y)*f;

  // remote abilities and swaps, bot abilities
  pumpRemoteActions();

  // heroes
  ORDER.forEach(function(k){
    var h=S.h[k];
    if(h!==lead&&!h.down&&(!S.seats||S.seats[k]==='bot')&&dist(h,lead)>760){
      /* a bot that fell too far behind rejoins at the leader's side (a player
         online goes where they like) */
      h.x=lead.x+(k==='dps'?-60:60); h.y=lead.y+40;
      spark(h.x,h.y,10,h.role.col,120);
    }
    h.threat*=Math.pow(0.55,dt);
    h.abil=Math.max(0,h.abil-dt);
    step(h,dt,function(o){o.sqx=1.18;o.sqy=0.84});
    h.sqx+=(1-h.sqx)*Math.min(1,dt*12); h.sqy+=(1-h.sqy)*Math.min(1,dt*12);
    h.hitFlash=Math.max(0,h.hitFlash-dt*4);
    if(h.down){h.downT+=dt;
      if(relic('wind')&&!S.windUsed&&h.downT>=8){
        S.windUsed=true; h.down=false; h.hp=h.hpMax*0.3; h.rez=0; launch(h,260,0,0,0);
        floatTxt(h.x,h.y-26,'SECOND WIND',COL.gold,1); spark(h.x,h.y,14,COL.gold,150);
        sfx('rez'); syncFrames();
      }
      return}
    var rg=S.regen+((h.flags&&h.flags.regen)||0);
    if(rg)h.hp=Math.min(h.hpMax,h.hp+h.hpMax*rg*dt);
    var v = heroInput(k);
    if(h.dash){
      /* Shadowstep: carried along the line, cutting what it crosses */
      var ds=h.dash, dsp=ds.len/ds.dur; ds.t+=dt;
      h.vx=ds.dx*dsp; h.vy=ds.dy*dsp;
      for(var qi=0;qi<S.enemies.length;qi++){var qe=S.enemies[qi];
        if(ds.hit.indexOf(qe)>=0||dist(h,qe)>34+qe.r*0.5)continue;
        ds.hit.push(qe);
        var qd=attackDamage(h,qe,h.dmg*1.6); damageEnemy(qe,qd.dmg*(qd.crit?1:2+(h.critMul||0)),true,h);
        if(h.flags.smoketrail&&!qe.boss)qe.stun=Math.max(qe.stun||0,1.2);
      }
      spark(h.x,h.y-8,3,COL.rogue,60);
      if(h.flags.smoketrail)pushFx({x:h.x,y:h.y,r:26,r0:26,col:'#6E5A9A',t:0,life:.5});
      if(ds.t>=ds.dur){h.dash=null;h.vx=0;h.vy=0}
    } else { h.vx=v.x*h.speed; h.vy=v.y*h.speed; }
    h.x=clamp(h.x+h.vx*dt,PLAY.left+h.r,PLAY.right-h.r);
    h.y=clamp(h.y+h.vy*dt,floorTop(h.x)+h.r,PLAY.bot-h.r);
    alcoveClamp(h,h.r);
    propPush(h,h.r);
    var spd=Math.sqrt(h.vx*h.vx+h.vy*h.vy);
    h.stillT = spd<6 ? h.stillT+dt : 0;
    h.phase+=(spd/h.speed)*dt*2.15;
    h.swing=Math.max(0,h.swing-dt);
    var aim=nearestEnemy(h,h.reach+60);
    if(aim&&Math.abs(aim.x-h.x)>6)h.face=aim.x>h.x?1:-1;
    else if(Math.abs(h.vx)>8)h.face=h.vx>0?1:-1;
    heroAttack(h,dt);
    if(k==='heal')healerLogic(h,dt);
    // walk into a chest to open it (once it has hit the floor)
    for(var ci=S.chests.length-1;ci>=0;ci--){var ch=S.chests[ci];
      if(!airborne(ch)&&dist(h,ch)<h.r+ch.r){S.chests.splice(ci,1);openChest(ch);return}}
  });
  // chests: fall in, thud, and are forgotten if left far behind
  for(var cj=S.chests.length-1;cj>=0;cj--){var cc=S.chests[cj]; cc.t+=dt;
    if(step(cc,dt)&&!cc.landed){cc.landed=true; cc.sqx=1.3; cc.sqy=0.7;
      fx(cc.x,cc.y,80,'#E8C46A',.32); spark(cc.x,cc.y,10,'#C8B79A',120);
      sfx('lock',{v:0.55,gap:0.1}); if(!reduce&&dist(cc,S.cam)<700)rt.shake=Math.max(rt.shake,4)}
    cc.sqx+=(1-cc.sqx)*Math.min(1,dt*10); cc.sqy+=(1-cc.sqy)*Math.min(1,dt*10);
    if(dist(cc,S.cam)>2000)S.chests.splice(cj,1)}
  if(mode!=='play')return;   // a chest just opened
  objectiveUpdate(dt); secretUpdate(dt);
  if(mode!=='play')return;

  // Momentary Stillness: a hard stop for everything hostile
  if(relic('still')){
    S.stillT+=dt;
    if(S.stillT>=20){S.stillT=0;S.frozenT=1.5;
      fx(S.cam.x,S.cam.y,420,'#BFEAFF',.5); floatTxt(S.cam.x,S.cam.y-70,'STILLNESS','#BFEAFF',1); sfx('still')}
  }
  var frozen=S.frozenT>0;
  if(frozen)S.frozenT-=dt;

  // enemies
  for(var i=S.enemies.length-1;i>=0;i--){
    var e=S.enemies[i];
    e.flash=Math.max(0,e.flash-dt*5);
    e.sqx+=(1-e.sqx)*Math.min(1,dt*14); e.sqy+=(1-e.sqy)*Math.min(1,dt*14);
    if(frozen)continue;
    if(e.bleed){var bl=e.bleed; bl.t-=dt; bl.acc+=dt;
      if(bl.acc>=0.5){bl.acc-=0.5; damageEnemy(e,bl.dps*0.5,false,bl.by); if(S.enemies[i]!==e)continue}
      if(bl.t<=0)e.bleed=null}
    step(e,dt,onEnemyLand);
    if(airborne(e)){
      /* in the air you are a passenger: no chasing, no biting, a little stretch */
      e.sqy=Math.max(e.sqy,1.12); e.sqx=Math.min(e.sqx,0.92);
      e.x=clamp(e.x,PLAY.left-40,PLAY.right+40); e.y=clamp(e.y,Math.min(68,floorTop(e.x)+12),PLAY.bot+34);
      continue;
    }
    if(e.stun>0){e.stun-=dt;continue}
    e.retgt-=dt;
    if(e.retgt<=0||!e.tgt||e.tgt.down){e.tgt=pickTarget(e);e.retgt=rr(.3,.6)}
    var t=e.tgt; if(!t)continue;
    var d=dist(e,t), a=Math.atan2(t.y-e.y,t.x-e.x);
    e.ph+=e.sp*dt*(e.boss?0.055:0.085);
    if(Math.abs(t.x-e.x)>5)e.face=t.x>e.x?1:-1;

    if(e.champion){
      /* wardens hunt anyone close and otherwise pace their ground -- and
         stay on floor a hero can reach, so their drop always can be too */
      e.x=clamp(e.x,PLAY.left+60,PLAY.right-60); e.y=clamp(e.y,PLAY.top+60,PLAY.bot-60);
      var far=dist(e,e.home)>260, hunt=d<420&&!far;
      var ga=hunt?a:Math.atan2(e.home.y-e.y,e.home.x-e.x);
      if(hunt?d>e.r+t.r:dist(e,e.home)>30){e.x+=Math.cos(ga)*e.sp*dt;e.y+=Math.sin(ga)*e.sp*dt}
      e.cd-=dt;
      if(d<e.r+t.r+4&&e.cd<=0){e.cd=1.0;damageHero(t,e.dmg,e)}
    } else if(e.boss){
      /* the last boss has a second phase: at half health it enrages on the
         spot, its slams come in threes and every add is a caster */
      if(S.stage===STAGES.length-1&&!e.phase2&&e.hp<e.hpMax*0.5){
        e.phase2=true;
        if(!S.enraged){S.enraged=true;e.dmg*=2.6;e.sp*=1.4;$('enrage').classList.add('hot')}
        floatTxt(e.x,e.y-70,'ENRAGE INCARNATE','#FF4A3F',1); sfx('enrage'); fx(e.x,e.y,260,'#FF4A3F',.6);
      }
      e.addT-=dt;
      if(e.addT<=0){e.addT=7.5;
        for(var z=0;z<3+S.stage;z++){var pp=edgeSpawn();spawnEnemy(e.phase2?'caster':(rnd()<.5?'runner':'grunt'),pp.x,pp.y,e.mul)}}
      if(e.slam>0){
        e.slam-=dt;
        if(e.slam<=0){
          fx(e.slamX,e.slamY,130,'#FF4A3F',.35);
          ORDER.forEach(function(k){var h=S.h[k];
            if(!h.down&&dist({x:e.slamX,y:e.slamY},h)<130)damageHero(h,e.dmg*1.6,null)});
          if(e.phase2&&(e.slamN=(e.slamN||0)+1)<3){e.slam=0.5;e.slamX=t.x;e.slamY=t.y}
          else e.slamN=0;
        }
      } else { e.cd-=dt; if(e.cd<=0){e.cd=rr(3.4,4.8);e.slam=1.15;e.slamX=t.x;e.slamY=t.y} }
      if(d>60){e.x+=Math.cos(a)*e.sp*dt;e.y+=Math.sin(a)*e.sp*dt}
      e.cd2=(e.cd2||0)-dt;
      if(d<e.r+t.r+8&&e.cd2<=0){e.cd2=1.0;damageHero(t,e.dmg,e)}
    } else if(e.ranged){
      if(d>e.ranged){e.x+=Math.cos(a)*e.sp*dt;e.y+=Math.sin(a)*e.sp*dt}
      else if(d<e.ranged*0.7){e.x-=Math.cos(a)*e.sp*dt*0.7;e.y-=Math.sin(a)*e.sp*dt*0.7}
      e.cd-=dt;
      if(e.cd<=0&&d<e.ranged+40){e.cd=rr(1.8,2.6);
        S.ebullets.push({id:nextId(),x:e.x,y:e.y,a:a,sp:210,dmg:e.dmg,r:6,col:'#E07AF0',t:0})}
    } else {
      e.x+=Math.cos(a)*e.sp*dt; e.y+=Math.sin(a)*e.sp*dt;
      e.cd-=dt;
      if(d<e.r+t.r+2&&e.cd<=0){e.cd=0.85;damageHero(t,e.dmg,e)}
    }
    // separation
    for(var j=i-1;j>=0&&j>i-14;j--){
      var o=S.enemies[j], dd=dist(e,o), mn=e.r+o.r;
      if(dd<mn&&dd>0.01){var px=(e.x-o.x)/dd*(mn-dd)*0.5,py=(e.y-o.y)/dd*(mn-dd)*0.5;
        e.x+=px;e.y+=py;o.x-=px;o.y-=py}
    }
    propPush(e,e.r*0.8);
    e.x=clamp(e.x,PLAY.left-40,PLAY.right+40); e.y=clamp(e.y,Math.min(68,floorTop(e.x)+12),PLAY.bot+34); alcoveClamp(e,e.r*0.5);
    if(!e.boss&&!e.champion&&dist(e,S.cam)>1120){var rp=ringPoint(S.cam,30,110);e.x=rp.x;e.y=rp.y}
  }

  // ally bullets
  for(var b=S.bullets.length-1;b>=0;b--){
    var p=S.bullets[b]; p.t+=dt;
    if(p.stuck){ if(p.t-p.stuckAt>p.life)S.bullets.splice(b,1); continue }
    p.x+=Math.cos(p.a)*p.sp*dt; p.y+=Math.sin(p.a)*p.sp*dt;
    /* an arrow that finds nothing plants itself in the flagstones at max range */
    if(p.z!=null&&p.t>0.72){p.z=0;p.stuck=true;p.stuckAt=p.t;p.life=0.9;p.sp=0;continue}
    /* cull against the world, not the screen: the party lives far from 0,0 now */
    if(p.t>2.2||p.x<PLAY.left-30||p.x>PLAY.right+30||p.y<WALLY-40||p.y>PLAY.bot+30){S.bullets.splice(b,1);continue}
    for(var m=0;m<S.enemies.length;m++){
      var en=S.enemies[m];
      if(p.hit.indexOf(en)>=0||airborne(en))continue;
      if(dist(p,en)<en.r+p.r){
        var res=p.by?attackDamage(p.by,en,p.base):{dmg:p.base,crit:false};
        damageEnemy(en,res.dmg,res.crit,p.by); p.hit.push(en);
        if(p.hit.length>p.pierce){S.bullets.splice(b,1)}
        break;
      }
    }
  }
  // enemy bullets
  for(var eb=S.ebullets.length-1;eb>=0;eb--){
    var q=S.ebullets[eb]; q.t+=dt;
    q.x+=Math.cos(q.a)*q.sp*dt; q.y+=Math.sin(q.a)*q.sp*dt;
    if(q.t>5||q.x<PLAY.left-30||q.x>PLAY.right+30||q.y<WALLY-40||q.y>PLAY.bot+30){S.ebullets.splice(eb,1);continue}
    for(var hi=0;hi<ORDER.length;hi++){var hh=S.h[ORDER[hi]];
      if(hh.down)continue;
      if(dist(q,hh)<hh.r+q.r){damageHero(hh,q.dmg,null);S.ebullets.splice(eb,1);break}}
  }
  // gems
  for(var gi=S.gems.length-1;gi>=0;gi--){
    var gm=S.gems[gi]; gm.t+=dt;
    if(gm.z!=null)step(gm,dt);
    if(dist(gm,S.cam)>1400){S.gems.splice(gi,1);continue}
    var nearest=null,nd=1e9;
    ORDER.forEach(function(k){var h=S.h[k];if(h.down)return;var d=dist(gm,h);if(d<nd){nd=d;nearest=h}});
    var vacR=S.vac*(1+((nearest&&nearest.flags&&nearest.flags.vac)||0));
    if(nearest&&nd<vacR){
      var aa=Math.atan2(nearest.y-gm.y,nearest.x-gm.x), sp=200+ (vacR-nd)*4;
      gm.x+=Math.cos(aa)*sp*dt; gm.y+=Math.sin(aa)*sp*dt;
      if(nd<nearest.r+6){S.gems.splice(gi,1);
        var gv=gm.v;
        if(relic('alchemy')&&(++S.gemCount)%6===0){gv*=3;floatTxt(gm.x,gm.y-10,'x3',COL.gold)}
        gainXp(gv);continue}
    }
  }
  // fx / floats
  for(var f=S.fx.length-1;f>=0;f--){var o2=S.fx[f];o2.t+=dt;
    if(o2.p){o2.x+=o2.vx*dt;o2.y+=o2.vy*dt;o2.vx*=0.94;o2.vy*=0.94}
    if(o2.t>=o2.life)S.fx.splice(f,1)}
  for(var fl=S.floats.length-1;fl>=0;fl--){var ft=S.floats[fl];ft.t+=dt;
    ft.y-=(ft.big?34:26)*dt*(1-ft.t*0.5); ft.x+=(ft.dx||0)*dt;
    if(ft.t>0.85)S.floats.splice(fl,1)}
  for(var cq=S.corpses.length-1;cq>=0;cq--){var cc2=S.corpses[cq];cc2.t+=dt;
    if(cc2.z!=null){ if(airborne(cc2))cc2.rot+=cc2.spin*dt; else cc2.rot+=(0-cc2.rot)*Math.min(1,dt*12);
      cc2.x=clamp(cc2.x,PLAY.left,PLAY.right); cc2.y=clamp(cc2.y,PLAY.top,PLAY.bot); step(cc2,dt) }
    if(cc2.t>=cc2.dur||dist(cc2,S.cam)>1300)S.corpses.splice(cq,1)}

  if(rt.shake>0){rt.shake-=dt*26;if(rt.shake<0)rt.shake=0}
  decayCamera(dt);
  for(var mi=0;mi<motes.length;mi++){var mo=motes[mi];
    mo.x+=mo.vx*dt; mo.y+=mo.vy*dt;
    if(mo.y<-6){mo.y=H+6;mo.x=rr(0,W)} if(mo.x<-6)mo.x=W+6; if(mo.x>W+6)mo.x=-6}

  // boss dead?
  if(S.boss&&S.enemies.indexOf(S.boss)<0){ S.boss=null; $('bosshp').classList.remove('on'); stageClear(); }
  syncBars();
}

function gainXp(v){
  S.xp+=v;
  while(S.xp>=S.xpNeed){
    S.xp-=S.xpNeed; S.lvl++; S.xpNeed=Math.round(8+S.lvl*5.2);
    rt.pendingLevels++;
  }
  syncXp();
  if(rt.pendingLevels>0&&mode==='play')openLevel();
}

export { update, gainXp, spawnChest, decayCamera };
