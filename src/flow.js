/**
 * Run lifecycle: stage start, boss clear, the level-up slot machine and the
 * boss loot roll.
 */

import { ringPoint, spawnEnemy } from './actors.js';
import { RELICS, applyRelic, pickRelic, relic, relicSummary } from './relics.js';
import { sfx, musicBoss, musicIntensity } from './audio.js';
import { seedMotes } from './art/atlas.js';
import { bakeRoom, buildProps } from './art/room.js';
import { floatTxt } from './combat.js';
import { COL, H, ORDER, ROLES, W, WORLD_W, WORLD_H, rnd } from './config.js';
import { STAGES, UPGRADES } from './content.js';
import { equip, canEquip, fullName, qualityCol, qualityName, slotLabel,
         affixLines, preview, rollDrops } from './items.js';
import { S, best, rt, setBest, setMode } from './state.js';
import { spawnChest } from './simulation.js';
import { resetObjective } from './objective.js';
import { resetSecret } from './secret.js';
import { award, runEndHtml } from './achievements.js';
import { broadcast, isGuest, isHost, toHost } from './net.js';
import { drainEv, forceSlow } from './snapshot.js';
import { localOwner, roleOf, syncAbil, syncFrames } from './ui.js';
import { $, clamp } from './util.js';

/* Shared moments online: the host rolls and tells the room, every screen
   builds the same panel, and only the picker's click does anything. The pick
   rotates through the seats people hold: level-ups by party level, loot by
   stage. Solo, the one held seat is always the picker. */
function pickerSeat(n){
  var held=ORDER.filter(function(k){return S.seats&&S.seats[k]!=='bot'});
  if(!held.length)return S.ctrl;
  return held[n%held.length];
}
function iAmPicker(){ return !S.picker||!S.seats||S.seats[S.picker]===localOwner() }
function pickerName(){
  var o=S.seats?S.seats[S.picker]:'host';
  return (S.names&&S.names[o])||roleOf(S.picker).name;
}

