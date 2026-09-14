/**
 * One frame. The world is larger than the screen, so everything in world
 * space is drawn under a camera translate and culled to the view; the
 * vignette, haze and dust are screen-space and drawn after.
 */

import { blit, blitSquash, glow, motes, shadow } from './atlas.js';
import { HERODRAW } from './rigs-heroes.js';
import { WALLFIRE, bgCv, vignetteCv, braziers, drawProp, propShadow, props } from './room.js';
import { clearAll, g, setWorld } from '../canvas.js';
import { COL, GATE, H, ORDER, PI, STAGEART, TAU, W, WALLY, WORLD_W, WORLD_H } from '../config.js';
import { relic } from '../relics.js';
import { GATE_R, KEY_TIME } from '../objective.js';
import { S, rt } from '../state.js';
import { SEC } from '../secret.js';
import { clamp, hexA, rr } from '../util.js';

/* view rect in world space, refreshed each frame */
var VX=0, VY=0;
/* dev-only: ?dev=1&off=light,shadow,vig,decal,floats,fx,scene lets the profiler skip passes */
var OFF={}; try{(new URLSearchParams(location.search).get('off')||'').split(',').forEach(function(k){if(k)OFF[k]=1})}catch(e){}
function inView(x,y,m){ return x>VX-m && x<VX+W+m && y>VY-m && y<VY+H+m; }

