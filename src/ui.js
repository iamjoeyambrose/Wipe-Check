/**
 * Party frames, HUD readouts and the menu / draft / loot / result screens.
 */

import { sfx, audioInit, audioToggle, audioMuted, musicStart, musicStop, musicBoss, setVolume, getVolume } from './audio.js';
import { CLASSES, COL, ORDER, ROLES } from './config.js';
import { shadeUnlocked } from './secret.js';
import { SLOTS, SLOT_NAME, fullName, qualityCol, qualityName, slotLabel,
         affixLines } from './items.js';
import { STAGES } from './content.js';
import { startStage } from './flow.js';
import { relicSummary } from './relics.js';
import { buildTrophies, resetRun } from './achievements.js';
import { isGuest, isHost, isSolo, netId } from './net.js';
import { onlineAgain, onlineSeats, toLobby, leaveRoom } from './lobby.js';
import { press, trySwap } from './seats.js';
import { S, mode, newGame, rt, setMode } from './state.js';
import { $, clamp } from './util.js';

/* the role table for a seat: the live hero's, so a Shade in the DPS seat
   shows as one everywhere */
function roleOf(k){ return S&&S.h&&S.h[k]?S.h[k].role:ROLES[k] }
function buildFrames(){
  $('frames').innerHTML='';
  ORDER.forEach(function(k,i){
    var R=roleOf(k);
    var f=document.createElement('button');
    f.className='frame'; f.id='fr_'+k; f.style.borderLeftColor=R.col;
    f.innerHTML='<div class="nm" style="color:'+R.col+'">'+R.name+'<small>'+(i+1)+' · '+R.label+'</small></div>'+
      '<div class="bar"><i style="background:'+COL.hp+'"></i><b></b></div>'+
      (k==='heal'?'<div class="bar mana"><i style="background:'+COL.mana+'"></i><b></b></div>':'')+
      '<div class="slots"></div><div class="kit"></div>';
    f.onclick=function(){ if(S&&mode==='play'&&!S.h[k].down){ if(isGuest())press(2<<ORDER.indexOf(k)); else trySwap('host',k); } };
    $('frames').appendChild(f);
  });
}
/* the owner id that means 'me' on this machine */
function localOwner(){ return isGuest()?netId():'host'; }
function syncFrames(){
  if(!S)return;
  ORDER.forEach(function(k){
    var h=S.h[k], f=$('fr_'+k); if(!f)return;
    f.classList.toggle('sel',S.ctrl===k);
    f.classList.toggle('down',h.down);
    /* who holds the seat: a bot, me, or a named player */
    var owner=S.seats?S.seats[k]:(S.ctrl===k?'host':'bot');
    var tag=owner==='bot'?'':(owner===localOwner()?'You':((S.names&&S.names[owner])||'Player'));
    var small=f.querySelector('.nm small');
    var wantSmall=(ORDER.indexOf(k)+1)+' \u00b7 '+(tag||h.role.label);
    if(small.textContent!==wantSmall)small.textContent=wantSmall;
    f.classList.toggle('held',!!tag);
    var pips=f.querySelector('.slots');
    var wantPips=SLOTS.map(function(sl){
      var it=h.gear[sl];
      return '<i class="pip'+(it?'':' empty')+'" title="'+SLOT_NAME[sl]+
        (it?': '+fullName(it):' \u2014 empty')+'"'+
        (it?' style="background:'+qualityCol(it)+'"':'')+'></i>';
    }).join('');
    if(pips.innerHTML!==wantPips)pips.innerHTML=wantPips;
    var kit=f.querySelector('.kit');
    var want=h.kit.slice(-3).map(function(n){return '<span class="chip">'+n+'</span>'}).join('');
    if(kit.innerHTML!==want)kit.innerHTML=want;
  });
  syncAbil();
}
function syncBars(){
  ORDER.forEach(function(k){
    var h=S.h[k], f=$('fr_'+k); if(!f)return;
    /* a class swap mid-run renames the frame */
    var nmEl=f.querySelector('.nm');
    if(nmEl.firstChild.nodeValue!==h.role.name){nmEl.firstChild.nodeValue=h.role.name;nmEl.style.color=h.role.col;f.style.borderLeftColor=h.role.col;syncAbil()}
    var bars=f.querySelectorAll('.bar');
    var pct=h.down?0:Math.max(0,h.hp/h.hpMax);
    bars[0].querySelector('i').style.width=(pct*100)+'%';
    bars[0].querySelector('i').style.background=h.down?'#4A2020':(pct<0.3?'#D9463E':pct<0.6?'#D9A13E':COL.hp);
    bars[0].querySelector('b').textContent=h.down?('DOWN'+(h.rez>0?' '+Math.ceil(2.4-h.rez)+'s':'')):(Math.ceil(h.hp)+' / '+Math.round(h.hpMax));
    if(bars[1]){bars[1].querySelector('i').style.width=(h.mp/h.mpMax*100)+'%';
      bars[1].querySelector('b').textContent=Math.round(h.mp)}
  });
  /* the top strip is the boss enrage timer, or the key channel while it runs */
  var frac=S.boss?clamp(S.bossT/48,0,1):(S.gateOpen?clamp(S.keyT/2,0,1):0);
  $('enrage').firstElementChild.style.width=(frac*100)+'%';
  syncObjective();
  if(S.boss){$('bosshp').querySelector('i').style.width=Math.max(0,S.boss.hp/S.boss.hpMax*100)+'%'}
  var h=S.h[S.ctrl];
  $('abilCool').style.height=(h.abil/h.abilCd*100)+'%';
  $('abilBox').classList.toggle('rdy',h.abil<=0);
}
var lastKeys=-1,lastTier=-1;
function syncObjective(){
  if(S.keys!==lastKeys){lastKeys=S.keys;
    var ks=$('keySockets').children; for(var i=0;i<ks.length;i++)ks[i].classList.toggle('on',i<S.keys)}
  if(S.hordeTier!==lastTier){lastTier=S.hordeTier;
    var hb=$('horde'), segs=hb.querySelectorAll('b');
    for(var j=0;j<segs.length;j++)segs[j].classList.toggle('on',j<S.hordeTier);
    hb.classList.toggle('max',S.hordeTier>=4)}
}
function syncAbil(){
  if(!S)return; var h=S.h[S.ctrl];
  $('abilNm').textContent=h.role.abil;
  $('abilBox').style.borderColor=h.abil<=0?COL.gold:'';
}
function syncXp(){
  $('xpLvl').textContent=S.lvl;
  $('xpNum').textContent=Math.floor(S.xp)+'/'+S.xpNeed;
  $('xpFill').style.width=(S.xp/S.xpNeed*100)+'%';
}