function startStage(n){
  S.stage=n; S.t=0; S.spawnT=0; S.boss=null; S.enraged=false;
  S.enemies=[];S.bullets=[];S.ebullets=[];S.gems=[];S.fx=[];S.floats=[];S.corpses=[];
  bakeRoom(n); buildProps(n); seedMotes(); resetSecret(n);
  $('enrage').classList.remove('hot');
  musicBoss(false); musicIntensity(0);
  ORDER.forEach(function(k){var h=S.h[k];
    if(h.down){h.down=false;h.hp=h.hpMax*0.35}
    h.guardUsed=false; h.momentum=0; h.stillT=0;
    h.x=WORLD_W/2+(k==='tank'?0:k==='dps'?-80:80); h.y=WORLD_H/2+(k==='tank'?-30:40);
  });
  S.cam.x=WORLD_W/2; S.cam.y=WORLD_H/2;
  S.chests=[]; S.chestT=n===0?40:28; S.windUsed=false; S.frozenT=0; S.stillT=0;
  resetObjective(n);
  if(relic('sense'))spawnChest();
  var opener=6+n*3, om=1+n*0.55;
  /* openers sit right on the screen edge so the pull starts the moment you do */
  for(var o=0;o<opener;o++){var op=ringPoint(S.cam,-30,20);spawnEnemy(n>=1&&rnd()<0.3?'runner':'grunt',op.x,op.y,om)}
  $('stagelbl').textContent=(n+1)+' — '+STAGES[n].n;
  $('sStage').textContent=(n+1)+'/'+STAGES.length;
  floatTxt(WORLD_W/2,WORLD_H/2-40,STAGES[n].n,COL.gold,1);
  sfx('stage');
  syncFrames();
}
function stageClear(){
  /* per-stage achievements land here, before the loot screen or the ending */
  S.stageTimes.push(S.elapsed-S.stageT0);
  if(S.hordeTier>=4){S.overtimeStages++; award('overtime')}
  if(S.seatsUsed.tank&&S.seatsUsed.dps&&S.seatsUsed.heal)award('seats');
  if(S.stage>=STAGES.length-1){
    if(!S.bossKilledEnraged)award('giant');
    finish(true); return;
  }
  setMode('loot'); openLoot();
}
function wipe(){ finish(false) }
function finish(won){
  setMode('over');
  musicBoss(false); musicIntensity(0);
  sfx(won?'win':'wipe');
  var sc=S.kills+S.lvl*12+S.stage*80+(won?500:0);
  if(sc>best){setBest(sc);try{localStorage.setItem('wipecheck.best',String(best))}catch(e){}}
  $('sBest').textContent=best;
  $('overTtl').textContent=won?'Cleared':'Wipe';
  $('overTtl').style.color=won?COL.gold:COL.hostile;
  $('overSub').textContent=won?'Vault of Wipes cleared with the roster intact':
    'Wiped on '+STAGES[S.stage].n+' — '+(S.boss?'the boss got there first':'the trash got there first');
  var mm=Math.floor(S.elapsed/60), ss=Math.floor(S.elapsed%60);
  $('overTally').innerHTML=
    tal('Score',sc)+tal('Kills',S.kills)+tal('Party level',S.lvl)+
    tal('Stage',(S.stage+1)+'/'+STAGES.length)+tal('Time',mm+':'+(ss<10?'0':'')+ss)+
    tal('Chests',S.chestsOpened)+tal('Downs',S.downs);
  /* the ending proper: what the party carried out of the vault */
  var held=relicSummary();
  var gearLine=ORDER.map(function(k){var h=S.h[k];
    var n=Object.keys(h.gear).filter(function(sl){return h.gear[sl]}).length;
    return '<span style="color:'+h.role.col+'">'+h.role.name+'</span> '+n+'/5 gear'}).join(' &middot; ');
  $('overLoot').innerHTML=(won?'<div class="endline">'+gearLine+'</div>':'')+
    (held.length?'<div class="endrelics">'+held.map(function(r){
      return '<span class="rl'+(r.kind==='curse'?' curse':'')+'">'+r.n+(r.count>1?' x'+r.count:'')+'</span>'}).join('')+'</div>':'');
  if(won){
    award('clear');
    if(S.elapsed<900)award('speed',S.elapsed);
    if(S.downs===0)award('nowipe');
    if(held.filter(function(r){return r.kind==='curse'}).reduce(function(a,r){return a+r.count},0)>=3)award('cursed');
    if(S.overtimeStages>=STAGES.length)award('marathon');
    try{localStorage.setItem('wipecheck.cleared','1')}catch(e){}
    document.body.classList.add('cleared');
    setTimeout(function(){sfx('fanfare')},350);
  }
  $('overAch').innerHTML=runEndHtml();
  $('vOver').hidden=false;
  $('overWait').hidden=true; $('btnAgain').hidden=false; $('btnRole').hidden=false; $('btnOverLeave').hidden=true;
  if(isHost())broadcast({t:'over',won:won,ttl:$('overTtl').textContent,sub:$('overSub').textContent,
    tally:$('overTally').innerHTML,loot:$('overLoot').innerHTML,ev:drainEv()});
}
/* a guest's ending: the host's words, my own trophies */
function showOver(msg){
  setMode('over');
  musicBoss(false); musicIntensity(0);
  sfx(msg.won?'win':'wipe');
  $('overTtl').textContent=msg.ttl; $('overTtl').style.color=msg.won?COL.gold:COL.hostile;
  $('overSub').textContent=msg.sub; $('overTally').innerHTML=msg.tally; $('overLoot').innerHTML=msg.loot;
  if(msg.won){ try{localStorage.setItem('wipecheck.cleared','1')}catch(e){} document.body.classList.add('cleared'); setTimeout(function(){sfx('fanfare')},350); }
  $('overAch').innerHTML=runEndHtml();
  $('btnAgain').hidden=true; $('btnRole').hidden=true; $('btnOverLeave').hidden=false;
  $('overWait').textContent='Waiting for the host'; $('overWait').hidden=false;
  $('vOver').hidden=false;
}
function tal(k,v){return '<div><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'}