function render(){
  clearAll();setWorld();
  /* the canvas may be any shape now (it fills the window); the game is drawn
     inside its 16:9 frame and nothing leaks into the letterbox */
  g.save();g.beginPath();g.rect(0,0,W,H);g.clip();
  var P=STAGEART[S?S.stage:0];
  var cam=S?S.cam:{x:WORLD_W/2,y:WORLD_H/2};
  VX=cam.x-W/2; VY=cam.y-H/2;

  g.save();
  g.translate(-VX,-VY);

  /* ---- floor: only the visible window of the baked room ---- */
  if(bgCv){
    var sx=clamp(VX-8,0,WORLD_W-W-1), sy=clamp(VY-8,0,WORLD_H-H-1);
    var sw=Math.min(W+16,WORLD_W-sx), sh=Math.min(H+16,WORLD_H-sy);
    g.drawImage(bgCv,sx,sy,sw,sh,sx,sy,sw,sh);
  } else {g.fillStyle='#12140F';g.fillRect(VX,VY,W,H)}
  if(!S){g.restore();drawScreenLayer(P);g.restore();return}
  var i,e;

  /* ---- light shaft from the gate ---- */
  if(!OFF.decal&&inView(GATE.x,WALLY+80,220)){
    g.globalCompositeOperation='lighter';
    var pulse=0.82+Math.sin(S.elapsed*1.6)*0.08;
    var lsg=g.createLinearGradient(GATE.x,WALLY-30,GATE.x,WALLY+180);
    lsg.addColorStop(0,hexA(P.light,0.16*pulse));lsg.addColorStop(1,hexA(P.light,0));
    g.fillStyle=lsg;
    g.beginPath();g.moveTo(GATE.x-40,WALLY-30);g.lineTo(GATE.x+40,WALLY-30);
    g.lineTo(GATE.x+96,WALLY+180);g.lineTo(GATE.x-96,WALLY+180);g.closePath();g.fill();
    g.globalCompositeOperation='source-over';
  }

  /* ---- ground decals ---- */
  var tk=S.h.tank;
  if(!OFF.decal&&!tk.down&&inView(tk.x,tk.y,tk.taunt)){
    g.strokeStyle=hexA(COL.tank,0.16);g.lineWidth=2;g.setLineDash([9,11]);
    g.lineDashOffset=-S.elapsed*14;
    g.save();g.translate(tk.x,tk.y);g.scale(1,0.52);
    g.beginPath();g.arc(0,0,tk.taunt,0,TAU);g.stroke();g.restore();
    g.setLineDash([]);g.lineDashOffset=0;
  }
  if(S.boss&&S.boss.slam>0){
    var sp2=1-S.boss.slam/1.15;
    g.save();g.translate(S.boss.slamX,S.boss.slamY);g.scale(1,0.55);
    g.fillStyle=hexA('#D9463E',0.09+sp2*0.22);
    g.beginPath();g.arc(0,0,130,0,TAU);g.fill();
    g.strokeStyle=hexA('#FF6A5E',0.9);g.lineWidth=3;
    g.beginPath();g.arc(0,0,130*sp2,0,TAU);g.stroke();
    g.strokeStyle=hexA('#FF6A5E',0.3);g.lineWidth=1.6;
    g.beginPath();g.arc(0,0,130,0,TAU);g.stroke();g.restore();
  }
  for(i=0;i<S.fx.length;i++){var o=S.fx[i],kk=o.t/o.life;
    if(o.ring&&inView(o.x,o.y,o.r0)){g.save();g.translate(o.x,o.y);g.scale(1,0.55);
      g.strokeStyle=o.col;g.globalAlpha=(1-kk)*0.85;g.lineWidth=4*(1-kk*0.6);
      g.beginPath();g.arc(0,0,o.r0*(0.35+kk*0.9),0,TAU);g.stroke();
      g.globalAlpha=1;g.restore()}}

  /* ---- key fragments: floor glyphs and the open gate ---- */
  drawObjectiveFloor(P);
  /* ---- the hidden alcove, once its wall has moved ---- */
  drawSecret(P);

  /* ---- shadows ---- */
  var near=[];
  if(!OFF.shadow){
  for(i=0;i<props.length;i++)if(inView(props[i].x,props[i].y,200))near.push(props[i]);
  for(i=0;i<near.length;i++)propShadow(near[i]);
  for(i=0;i<S.corpses.length;i++){var cp=S.corpses[i];
    if(inView(cp.x,cp.y,80))shadow(cp.x,cp.y,cp.r*(1-cp.t/cp.dur*0.5)/(1+(cp.z||0)/90))}
  for(i=0;i<S.enemies.length;i++){e=S.enemies[i];if(inView(e.x,e.y,80))shadow(e.x,e.y,e.r/(1+(e.z||0)/90))}
  for(i=0;i<S.chests.length;i++){var cs=S.chests[i];if(inView(cs.x,cs.y,60))shadow(cs.x,cs.y+2,18/(1+(cs.z||0)/90))}
  for(i=0;i<S.gems.length;i++){var gs=S.gems[i];if((gs.z||0)>2&&inView(gs.x,gs.y,20))shadow(gs.x,gs.y,4/(1+gs.z/60))}
  ORDER.forEach(function(k2){var h=S.h[k2];shadow(h.x,h.y,h.r*(h.down?0.8:1)/(1+(h.z||0)/90))});

  } else { for(i=0;i<props.length;i++)if(inView(props[i].x,props[i].y,200))near.push(props[i]); }
  /* ---- depth-sorted scene ---- */
  var cast=[];
  for(i=0;i<near.length;i++)cast.push({y:near[i].y,kind:'prop',o:near[i]});
  for(i=0;i<S.corpses.length;i++){var c0=S.corpses[i];
    if(inView(c0.x,c0.y,80))cast.push({y:c0.y-1,kind:'corpse',o:c0})}
  for(i=0;i<S.enemies.length;i++){e=S.enemies[i];
    if(inView(e.x,e.y,120))cast.push({y:e.y,kind:'enemy',o:e})}
  for(i=0;i<S.chests.length;i++){var ch=S.chests[i];
    if(inView(ch.x,ch.y,60))cast.push({y:ch.y,kind:'chest',o:ch})}
  for(i=0;i<(S.frags||[]).length;i++){var fg=S.frags[i];
    if(!fg.taken&&!fg.carrier&&inView(fg.x,fg.y,80))cast.push({y:fg.y,kind:'frag',o:fg})}
  cast.sort(function(a,b){return a.y-b.y});
  var heroCast=ORDER.map(function(k3){return S.h[k3]}).sort(function(a,b){return a.y-b.y});
  for(i=0;i<heroCast.length;i++)cast.push({kind:'hero',o:heroCast[i]});

  if(!OFF.scene)for(i=0;i<cast.length;i++){
    var it=cast[i],a=it.o;
    if(it.kind==='prop')drawProp(a);
    else if(it.kind==='corpse'){
      var fr=8+Math.min(4,Math.floor(a.t/a.dur*5));
      blitSquash(a.art,fr,a.x,a.y+a.r*0.5-(a.z||0),a.face,1-Math.pow(a.t/a.dur,2)*0.85,false,1,1,a.rot||0);
    } else if(it.kind==='enemy'){
      var esc=a.scale||1;
      blitSquash(a.art,Math.floor(a.ph)%8,a.x,a.y+a.r*0.5-(a.z||0),a.face,1,a.flash>0.35,(a.sqx||1)*esc,(a.sqy||1)*esc,a.rot||0);
      if(a.champion){
        drawShard(a.x,a.y-a.r*2.2-14-Math.sin(S.elapsed*2.5)*3,0.8,S.elapsed);
        var bw=64,by=a.y-a.r*2.2-2;
        g.fillStyle='rgba(6,8,13,.8)';g.fillRect(a.x-bw/2-1,by-1,bw+2,7);
        g.fillStyle='#D9463E';g.fillRect(a.x-bw/2,by,bw*Math.max(0,a.hp/a.hpMax),5);
        g.textAlign='center';g.font='700 10px "Barlow Semi Condensed",sans-serif';
        g.lineWidth=3;g.strokeStyle='rgba(4,5,8,0.9)';g.strokeText(a.name,a.x,by-5);
        g.fillStyle='#E8C46A';g.fillText(a.name,a.x,by-5);
      }
    } else if(it.kind==='chest')drawChest(a);
    else if(it.kind==='frag')drawShard(a.x,a.y-22-Math.sin(a.t*2.2)*5,1,a.t);
    else drawHeroActor(a);
  }

  /* ---- projectiles ---- */
  for(i=0;i<S.ebullets.length;i++){var q=S.ebullets[i];
    if(!inView(q.x,q.y,20))continue;
    var qy=q.y-12;   // bolts float at chest height
    g.strokeStyle=hexA('#E07AF0',0.45);g.lineWidth=q.r*2.2;g.lineCap='round';
    g.beginPath();g.moveTo(q.x,qy);g.lineTo(q.x-Math.cos(q.a)*9,qy-Math.sin(q.a)*9);g.stroke();
    g.fillStyle='#F7D8FF';g.beginPath();g.arc(q.x,qy,q.r*0.6,0,TAU);g.fill()}
  for(i=0;i<S.bullets.length;i++){var p=S.bullets[i];
    if(!inView(p.x,p.y,30))continue;
    var pz=p.z||0, py=p.y-pz;
    if(p.stuck){
      /* a miss: the shaft stands in the flagstones for a moment */
      var sa=clamp(1-(p.t-p.stuckAt)/p.life,0,1);
      g.globalAlpha=sa;g.strokeStyle='#EFE6C8';g.lineWidth=1.4;g.lineCap='round';
      g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x-Math.cos(p.a)*10,p.y-8-Math.sin(p.a)*4);g.stroke();
      g.globalAlpha=1;continue;
    }
    var L=p.crit?21:16, ty=pz>2?Math.sin(p.a)*L*0.7:Math.sin(p.a)*L;
    g.strokeStyle=hexA(p.col,0.30);g.lineWidth=p.crit?5:3.2;g.lineCap='round';
    g.beginPath();g.moveTo(p.x,py);g.lineTo(p.x-Math.cos(p.a)*L,py-ty+(p.vz<0?-2:2));g.stroke();
    g.strokeStyle=p.crit?'#FFF3C4':'#EFE6C8';g.lineWidth=p.crit?2:1.3;
    g.beginPath();g.moveTo(p.x,py);g.lineTo(p.x-Math.cos(p.a)*L*0.85,py-ty*0.85);g.stroke()}

  /* ---- gems ---- */
  for(i=0;i<S.gems.length;i++){var gm=S.gems[i];
    if(!inView(gm.x,gm.y,12))continue;
    var pu=Math.sin(S.elapsed*6+gm.x*0.1)*0.9+(gm.z||0);
    g.fillStyle='#7A4AC0';
    g.beginPath();g.moveTo(gm.x,gm.y-5-pu);g.lineTo(gm.x+3.4,gm.y-pu);
    g.lineTo(gm.x,gm.y+5-pu);g.lineTo(gm.x-3.4,gm.y-pu);g.closePath();g.fill();
    g.fillStyle='#C9A0FF';
    g.beginPath();g.moveTo(gm.x-0.8,gm.y-4.4-pu);g.lineTo(gm.x+1.4,gm.y-0.6-pu);
    g.lineTo(gm.x-0.8,gm.y+1-pu);g.lineTo(gm.x-2.4,gm.y-0.6-pu);g.closePath();g.fill()}

  /* ---- overhead fx ---- */
  if(!OFF.fx)for(i=0;i<S.fx.length;i++){var o2=S.fx[i],u=o2.t/o2.life;
    if(!inView(o2.x,o2.y,(o2.r0||0)+40))continue;
    if(o2.p){g.fillStyle=o2.col;g.globalAlpha=1-u;
      var sz=2.8*(1-u*0.5);g.fillRect(o2.x-sz/2,o2.y-sz/2,sz,sz);g.globalAlpha=1}
    else if(o2.beam){g.strokeStyle=o2.col;g.globalAlpha=(1-u)*0.9;g.lineWidth=4*(1-u*0.5);g.lineCap='round';
      g.beginPath();g.moveTo(o2.x,o2.y);
      g.quadraticCurveTo((o2.x+o2.x2)/2,(o2.y+o2.y2)/2-36,o2.x2,o2.y2);g.stroke();g.globalAlpha=1}
    else if(o2.arc){g.strokeStyle=o2.col;g.globalAlpha=(1-u)*0.75;g.lineWidth=9*(1-u*0.7);g.lineCap='round';
      g.beginPath();g.arc(o2.x,o2.y,o2.rad*(0.62+u*0.22),o2.a-o2.sp*(0.5+u*0.6),o2.a+o2.sp*(0.5+u*0.6));
      g.stroke();g.globalAlpha=1}
    else if(!o2.ring){g.strokeStyle=o2.col;g.globalAlpha=1-u;g.lineWidth=3.4*(1-u*0.6);
      g.beginPath();g.arc(o2.x,o2.y,o2.r0*(0.4+u*0.8),0,TAU);g.stroke();g.globalAlpha=1}}

  /* ---- light pass ---- */
  if(!OFF.light){
  g.globalCompositeOperation='lighter';
  for(i=0;i<WALLFIRE.length;i++){var t2=WALLFIRE[i];
    if(t2.lit===false||!inView(t2.x,t2.y,240))continue;
    var fk=0.84+Math.sin(S.elapsed*7.3+i*2.1)*0.10+Math.sin(S.elapsed*19+i*0.7)*0.06;
    glow(P.light,t2.x,t2.y,200*fk,0.55)}
  for(i=0;i<braziers.length;i++){var bz=braziers[i];
    if(!inView(bz.x,bz.y,220))continue;
    var bk=0.86+Math.sin(S.elapsed*8.1+i*1.7)*0.11+Math.sin(S.elapsed*21+i)*0.05;
    glow(P.light,bz.x,bz.y,178*bk,0.62)}
  ORDER.forEach(function(k4){var h=S.h[k4];if(h.down)return;
    glow(h.role.col,h.x,h.y-10,74,S.ctrl===k4?0.85:0.58)});
  for(i=0;i<S.bullets.length;i++)if(inView(S.bullets[i].x,S.bullets[i].y,20))glow(S.bullets[i].col,S.bullets[i].x,S.bullets[i].y,16,0.5);
  for(i=0;i<S.ebullets.length;i++)if(inView(S.ebullets[i].x,S.ebullets[i].y,20))glow('#E07AF0',S.ebullets[i].x,S.ebullets[i].y,17,0.5);
  for(i=0;i<S.gems.length;i++)if(inView(S.gems[i].x,S.gems[i].y,16))glow('#A35FF0',S.gems[i].x,S.gems[i].y,13,0.45);
  for(i=0;i<(S.frags||[]).length;i++){var fl=S.frags[i];if(fl.taken||fl.carrier||!inView(fl.x,fl.y,160))continue;
    glow(COL.gold,fl.x,fl.y-30,150*(0.8+0.2*Math.sin(fl.t*2.2)),0.6)}
  if(S.gateOpen&&inView(GATE.x,GATE.y,300))glow(S.keyTurned?COL.hostile:COL.gold,GATE.x,GATE.y+30,260*(0.85+0.15*Math.sin(S.elapsed*4)),0.7);
  if(SEC.active&&SEC.open>0&&SEC.prisoner&&inView(SEC.prisoner.x,SEC.prisoner.y,260))glow(SEC.freed?'#8A6AC0':COL.rogue,SEC.prisoner.x,SEC.prisoner.y-10,150*SEC.open*(0.8+0.2*Math.sin(S.elapsed*3.1)),0.5);
  for(i=0;i<S.chests.length;i++){var cg=S.chests[i];if(!inView(cg.x,cg.y,140))continue;
    var pul=0.7+0.3*Math.sin(S.elapsed*3.2+cg.x*0.01);
    glow(COL.gold,cg.x,cg.y-8,120*pul,0.55)}
  for(i=0;i<S.fx.length;i++){var o3=S.fx[i];
    if(!o3.p&&!o3.beam&&!o3.arc&&inView(o3.x,o3.y,o3.r0))glow(o3.col,o3.x,o3.y,o3.r0*(0.4+o3.t/o3.life*0.8),(1-o3.t/o3.life)*0.5)}
  g.globalCompositeOperation='source-over';
  }

  /* ---- flames (and the sconces that hold them; one of them may be dark) ---- */
  for(i=0;i<WALLFIRE.length;i++){var tf=WALLFIRE[i]; if(!inView(tf.x,tf.y,40))continue;
    sconce(tf.x,tf.y+4,tf.lit===false);
    if(tf.lit!==false)flame(P,tf.x,tf.y+4,1.2,i)}
  for(i=0;i<braziers.length;i++)if(inView(braziers[i].x,braziers[i].y,40))flame(P,braziers[i].x,braziers[i].y+2,1.5,i+7);

  /* ---- markers + text (world space) ---- */
  ORDER.forEach(function(k5){var h=S.h[k5];
    if(h.down){
      g.strokeStyle='rgba(200,208,224,0.42)';g.lineWidth=1.6;g.setLineDash([3,4]);
      g.beginPath();g.arc(h.x,h.y,h.r+3,0,TAU);g.stroke();g.setLineDash([]);
      if(h.rez>0){g.strokeStyle=COL.heal;g.lineWidth=3;
        g.beginPath();g.arc(h.x,h.y,h.r+9,-PI/2,-PI/2+TAU*(h.rez/2.4));g.stroke()}
    } else if(S.ctrl===k5){
      g.strokeStyle=hexA(COL.gold,0.8);g.lineWidth=2;g.setLineDash([6,7]);
      g.lineDashOffset=-S.elapsed*22;
      g.save();g.translate(h.x,h.y+h.r*0.45);g.scale(1,0.4);
      g.beginPath();g.arc(0,0,h.r+10,0,TAU);g.stroke();g.restore();
      g.setLineDash([]);g.lineDashOffset=0;
    }
  });
  if(S.gateOpen&&!S.keyTurned&&S.keyT>0&&S.keyChanneller){var kc=S.keyChanneller;
    g.strokeStyle=COL.gold;g.lineWidth=3.5;
    g.beginPath();g.arc(kc.x,kc.y-(kc.z||0),kc.r+11,-PI/2,-PI/2+TAU*clamp(S.keyT/KEY_TIME,0,1));g.stroke();
    g.strokeStyle=hexA(COL.gold,0.25);g.lineWidth=1.5;g.beginPath();g.arc(kc.x,kc.y,kc.r+11,0,TAU);g.stroke()}
  g.textAlign='center';
  if(!OFF.floats)for(i=0;i<S.floats.length;i++){var ft=S.floats[i];
    if(!inView(ft.x,ft.y,80))continue;
    var al=clamp(1-(ft.t-0.45)/0.4,0,1);
    /* big numbers land: overshoot then settle in the first 180ms */
    var pop=ft.big?1+0.55*Math.max(0,1-ft.t/0.18)*Math.cos(ft.t/0.18*1.8):1;
    g.globalAlpha=al;
    g.save();g.translate(ft.x,ft.y);g.scale(pop,pop);
    g.font=(ft.big?'800 20px':'600 14px')+' "Barlow Semi Condensed",sans-serif';
    g.lineWidth=ft.big?4:3.4;g.strokeStyle='rgba(4,5,8,0.9)';g.strokeText(ft.txt,0,0);
    g.fillStyle=ft.col;g.fillText(ft.txt,0,0);g.restore();g.globalAlpha=1}

  g.restore();
  drawScreenLayer(P);
  drawOffscreenArrows();
  g.restore();
}