var myRole='tank', myCls='ranger';

/* the seat pick: three cards, and a fourth once the Shade has been found */
function buildRolePick(){
  $('rolePick').innerHTML='';
  var cards=ORDER.map(function(k){return {k:k,R:ROLES[k],cls:k==='dps'?'ranger':null}});
  if(shadeUnlocked())cards.push({k:'dps',R:CLASSES.rogue,cls:'rogue'});
  cards.forEach(function(c){
    var R=c.R;
    var b=document.createElement('button');
    b.className='rolepick'+(c.cls==='rogue'?' secret':''); b.style.borderTopColor=R.col;
    b.innerHTML='<div class="hd"><div class="nm" style="color:'+R.col+'">'+R.name+'</div>'+
      '<div class="tag" style="margin-left:auto">'+R.label+'</div></div>'+
      '<ul><li>'+R.blurb.join('</li><li>')+'</li></ul>';
    b.onclick=function(){ myRole=c.k; myCls=c.cls||'ranger'; startRun(); };
    $('rolePick').appendChild(b);
  });
  $('rolePick').classList.toggle('four',cards.length===4);
}
function statRow(h){
  var pct=function(v,base){return Math.round((v/base-1)*100)};
  var out=[];
  out.push(['DMG',Math.round(h.dmg)]);
  out.push(['SPD',(1/h.atkCd).toFixed(2)+'/s']);
  out.push(['HP',Math.round(h.hpMax)]);
  out.push(['ARM',Math.round((1-h.dr)*100)+'%']);
  out.push(['MOV',Math.round(h.speed)]);
  out.push(['THREAT',Math.round(h.threatMul*100)+'%']);
  if(h.crit>0.051)out.push(['CRIT',Math.round(h.crit*100)+'%']);
  if(h.critMul>0)out.push(['CDMG',Math.round((2+h.critMul)*100)+'%']);
  if(h.thorns>0)out.push(['REFL',Math.round(h.thorns*100)+'%']);
  if(h.flags.lifesteal||h.lifesteal>0)out.push(['LEECH',Math.round(h.lifesteal*100)+'%']);
  if(h.key==='heal'){out.push(['HEAL',Math.round(h.healPow*100)+'%']);
    out.push(['COST',Math.round(h.cost)]);out.push(['REGEN',Math.round(h.mpRegen)+'/s'])}
  if(h.key==='dps'&&h.shots>1)out.push(['ARROWS',Math.round(h.shots)]);
  if(h.pierce>0)out.push(['PIERCE',Math.round(h.pierce)]);
  return out.map(function(r){return '<span><b>'+r[0]+'</b>'+r[1]+'</span>'}).join('');
}
function buildGearSheet(){
  if(!S)return;
  var wrap=$('gearBody'); wrap.innerHTML='';
  ORDER.forEach(function(k){
    var h=S.h[k];
    var col=document.createElement('div');
    col.className='gearcol'; col.style.borderTopColor=h.role.col;
    var rows=SLOTS.map(function(sl){
      var it=h.gear[sl];
      if(!it)return '<div class="gslot empty"><span class="sl">'+SLOT_NAME[sl]+'</span>'+
        '<span class="iv">\u2014</span></div>';
      var lines=[it.t].concat(affixLines(it));
      return '<div class="gslot"><span class="sl">'+SLOT_NAME[sl]+'</span>'+
        '<span class="iv" style="color:'+qualityCol(it)+'">'+fullName(it)+'</span>'+
        '<span class="gb">'+it.build+'</span>'+
        '<span class="gt">'+lines.join('<br>')+'</span></div>';
    }).join('');
    col.innerHTML='<div class="gh" style="color:'+h.role.col+'">'+h.role.name+
      '<small>'+h.role.label+'</small></div>'+
      '<div class="gstats">'+statRow(h)+'</div>'+rows;
    wrap.appendChild(col);
  });
  /* relics are party-wide, so they get one row under the three columns */
  var held=relicSummary(), rl=document.createElement('div'); rl.className='grelics';
  rl.innerHTML=held.length?held.map(function(r){
    return '<span class="rl'+(r.kind==='curse'?' curse':'')+'">'+r.n+(r.count>1?' x'+r.count:'')+'</span>'}).join('')
    :'<span class="rl" style="color:var(--ink3)">No relics yet — find a chest</span>';
  wrap.appendChild(rl);
}
function toggleGear(force){
  var v=$('vGear');
  var show=force==null? v.hidden : force;
  if(show){ buildGearSheet(); v.hidden=false; } else v.hidden=true;
  sfx('click');
}
function syncMute(){
  var b=$('btnMute');
  if(b){b.textContent=audioMuted()?'Sound off':'Sound on';b.classList.toggle('off',audioMuted())}
  var m=document.querySelector('.mixer');
  if(m)m.classList.toggle('off',audioMuted());
}
function bindMixer(){
  [['volMusic','music'],['volSfx','sfx']].forEach(function(pair){
    var el=$(pair[0]), which=pair[1];
    if(!el)return;
    el.value=Math.round(getVolume(which)*100);
    el.addEventListener('input',function(){
      audioInit();
      setVolume(which,el.value/100);
      /* hear what you just set */
      if(which==='sfx')sfx('click',{gap:0.08});
    });
  });
}