/* ------------------------------------------------- level up: slot machine */
function upgradeCard(u,dim){
  var col=u.r==='party'?COL.gold:roleOf(u.r).col;
  return '<div class="slot'+(dim?' ghost':'')+'" style="border-top-color:'+col+'">'+
    '<div class="role" style="color:'+col+'">'+
      (u.r==='party'?'Party':roleOf(u.r).name+' · '+roleOf(u.r).label)+'</div>'+
    '<div class="ttl">'+u.n+'</div><div class="txt">'+u.t+'</div>'+
    (u.tal?'<div class="flag">Talent</div>':'')+'</div>';
}

function openLevel(){
  setMode('levelup');
  /* the DPS seat drafts for the class sitting in it */
  var cls=S.h.dps.cls||'ranger';
  var pool=UPGRADES.filter(function(u){return !u.cls||u.cls===cls}), out=[];
  while(out.length<3&&pool.length)out.push(pool.splice(Math.floor(rnd()*pool.length),1)[0]);
  /* luck: each point is a 15% chance to swap a plain roll for a talent */
  if(S.luck&&!out.some(function(u){return u.tal})&&rnd()<Math.min(0.6,S.luck*0.15)){
    var tals=pool.filter(function(u){return u.tal});
    if(tals.length)out[Math.floor(rnd()*out.length)]=tals[Math.floor(rnd()*tals.length)];
  }
  S.picker=pickerSeat(S.lvl);
  if(isHost())broadcast({t:'levelup',cards:out.map(function(u){return UPGRADES.indexOf(u)}),picker:S.picker,lvl:S.lvl});
  showLevel(out);
}
function applyLevelPick(i){
  var u=S.lvlCards&&S.lvlCards[i]; if(!u)return;
  u.f(S);
  if(u.r!=='party')S.h[u.r].kit.push(u.n);
  rt.pendingLevels--;
  $('vLevel').hidden=true;
  if(rt.pendingLevels>0)openLevel();
  else {setMode('play');syncFrames();syncAbil()}
  if(isHost())forceSlow();
}
function showLevel(out){
  S.lvlCards=out;
  $('lvlTtl').textContent='Party level '+S.lvl;
  $('lvlSub').textContent='Rolling…';
  var wrap=$('lvlCards');
  wrap.className='reels'+(iAmPicker()?'':' watch');
  wrap.innerHTML='';
  sfx('levelup');

  var FILL=7, reels=[], done=0;
  out.forEach(function(u,i){
    var reel=document.createElement('button');
    reel.className='reel'; reel.disabled=true;
    var strip=document.createElement('div');
    strip.className='strip';
    var html='';
    for(var f=0;f<FILL;f++) html+=upgradeCard(UPGRADES[Math.floor(rnd()*UPGRADES.length)],true);
    html+=upgradeCard(u,false);
    strip.innerHTML=html;
    strip.style.transform='translateY(0px)';
    reel.appendChild(strip);
    reel.onclick=function(){
      if(reel.disabled||!iAmPicker())return;
      sfx('click');
      if(isGuest())toHost({t:'pick',i:i}); else applyLevelPick(i);
    };
    wrap.appendChild(reel);
    reels.push({el:reel,strip:strip});
  });

  /* let layout settle, then throw each strip and slam it to a stop. The
     landing spot is wherever the real card actually sits -- with Reduce
     Motion on, the filler cards are hidden and it sits at the top. */
  requestAnimationFrame(function(){
    reels.forEach(function(r,i){
      var dur=360+i*185;
      r.strip.style.transform='translateY(-'+r.strip.lastChild.offsetTop+'px)';
      r.strip.style.transition='transform '+dur+'ms cubic-bezier(.16,.86,.2,1)';
      var tick=setInterval(function(){sfx('reel',{gap:0.01})},56);
      setTimeout(function(){
        clearInterval(tick);
        sfx('lock');
        r.el.disabled=false;
        r.el.classList.add('locked');
        /* SLAM: the reel punches down, flashes, and knocks the panel */
        var flash=document.createElement('span');
        flash.className='flash';
        r.el.appendChild(flash);
        r.el.classList.add('slam');
        setTimeout(function(){
          r.el.classList.remove('slam');
          if(flash.parentNode)flash.parentNode.removeChild(flash);
        },300);
        if(++done===reels.length){
          $('lvlSub').textContent=iAmPicker()?'Draft one':pickerName()+"'s pick";
          if(out.some(function(u){return u.tal}))sfx('jackpot');
        }
      },dur);
    });
  });
  $('vLevel').hidden=false;
}