/* an iron wall bracket with a torch in it; unlit, the head is charred */
function sconce(x,y,dark){
  g.fillStyle='#2A2724';g.fillRect(x-1.6,y+2,3.2,13);
  g.fillStyle='#4A4640';g.beginPath();g.moveTo(x-5,y+15);g.lineTo(x+5,y+15);g.lineTo(x+2.4,y+9);g.lineTo(x-2.4,y+9);g.closePath();g.fill();
  g.fillStyle='#3B2E22';g.fillRect(x-1.2,y-4,2.4,7);
  if(dark){g.fillStyle='#161311';g.beginPath();g.ellipse(x,y-4,3.2,3.6,0,0,TAU);g.fill();
    g.fillStyle='#2B2622';g.beginPath();g.ellipse(x-0.8,y-5,1.4,1.6,0,0,TAU);g.fill()}
  else{g.fillStyle='#5A4634';g.beginPath();g.ellipse(x,y-3,3,3.2,0,0,TAU);g.fill()}
}
/* the alcove behind the wall: a slab slides aside from the torch's side */
function drawSecret(P){
  if(!SEC.active||SEC.open<=0||!SEC.box)return;
  var b=SEC.box, top=b.top, wdt=(b.x1-b.x0)*SEC.open;
  if(!inView(b.x0,WALLY,400))return;
  g.save();g.beginPath();g.rect(b.x0,top-8,wdt,WALLY-top+8);g.clip();
  /* the dark beyond, floor rising toward the mouth */
  var gg=g.createLinearGradient(0,top-8,0,WALLY);
  gg.addColorStop(0,'#000');gg.addColorStop(0.35,'#06060A');gg.addColorStop(0.7,P.fD);gg.addColorStop(1,P.fB);
  g.fillStyle=gg;g.fillRect(b.x0,top-8,b.x1-b.x0,WALLY-top+8);
  /* flagstone seams inside */
  g.strokeStyle='rgba(0,0,0,0.35)';g.lineWidth=1;
  for(var yy=top+26;yy<WALLY;yy+=18){g.beginPath();g.moveTo(b.x0,yy);g.lineTo(b.x1,yy);g.stroke()}
  for(var xx=b.x0+30;xx<b.x1;xx+=44){g.beginPath();g.moveTo(xx,top+26);g.lineTo(xx+8,WALLY);g.stroke()}
  /* side walls of the cut, in shadow */
  var sw=g.createLinearGradient(b.x0,0,b.x0+26,0);sw.addColorStop(0,'rgba(0,0,0,0.75)');sw.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=sw;g.fillRect(b.x0,top-8,26,WALLY-top+8);
  var sw2=g.createLinearGradient(b.x1,0,b.x1-26,0);sw2.addColorStop(0,'rgba(0,0,0,0.75)');sw2.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=sw2;g.fillRect(b.x1-26,top-8,26,WALLY-top+8);
  /* the shackles on the back wall, and the Shade in them */
  if(!SEC.freed&&SEC.prisoner){
    var pr=SEC.prisoner;
    g.strokeStyle='#5A5652';g.lineWidth=2.2;g.setLineDash([3,2.4]);
    g.beginPath();g.moveTo(pr.x-34,top+4);g.quadraticCurveTo(pr.x-24,top+22,pr.x-9,pr.y-22);g.stroke();
    g.beginPath();g.moveTo(pr.x+34,top+4);g.quadraticCurveTo(pr.x+24,top+22,pr.x+9,pr.y-22);g.stroke();
    g.setLineDash([]);
    g.fillStyle='#3A3734';g.fillRect(pr.x-38,top+1,8,5);g.fillRect(pr.x+30,top+1,8,5);
    var fake={key:'dps',cls:'rogue',x:pr.x,y:pr.y,r:12,vx:0,vy:0,speed:168,phase:0,swing:0,swingDur:0.16,atk:1,atkCd:1,face:1,hitFlash:0,down:false,z:0,sqx:1,sqy:1,dash:null};
    g.globalAlpha=0.92;drawHeroActor(fake);g.globalAlpha=1;
    /* the grey of a long time in the dark */
    g.fillStyle='rgba(20,16,30,0.35)';g.fillRect(pr.x-18,pr.y-42,36,50);
  }
  g.restore();
  /* the lintel and the slab's leading edge */
  g.fillStyle='#1B1916';g.fillRect(b.x0-4,top-12,wdt+4,6);
  g.fillStyle='rgba(255,255,255,0.06)';g.fillRect(b.x0-4,top-12,wdt+4,1.2);
  if(SEC.open<1){g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(b.x0+wdt-2,top-12,4,WALLY-top+12)}
}
function flame(P,x,y,sc,i2){
  var f=0.84+Math.sin(S.elapsed*9+i2*3)*0.16;
  g.fillStyle=hexA(P.light,0.92);
  g.beginPath();g.moveTo(x,y-11*sc*f);
  g.quadraticCurveTo(x+4.6*sc,y-1.4*sc,x,y+3.4*sc);
  g.quadraticCurveTo(x-4.6*sc,y-1.4*sc,x,y-11*sc*f);g.fill();
  g.fillStyle='#FFF4DA';
  g.beginPath();g.ellipse(x,y-1.6*sc,1.7*sc,3*sc*f,0,0,TAU);g.fill();
}