/* Real fullscreen on top of the window-filling layout. Safari on the Mac still
   wants the prefixed call. */
function fullscreenOn(){ return !!(document.fullscreenElement||document.webkitFullscreenElement) }
function toggleFullscreen(){
  var el=document.documentElement;
  if(fullscreenOn()){ (document.exitFullscreen||document.webkitExitFullscreen).call(document) }
  else { var req=el.requestFullscreen||el.webkitRequestFullscreen; if(req)req.call(el) }
}
function syncFullscreen(){
  var on=fullscreenOn();
  ['btnFull','btnFullMenu'].forEach(function(id){var b=$(id); if(b)b.innerHTML=(on?'Exit fullscreen':'Fullscreen')+(id==='btnFull'?' <b>F</b>':'')});
}
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('webkitfullscreenchange',syncFullscreen);

/* a guest's pause is a settings sheet over a game that keeps going */
function openPause(){
  if(isGuest()){ var v=$('vPause'); v.hidden=!v.hidden; syncMute(); return }
  if(mode!=='play')return; setMode('paused'); syncMute(); $('vPause').hidden=false;
}
function closePause(){
  if(isGuest()){ $('vPause').hidden=true; return }
  if(mode!=='paused')return; $('vPause').hidden=true; setMode('play');
}
function quitToMenu(){
  if(isHost()){ toLobby(); sfx('click'); return }
  if(isGuest()){ leaveRoom(); return }
  musicBoss(false); musicStop();
  ['vPause','vLevel','vLoot','vOver','vGear','vRelic','vHold'].forEach(function(id){$(id).hidden=true});
  buildRolePick(); $('vMenu').hidden=false; setMode('menu'); sfx('click');
}