/* ---------------------------------------------------------- relic chest */
function relicCard(r,dim){
  var curse=r.kind==='curse', col=curse?COL.hostile:COL.gold;
  return '<div class="slot'+(dim?' ghost':'')+'" style="border-top-color:'+col+'">'+
    '<div class="role" style="color:'+col+'">'+(curse?'Cursed relic':'Relic')+'</div>'+
    '<div class="ttl">'+r.n+'</div><div class="txt">'+r.t+'</div>'+
    '<div class="flag" style="color:'+col+'">'+(curse?'Double-edged':'Legendary')+'</div></div>';
}
function relicList(){
  var held=relicSummary();
  if(!held.length)return '<span class="neutral">No relics yet</span>';
  return held.map(function(r){
    return '<span class="'+(r.kind==='curse'?'down':'up')+'">'+r.n+(r.count>1?' x'+r.count:'')+'</span>';
  }).join('');
}
function openChest(c){
  S.chestsOpened++; if(S.chestsOpened>=10)award('hoarder');
  /* Greed: half the chests are teeth */
  if(relic('greed')&&rnd()<0.5){
    var m=1+S.stage*0.55+S.t*0.012;
    var mim=spawnEnemy('brute',c.x,c.y,m);
    mim.hp=mim.hpMax*=1.3;
    floatTxt(c.x,c.y-30,'MIMIC',COL.hostile,1); sfx('mimic'); if(!rt.freeze)rt.shake=8;
    return;
  }
  setMode('relic');
  var r=pickRelic();
  if(isHost())broadcast({t:'relic',id:r.id});
  showRelic(r);
}
function closeRelic(){ sfx('click'); $('vRelic').hidden=true; setMode('play'); syncFrames(); }
function showRelic(r){
  $('relicSub').textContent='Rolling…';
  var wrap=$('relicReel'); wrap.className='reels one'; wrap.innerHTML='';
  $('relicTake').innerHTML='';
  $('relicHeld').innerHTML=relicList();
  sfx('chest');

  var FILL=9;
  var reel=document.createElement('div'); reel.className='reel wide';
  var strip=document.createElement('div'); strip.className='strip';
  var html='';
  for(var f=0;f<FILL;f++)html+=relicCard(RELICS[Math.floor(rnd()*RELICS.length)],true);
  html+=relicCard(r,false);
  strip.innerHTML=html; strip.style.transform='translateY(0px)';
  reel.appendChild(strip); wrap.appendChild(reel);

  requestAnimationFrame(function(){
    var dur=1150;
    strip.style.transform='translateY(-'+strip.lastChild.offsetTop+'px)';
    strip.style.transition='transform '+dur+'ms cubic-bezier(.16,.86,.2,1)';
    var tick=setInterval(function(){sfx('reel',{gap:0.01})},56);
    setTimeout(function(){
      clearInterval(tick);
      var curse=r.kind==='curse';
      if(isGuest())S.relics.push(r.id); else applyRelic(r);
      sfx(curse?'relicBad':'relicGood');
      reel.classList.add('locked',curse?'curse':'boon');
      var flash=document.createElement('span'); flash.className='flash'; reel.appendChild(flash);
      reel.classList.add('slam');
      setTimeout(function(){reel.classList.remove('slam'); if(flash.parentNode)flash.parentNode.removeChild(flash)},300);
      $('relicSub').textContent=curse?'The chest had teeth in it':'It is yours';
      $('relicHeld').innerHTML=relicList();
      var b=document.createElement('button'); b.className='cta'; b.textContent=curse?'Live with it':'Take it';
      b.onclick=function(){ if(isGuest())toHost({t:'relicTake'}); else closeRelic(); };
      $('relicTake').appendChild(b);
    },dur);
  });
  $('vRelic').hidden=false;
}