/* dust and vignette ride with the camera, so they are drawn in screen space */
function drawScreenLayer(P){
  var t=S?S.elapsed:0;
  for(var i=0;i<motes.length;i++){var m=motes[i];
    g.fillStyle=hexA(P.mote,m.a*(0.5+0.5*Math.sin(t*2+m.x)));
    g.fillRect(m.x,m.y,m.s,m.s)}
  if(vignetteCv&&!OFF.vig)g.drawImage(vignetteCv,0,0,W,H);
  /* Long Night: the vignette closes in -- a second, tighter pass */
  if(S&&relic('night')){
    var rg=g.createRadialGradient(W/2,H/2,H*0.22,W/2,H/2,H*0.78);
    rg.addColorStop(0,'rgba(3,4,8,0)');rg.addColorStop(1,'rgba(3,4,8,0.78)');
    g.fillStyle=rg;g.fillRect(0,0,W,H);
  }
  /* Stillness: a cold wash while everything hostile is stopped */
  if(S&&S.frozenT>0){g.fillStyle='rgba(150,200,255,'+(0.10*Math.min(1,S.frozenT/0.4))+')';g.fillRect(0,0,W,H)}
}

/* a key shard: a broken gold key bit, turning slowly, lit from within */
function drawShard(x,y,sc,t){
  g.save();g.translate(x,y);g.scale(sc,sc);
  var wob=Math.sin(t*1.6)*0.25;
  g.rotate(-0.5+wob);
  g.fillStyle='#8A6A1E';g.fillRect(-3,-16,6,26);
  g.fillStyle='#E8C46A';g.fillRect(-2,-15,4,24);
  g.fillStyle='#FFF1B8';g.fillRect(-1,-14,1.4,22);
  // the bit
  g.fillStyle='#E8C46A';g.fillRect(2,4,7,4);g.fillRect(2,-2,5,4);
  g.fillStyle='#8A6A1E';g.fillRect(2,8,7,1.2);
  // the bow (broken)
  g.strokeStyle='#E8C46A';g.lineWidth=3;g.beginPath();g.arc(0,-18,5,0.4,Math.PI*1.4);g.stroke();
  g.restore();
}
/* floor glyph under each fragment, the beam above it, and the gate once open */
function drawObjectiveFloor(P){
  var fr=S.frags||[];
  for(var i=0;i<fr.length;i++){var f=fr[i];
    if(f.taken||f.carrier||!inView(f.x,f.y,200))continue;
    var pu=0.6+0.4*Math.sin(f.t*2.2);
    g.save();g.translate(f.x,f.y);g.scale(1,0.5);
    g.strokeStyle=hexA(COL.gold,0.35+0.25*pu);g.lineWidth=2;
    g.beginPath();g.arc(0,0,26,0,TAU);g.stroke();
    g.setLineDash([6,9]);g.lineDashOffset=-f.t*20;g.strokeStyle=hexA(COL.gold,0.5);
    g.beginPath();g.arc(0,0,38,0,TAU);g.stroke();g.setLineDash([]);
    g.restore();
    var bg=g.createLinearGradient(f.x,f.y,f.x,f.y-170);
    bg.addColorStop(0,hexA(COL.gold,0.32*pu+0.1));bg.addColorStop(1,hexA(COL.gold,0));
    g.fillStyle=bg;g.fillRect(f.x-9,f.y-170,18,170);
  }
  if(S.gateOpen&&inView(GATE.x,GATE.y,320)){
    var gp=0.7+0.3*Math.sin(S.elapsed*4), col=S.keyTurned?COL.hostile:COL.gold;
    var gg=g.createLinearGradient(GATE.x,GATE.y+40,GATE.x,GATE.y-60);
    gg.addColorStop(0,hexA(col,0.55*gp));gg.addColorStop(1,hexA(col,0));
    g.fillStyle=gg;g.fillRect(GATE.x-46,GATE.y-60,92,100);
    g.save();g.translate(GATE.x,GATE.y+24);g.scale(1,0.5);
    g.strokeStyle=hexA(col,0.7);g.lineWidth=2.5;g.setLineDash([8,10]);g.lineDashOffset=-S.elapsed*30;
    g.beginPath();g.arc(0,0,GATE_R,0,TAU);g.stroke();g.setLineDash([]);
    if(!S.keyTurned){g.strokeStyle=hexA(col,0.22);g.lineWidth=1.5;g.beginPath();g.arc(0,0,130,0,TAU);g.stroke()}
    g.restore();
  }
}