function startRun(){
  audioInit(); musicStart();
  newGame(myRole,null,{dps:myCls}); rt.pendingLevels=0; resetRun();
  ['vMenu','vLevel','vLoot','vOver','vPause','vTrophies'].forEach(function(id){$(id).hidden=true});
  $('sKills').textContent='0';
  buildFrames(); startStage(0); syncXp(); syncFrames(); syncAbil();
  setMode('play');
}
$('btnPull').onclick=function(){ startRun() };
$('btnAgain').onclick=function(){ if(isSolo())startRun(); else onlineAgain() };
$('btnRole').onclick=function(){ if(!isSolo()){onlineSeats();return} $('vOver').hidden=true; buildRolePick(); $('vMenu').hidden=false; setMode('menu') };
$('btnResume').onclick=function(){ closePause() };
$('btnPause').onclick=function(){ openPause() };
$('btnQuit').onclick=function(){ quitToMenu() };
$('btnGear').onclick=function(){ toggleGear() };
$('btnPauseGear').onclick=function(){ toggleGear() };
$('btnGearClose').onclick=function(){ toggleGear(false) };
$('btnMute').onclick=function(){ audioToggle(); syncMute() };
$('btnFull').onclick=function(){ toggleFullscreen() };
$('btnFullMenu').onclick=function(){ toggleFullscreen() };
$('btnTrophies').onclick=function(){ buildTrophies(); $('vTrophies').hidden=false; sfx('click') };
$('btnTrophiesClose').onclick=function(){ $('vTrophies').hidden=true; sfx('click') };
syncFullscreen();
bindMixer();
syncMute();
try{ if(localStorage.getItem('wipecheck.cleared')==='1')document.body.classList.add('cleared') }catch(e){}

export { buildFrames, syncFrames, syncBars, syncAbil, syncXp, buildRolePick, startRun, localOwner, roleOf,
         myRole, statRow, buildGearSheet, toggleGear, syncMute, bindMixer,
         toggleFullscreen, openPause, closePause, quitToMenu };