/* -------------------------------------------------------- boss loot roll */
function itemCard(it){
  var col=qualityCol(it);
  var lines=[it.t].concat(affixLines(it));
  return '<div class="role" style="color:'+col+'">'+slotLabel(it)+
      (it.role?' · '+(it.cls==='rogue'?'Shade':it.cls==='ranger'?'Ranger':roleOf(it.role).name):'')+'</div>'+
    '<div class="ttl" style="color:'+col+'">'+fullName(it)+'</div>'+
    '<div class="txt">'+lines.join('<br>')+'</div>'+
    '<div class="flag" style="color:'+col+'">'+qualityName(it)+' · '+it.build+'</div>';
}

function openLoot(){
  S.drops=rollDrops(S.stage,S.h,{count:relic('bounty')?4:3,luck:S.luck});
  S.picker=pickerSeat(S.stage);
  var recips={};
  S.drops.forEach(function(it){recips[it.uid]=recipientsFor(it)});
  if(isHost())broadcast({t:'loot',drops:S.drops,picker:S.picker,recips:recips,stage:S.stage});
  showLoot(recips);
}
/* who can take an item and what it does to them, worked out where the real
   stats live so guests see the same numbers */
function recipientsFor(it){
  return ORDER.filter(function(k){return canEquip(S.h[k],it)}).map(function(k){
    var h=S.h[k], cur=h.gear[it.slot];
    return {k:k,rows:preview(h,it),cur:cur?fullName(cur):null};
  });
}
function applyLootPick(uid,k){
  var it=(S.drops||[]).filter(function(d){return d.uid===uid})[0]; if(!it)return;
  var h=S.h[k]; if(!canEquip(h,it))return;
  sfx('equip');
  equip(h,it);
  h.kit.push(it.n.split(' ')[0]);
  $('vLoot').hidden=true; setMode('play');
  startStage(S.stage+1); syncFrames(); syncAbil();
  if(isHost())forceSlow();
}
function showLoot(recips){
  S.lootPick=null; S.lootRecips=recips;
  $('lootSub').textContent=STAGES[S.stage].boss+' dropped three — '+(iAmPicker()?'take one':pickerName()+' picks');
  var wrap=$('lootCards');
  wrap.className='cards';
  wrap.innerHTML='';
  sfx(S.drops.some(function(d){return d.q===2})?'lootEpic':'loot');

  S.drops.forEach(function(it){
    var c=document.createElement('button');
    c.className='card'; c.style.borderTopColor=qualityCol(it);
    c.innerHTML=itemCard(it);
    c.onclick=function(){
      sfx('click');
      S.lootPick=it;
      Array.prototype.forEach.call(wrap.children,function(n){n.classList.remove('on')});
      c.classList.add('on');
      showRecipients(it);
    };
    wrap.appendChild(c);
  });
  $('lootTake').innerHTML='<div class="hintline">Pick a drop to see who it changes.</div>';
  $('vLoot').hidden=false;
}

function showRecipients(it){
  var box=$('lootTake');
  box.innerHTML='';
  box.classList.toggle('watch',!iAmPicker());
  var list=(S.lootRecips&&S.lootRecips[it.uid])||recipientsFor(it);
  list.forEach(function(rc){
    var k=rc.k, rows=rc.rows;
    var b=document.createElement('button');
    b.className='recip'; b.style.borderLeftColor=roleOf(k).col;
    b.innerHTML='<div class="rn" style="color:'+roleOf(k).col+'">'+roleOf(k).name+
        '<small>'+(rc.cur?'replaces '+rc.cur:'empty '+slotLabel(it).toLowerCase())+'</small></div>'+
      '<div class="deltas">'+(rows.length?rows.map(function(r){
        return '<span class="'+(r.good===null?'neutral':r.good?'up':'down')+'">'+
          r.label+' '+r.text+'</span>'}).join(''):'<span class="neutral">no change</span>')+'</div>';
    b.onclick=function(){
      if(!iAmPicker())return;
      if(isGuest())toHost({t:'lootPick',uid:it.uid,role:k}); else applyLootPick(it.uid,k);
    };
    box.appendChild(b);
  });
}

export { startStage, stageClear, wipe, finish, showOver, tal, openLevel, showLevel, applyLevelPick, openLoot, showLoot, applyLootPick, openChest, showRelic, closeRelic, itemCard, pickerSeat, iAmPicker };