/* a treasure chest: iron-banded oak with a brass lock, breathing gold light */
function drawChest(c){
  var b=0.5+0.5*Math.sin(S.elapsed*3.2+c.x*0.01);
  g.save();g.translate(c.x,c.y-(c.z||0));
  if(c.sqy&&c.sqy!==1)g.scale(c.sqx||1,c.sqy);
  // body
  g.fillStyle='#3A2412';g.fillRect(-17,-8,34,16);
  g.fillStyle='#5A3A1E';g.fillRect(-16,-7,32,13);
  // lid (domed)
  g.fillStyle='#4A2E17';g.beginPath();g.moveTo(-17,-8);g.quadraticCurveTo(0,-20,17,-8);g.closePath();g.fill();
  g.fillStyle='#6A4626';g.beginPath();g.moveTo(-15,-8);g.quadraticCurveTo(0,-17.5,15,-8);g.closePath();g.fill();
  // plank lines
  g.strokeStyle='rgba(20,10,4,0.55)';g.lineWidth=1;
  g.beginPath();g.moveTo(-16,-2);g.lineTo(16,-2);g.moveTo(-16,3);g.lineTo(16,3);g.stroke();
  // iron bands
  g.fillStyle='#2A2C33';g.fillRect(-11,-15,3,23);g.fillRect(8,-15,3,23);
  g.fillStyle='#4A4E5A';g.fillRect(-11,-15,1,23);g.fillRect(8,-15,1,23);
  // brass trim + lock
  g.fillStyle='#C99A3A';g.fillRect(-17,-8,34,2);
  g.fillStyle='#E8C46A';g.fillRect(-3,-6,6,7);
  g.fillStyle='#3A2412';g.fillRect(-1,-3,2,3);
  // light leaking from the seam
  g.globalAlpha=0.35+0.45*b;g.fillStyle='#FFE9A8';g.fillRect(-14,-9,28,1.6);g.globalAlpha=1;
  // motes rising
  for(var i=0;i<3;i++){var ph=(S.elapsed*0.7+i*0.37+c.x*0.001)%1;
    g.globalAlpha=(1-ph)*0.8;g.fillStyle='#FFE9A8';
    g.fillRect(-8+i*8+Math.sin(ph*6+i)*3,-10-ph*26,1.6,1.6)}
  g.globalAlpha=1;g.restore();
}

/* a party member off the edge of the screen gets an arrow so you never lose
   a bot -- the same idea as the off-screen indicators in every twin-stick */
function drawOffscreenArrows(){
  if(!S)return;
  ORDER.forEach(function(k){
    var h=S.h[k]; if(k===S.ctrl)return;
    var dx=h.x-S.cam.x, dy=h.y-S.cam.y;
    if(Math.abs(dx)<W/2-20&&Math.abs(dy)<H/2-20)return;
    var sx=W/2+Math.max(-W/2+26,Math.min(W/2-26,dx));
    var sy=H/2+Math.max(-H/2+26,Math.min(H/2-26,dy));
    var a=Math.atan2(dy,dx);
    g.save();g.translate(sx,sy);g.rotate(a);
    g.fillStyle=hexA(h.role.col,h.down?0.5:0.9);
    g.beginPath();g.moveTo(12,0);g.lineTo(-7,-8);g.lineTo(-3,0);g.lineTo(-7,8);g.closePath();g.fill();
    g.strokeStyle='rgba(6,8,13,0.8)';g.lineWidth=1.5;g.stroke();
    g.restore();
  });
  /* key fragments (or the gate, once it is open) get a shard arrow */
  var targets=[];
  if(S.gateOpen&&!S.keyTurned)targets.push({x:GATE.x,y:GATE.y+20,gate:1});
  else for(var fi=0;fi<(S.frags||[]).length;fi++){var ff=S.frags[fi]; if(!ff.taken)targets.push(ff.carrier||ff)}
  for(var ti=0;ti<targets.length;ti++){var tg=targets[ti];
    var tdx=tg.x-S.cam.x, tdy=tg.y-S.cam.y;
    if(Math.abs(tdx)<W/2-20&&Math.abs(tdy)<H/2-20)continue;
    var tsx=W/2+Math.max(-W/2+30,Math.min(W/2-30,tdx));
    var tsy=H/2+Math.max(-H/2+30,Math.min(H/2-30,tdy));
    var ta=Math.atan2(tdy,tdx), tp=0.75+0.25*Math.sin(S.elapsed*4+ti);
    g.save();g.translate(tsx,tsy);g.rotate(ta);
    g.fillStyle=hexA(tg.gate?'#FFF0B0':COL.gold,tp);
    g.beginPath();g.moveTo(15,0);g.lineTo(-9,-10);g.lineTo(-4,0);g.lineTo(-9,10);g.closePath();g.fill();
    g.strokeStyle='rgba(6,8,13,0.8)';g.lineWidth=1.5;g.stroke();
    g.rotate(-ta);
    drawShard(-16,12,0.55,S.elapsed);
    g.restore();
  }
  /* and one for every chest waiting off-screen, pulsing so it reads as loot */
  for(var i=0;i<S.chests.length;i++){var c=S.chests[i];
    var dx=c.x-S.cam.x, dy=c.y-S.cam.y;
    if(Math.abs(dx)<W/2-20&&Math.abs(dy)<H/2-20)continue;
    var sx=W/2+Math.max(-W/2+26,Math.min(W/2-26,dx));
    var sy=H/2+Math.max(-H/2+26,Math.min(H/2-26,dy));
    var a=Math.atan2(dy,dx), pul=0.7+0.3*Math.sin(S.elapsed*5);
    g.save();g.translate(sx,sy);g.rotate(a);
    g.fillStyle=hexA(COL.gold,pul);
    g.beginPath();g.moveTo(14,0);g.lineTo(-8,-9);g.lineTo(-3,0);g.lineTo(-8,9);g.closePath();g.fill();
    g.strokeStyle='rgba(6,8,13,0.8)';g.lineWidth=1.5;g.stroke();
    g.rotate(-a);
    g.fillStyle='#E8C46A';g.fillRect(-19,8,12,7);g.fillStyle='#3A2412';g.fillRect(-18,9,10,5);
    g.fillStyle='#E8C46A';g.fillRect(-14,10,2,3);
    g.restore();
  }
}

function drawHeroActor(h){
  g.save();
  g.translate(h.x,h.y+h.r*0.55-(h.z||0));
  g.scale(1.24*(h.sqx||1),1.24*(h.sqy||1));
  if(h.down){g.rotate(1.35*h.face);g.globalAlpha=0.62;g.translate(0,2)}
  if(h.face<0)g.scale(-1,1);
  rt.FLASH=h.hitFlash>0.4;
  HERODRAW[h.cls==='rogue'?'rogue':h.key](h);
  rt.FLASH=false;
  g.restore();g.globalAlpha=1;
}

export { render, drawHeroActor, inView };
