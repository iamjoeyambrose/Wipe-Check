/**
 * Paints the dungeon: walls, flagstones, arches, pillars and scatter props.
 */

import { MAT, form, limb, trim } from './materials.js';
import { BLOTCH, NOISE, ensureTextures, stipple, tileOver } from './textures.js';
import { g } from '../canvas.js';
import { GATE, H, PI, STAGEART, TAU, W, WORLD_W, WORLD_H, WALLY, rnd } from '../config.js';
import { rt } from '../state.js';
import { clamp, hexA, ri, rr } from '../util.js';

var bgCv=null;
var PROPART={}, props=[], braziers=[], WALLFIRE=[];

function paintBlock(cc,x,y,w,h,P,seed){
  var j=(Math.sin(seed*12.9898)*43758.5453)%1; j=Math.abs(j);
  var g2=cc.createLinearGradient(x,y,x+w*0.3,y+h);
  g2.addColorStop(0,P.wL);g2.addColorStop(0.4,P.wB);g2.addColorStop(1,P.wD);
  cc.globalAlpha=0.72+j*0.28; cc.fillStyle=g2; cc.fillRect(x,y,w,h); cc.globalAlpha=1;
  cc.fillStyle=hexA('#FFFFFF',0.055+j*0.05); cc.fillRect(x,y,w,1.4);
  cc.fillStyle='rgba(0,0,0,0.34)'; cc.fillRect(x,y+h-1.6,w,1.6);
  cc.fillStyle='rgba(0,0,0,0.26)'; cc.fillRect(x+w-1.6,y,1.6,h);
}
function paintWall(cc,P){
  cc.fillStyle=P.wD;cc.fillRect(0,0,WORLD_W,WALLY);
  var rh=26,row=0;
  for(var y=-4;y<WALLY;y+=rh){
    var off=(row%2)*40;
    for(var x=-80;x<WORLD_W+80;x+=80) paintBlock(cc,x+off,y,78,rh-2,P,x*0.11+y*0.37);
    row++;
  }
  // arched gate
  cc.save();
  cc.beginPath();
  cc.moveTo(GATE.x-46,WALLY);cc.lineTo(GATE.x-46,WALLY-42);
  cc.arc(GATE.x,WALLY-42,46,PI,0);cc.lineTo(GATE.x+46,WALLY);cc.closePath();
  cc.clip();
  var gg=cc.createLinearGradient(0,WALLY-88,0,WALLY);
  gg.addColorStop(0,'#000000');gg.addColorStop(0.55,'#07070A');gg.addColorStop(1,'#12100E');
  cc.fillStyle=gg;cc.fillRect(GATE.x-50,WALLY-92,100,96);
  cc.restore();
  cc.lineWidth=6;cc.strokeStyle=P.wL;
  cc.beginPath();cc.moveTo(GATE.x-46,WALLY);cc.lineTo(GATE.x-46,WALLY-42);
  cc.arc(GATE.x,WALLY-42,46,PI,0);cc.lineTo(GATE.x+46,WALLY);cc.stroke();
  cc.lineWidth=2;cc.strokeStyle='rgba(0,0,0,0.5)';cc.stroke();
  // side alcoves
  var alcoves=[];for(var ax0=GATE.x-236;ax0>120;ax0-=560)alcoves.unshift(ax0);
  for(ax0=GATE.x+236;ax0<WORLD_W-120;ax0+=560)alcoves.push(ax0);
  alcoves.forEach(function(ax){
    cc.save();cc.beginPath();
    cc.moveTo(ax-26,WALLY);cc.lineTo(ax-26,WALLY-34);cc.arc(ax,WALLY-34,26,PI,0);
    cc.lineTo(ax+26,WALLY);cc.closePath();cc.clip();
    cc.fillStyle='#0A0908';cc.fillRect(ax-30,WALLY-64,60,68);
    cc.restore();
    cc.lineWidth=4;cc.strokeStyle=hexA(P.wL,0.8);
    cc.beginPath();cc.moveTo(ax-26,WALLY);cc.lineTo(ax-26,WALLY-34);
    cc.arc(ax,WALLY-34,26,PI,0);cc.lineTo(ax+26,WALLY);cc.stroke();
  });
  // banners
  var banners=[];for(var bx0=GATE.x-120;bx0>80;bx0-=560)banners.unshift(bx0);
  for(bx0=GATE.x+120;bx0<WORLD_W-80;bx0+=560)banners.push(bx0);
  banners.forEach(function(bx){
    cc.fillStyle=hexA(P.banner,0.85);
    cc.beginPath();cc.moveTo(bx-17,4);cc.lineTo(bx+17,4);cc.lineTo(bx+17,WALLY-24);
    cc.lineTo(bx,WALLY-12);cc.lineTo(bx-17,WALLY-24);cc.closePath();cc.fill();
    var bg=cc.createLinearGradient(bx-17,0,bx+17,0);
    bg.addColorStop(0,'rgba(0,0,0,0.45)');bg.addColorStop(0.35,'rgba(255,255,255,0.10)');
    bg.addColorStop(1,'rgba(0,0,0,0.5)');
    cc.fillStyle=bg;cc.fill();
    cc.fillStyle=hexA(P.accent,0.9);cc.fillRect(bx-19,2,38,5);
    cc.strokeStyle=hexA('#000000',0.5);cc.lineWidth=1.4;cc.stroke();
    cc.fillStyle=hexA(P.light,0.30);
    cc.beginPath();cc.moveTo(bx,26);cc.lineTo(bx+8,40);cc.lineTo(bx,54);cc.lineTo(bx-8,40);cc.closePath();cc.fill();
  });
  tileOver(cc,NOISE,0,0,WORLD_W,WALLY,'overlay',0.34,1);
  tileOver(cc,BLOTCH,0,0,WORLD_W,WALLY,'multiply',0.5,3);
  // grime running down
  for(var i=0;i<40;i++){
    var sx=rr(0,WORLD_W),sw2=rr(3,16);
    cc.fillStyle='rgba(0,0,0,'+rr(.05,.16).toFixed(2)+')';
    cc.fillRect(sx,rr(0,30),sw2,rr(20,WALLY));
  }
  // base shadow up the wall
  var ao=cc.createLinearGradient(0,WALLY-34,0,WALLY);
  ao.addColorStop(0,'rgba(0,0,0,0)');ao.addColorStop(1,'rgba(0,0,0,0.62)');
  cc.fillStyle=ao;cc.fillRect(0,WALLY-34,WORLD_W,34);
  // plinth / skirting course
  var pl=cc.createLinearGradient(0,WALLY-11,0,WALLY+7);
  pl.addColorStop(0,P.wL);pl.addColorStop(0.4,P.wB);pl.addColorStop(1,P.wD);
  cc.fillStyle=pl;cc.fillRect(0,WALLY-11,WORLD_W,18);
  cc.fillStyle='rgba(255,255,255,0.11)';cc.fillRect(0,WALLY-11,WORLD_W,1.8);
  for(var px=0;px<WORLD_W;px+=58){cc.fillStyle='rgba(0,0,0,0.36)';cc.fillRect(px,WALLY-11,1.6,18)}
  cc.fillStyle='rgba(0,0,0,0.5)';cc.fillRect(0,WALLY+5,WORLD_W,2.4);
  // contact shadow cast onto the floor
  var cs=cc.createLinearGradient(0,WALLY+7,0,WALLY+42);
  cs.addColorStop(0,'rgba(0,0,0,0.62)');cs.addColorStop(1,'rgba(0,0,0,0)');
  cc.fillStyle=cs;cc.fillRect(0,WALLY+7,WORLD_W,35);
}
function paintFloor(cc,P){
  cc.fillStyle=P.gr;cc.fillRect(0,WALLY,WORLD_W,WORLD_H-WALLY);
  var y=WALLY,row=0;
  while(y<WORLD_H+40){
    var rh=34, sw2=44, off=0;
    for(var x=-sw2;x<WORLD_W+sw2;x+=sw2){
      var seed=x*0.07+y*0.13, j=Math.abs((Math.sin(seed*12.9898)*43758.5453)%1);
      var gp=2.6;
      var g2=cc.createLinearGradient(x+off,y,x+off+sw2*0.6,y+rh);
      g2.addColorStop(0,P.fL);g2.addColorStop(0.42,P.fB);g2.addColorStop(1,P.fD);
      cc.globalAlpha=0.66+j*0.34;cc.fillStyle=g2;
      cc.fillRect(x+off+gp,y+gp,sw2-gp*2,rh-gp*2);cc.globalAlpha=1;
      cc.fillStyle=hexA(P.fL,0.16+j*0.14);
      cc.fillRect(x+off+gp,y+gp,sw2-gp*2,1.3);
      cc.fillRect(x+off+gp,y+gp,1.3,rh-gp*2);
      cc.fillStyle='rgba(0,0,0,0.42)';
      cc.fillRect(x+off+gp,y+rh-gp-1.4,sw2-gp*2,1.4);
      cc.fillRect(x+off+sw2-gp-1.4,y+gp,1.4,rh-gp*2);
      if(j>0.88){cc.fillStyle='rgba(0,0,0,0.24)';cc.fillRect(x+off+gp,y+gp,sw2-gp*2,rh-gp*2)}
      else if(j<0.10){cc.fillStyle=hexA(P.fL,0.10);cc.fillRect(x+off+gp,y+gp,sw2-gp*2,rh-gp*2)}
    }
    y+=rh;row++;
  }
  cc.fillStyle='rgba(0,0,0,0.12)';cc.fillRect(0,WALLY,WORLD_W,WORLD_H-WALLY);
  tileOver(cc,NOISE,0,WALLY,WORLD_W,WORLD_H-WALLY,'overlay',0.40,1);
  tileOver(cc,BLOTCH,0,WALLY,WORLD_W,WORLD_H-WALLY,'multiply',0.62,4);
  // cracks
  cc.strokeStyle='rgba(0,0,0,0.42)';cc.lineWidth=1.5;cc.lineCap='round';
  for(var i=0;i<170;i++){
    var cx=rr(0,WORLD_W),cy=rr(WALLY,WORLD_H);cc.beginPath();cc.moveTo(cx,cy);
    for(var s=0;s<4;s++){cx+=rr(-30,30);cy+=rr(-18,18);cc.lineTo(cx,cy)}
    cc.stroke();
  }
  // moss along the wall base + corners
  for(i=0;i<420;i++){
    var mx=rr(0,WORLD_W),my=WALLY+Math.pow(rnd(),2.4)*130;
    cc.fillStyle=hexA(P.moss,rr(.06,.24));
    cc.beginPath();cc.ellipse(mx,my,rr(4,18),rr(2,8),rr(0,PI),0,TAU);cc.fill();
  }
  // pebbles + debris
  for(i=0;i<650;i++){
    var px=rr(0,WORLD_W),py=rr(WALLY,WORLD_H);
    cc.fillStyle='rgba(0,0,0,'+rr(.12,.34).toFixed(2)+')';
    cc.beginPath();cc.ellipse(px,py,rr(1.4,4),rr(1,2.4),rr(0,PI),0,TAU);cc.fill();
    cc.fillStyle=hexA(P.fL,rr(.06,.20));
    cc.beginPath();cc.ellipse(px-0.6,py-0.8,rr(1,3),rr(.8,1.8),0,0,TAU);cc.fill();
  }
  stipple(cc,0,WALLY,WORLD_W,WORLD_H-WALLY,26000,'#000000',P.fL);
}
function paintSideWalls(cc,P){
  var topW=76, botW=18;
  [[-1,0],[1,WORLD_W]].forEach(function(sd){
    var dir=sd[0], ex=sd[1];
    cc.save();
    cc.beginPath();
    cc.moveTo(ex,0);cc.lineTo(ex+dir*topW,0);cc.lineTo(ex+dir*botW,WORLD_H);cc.lineTo(ex,WORLD_H);cc.closePath();
    cc.clip();
    cc.fillStyle=P.wD;cc.fillRect(Math.min(ex,ex+dir*topW),0,topW+4,WORLD_H);
    for(var y=-10;y<WORLD_H;y+=30){
      var f=y/WORLD_H, ww=topW+(botW-topW)*f;
      for(var k2=0;k2<3;k2++){
        var x0=ex+dir*(ww*k2/3), x1=ex+dir*(ww*(k2+1)/3);
        var g2=cc.createLinearGradient(x0,y,x1,y+28);
        g2.addColorStop(0,P.wB);g2.addColorStop(1,P.wD);
        cc.fillStyle=g2;
        cc.beginPath();cc.moveTo(x0,y);cc.lineTo(x1,y+3*dir*0);cc.lineTo(x1,y+27);cc.lineTo(x0,y+27);cc.closePath();cc.fill();
        cc.strokeStyle='rgba(0,0,0,0.45)';cc.lineWidth=1.2;cc.stroke();
      }
    }
    tileOver(cc,NOISE,Math.min(ex,ex+dir*topW),0,topW+6,WORLD_H,'overlay',0.34,1);
    var eg=cc.createLinearGradient(ex,0,ex+dir*topW,0);
    eg.addColorStop(0,'rgba(0,0,0,0.82)');eg.addColorStop(0.55,'rgba(0,0,0,0.30)');eg.addColorStop(1,'rgba(0,0,0,0.72)');
    cc.fillStyle=eg;cc.fillRect(Math.min(ex,ex+dir*topW),0,topW+4,WORLD_H);
    cc.restore();
  });
}
var vignetteCv=null;
function bakeRoom(stage){
  var P=STAGEART[stage];
  ensureTextures();
  var c=document.createElement('canvas');c.width=WORLD_W;c.height=WORLD_H;
  var cc=c.getContext('2d');
  paintFloor(cc,P); paintWall(cc,P); paintSideWalls(cc,P);
  bgCv=c;
  if(!vignetteCv){
    /* the vignette follows the camera, so it is a screen-sized overlay */
    var v=document.createElement('canvas');v.width=W;v.height=H;
    var vc=v.getContext('2d');
    var vg=vc.createRadialGradient(W/2,H*0.55,H*0.42,W/2,H*0.55,H*1.08);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.62)');
    vc.fillStyle=vg;vc.fillRect(0,0,W,H);
    var fg=vc.createLinearGradient(0,H-70,0,H);
    fg.addColorStop(0,'rgba(0,0,0,0)');fg.addColorStop(1,'rgba(0,0,0,0.5)');
    vc.fillStyle=fg;vc.fillRect(0,H-70,W,70);
    var tg=vc.createLinearGradient(0,0,0,50);
    tg.addColorStop(0,'rgba(0,0,0,0.35)');tg.addColorStop(1,'rgba(0,0,0,0)');
    vc.fillStyle=tg;vc.fillRect(0,0,W,50);
    vignetteCv=v;
  }
}
function bakePillar(P){
  var w=64,h=168,c=document.createElement('canvas');
  c.width=w*2;c.height=h*2;var cc=c.getContext('2d');cc.scale(2,2);
  cc.translate(w/2,h);
  // base
  cc.fillStyle=P.wD;cc.fillRect(-24,-16,48,16);
  var bg=cc.createLinearGradient(-24,0,20,0);
  bg.addColorStop(0,P.wL);bg.addColorStop(0.4,P.wB);bg.addColorStop(1,P.wD);
  cc.fillStyle=bg;cc.fillRect(-22,-18,44,17);
  // shaft courses
  for(var y=-18;y>-h+34;y-=24){
    var g2=cc.createLinearGradient(-18,y,16,y);
    g2.addColorStop(0,'rgba(0,0,0,0.55)');g2.addColorStop(0.12,P.wB);
    g2.addColorStop(0.38,P.wL);g2.addColorStop(0.72,P.wB);g2.addColorStop(1,P.wD);
    cc.fillStyle=g2;cc.fillRect(-18,y-23,36,23);
    cc.fillStyle='rgba(255,255,255,0.10)';cc.fillRect(-18,y-23,36,1.5);
    cc.fillStyle='rgba(0,0,0,0.46)';cc.fillRect(-18,y-2.2,36,2.2);
  }
  // capital
  var cg=cc.createLinearGradient(-24,0,20,0);
  cg.addColorStop(0,P.wL);cg.addColorStop(0.4,P.wB);cg.addColorStop(1,P.wD);
  cc.fillStyle=cg;cc.fillRect(-23,-h+12,46,22);
  cc.fillStyle='rgba(255,255,255,0.09)';cc.fillRect(-23,-h+12,46,2);
  cc.fillStyle='rgba(0,0,0,0.4)';cc.fillRect(-23,-h+32,46,2);
  cc.strokeStyle='rgba(0,0,0,0.55)';cc.lineWidth=1.4;cc.strokeRect(-17,-h+34,34,h-52);
  tileOver(cc,NOISE,-24,-h,48,h+2,'overlay',0.34,1);
  var sg=cc.createLinearGradient(-24,0,22,0);
  sg.addColorStop(0,'rgba(0,0,0,0.42)');sg.addColorStop(0.34,'rgba(255,255,255,0.09)');
  sg.addColorStop(0.66,'rgba(0,0,0,0)');sg.addColorStop(1,'rgba(0,0,0,0.52)');
  cc.fillStyle=sg;cc.fillRect(-24,-h,48,h);
  var vsh=cc.createLinearGradient(0,-h,0,0);
  vsh.addColorStop(0,'rgba(0,0,0,0.34)');vsh.addColorStop(0.6,'rgba(0,0,0,0)');
  vsh.addColorStop(1,'rgba(0,0,0,0.45)');
  cc.fillStyle=vsh;cc.fillRect(-24,-h,48,h);
  return {img:c,w:w,h:h,ox:w/2,oy:h};
}
function bakeBrazier(P){
  var w=44,h=52,c=document.createElement('canvas');
  c.width=w*2;c.height=h*2;var cc=c.getContext('2d');cc.scale(2,2);cc.translate(w/2,h);
  rt.FLASH=false;
  limb(cc,-9,-2,-2,-24,3,MAT.iron,30);
  limb(cc, 9,-2, 2,-24,3,MAT.iron,30);
  limb(cc, 0,-1, 0,-24,3,MAT.iron,30);
  form(cc,function(k){k.moveTo(-14,-24);k.lineTo(14,-24);k.lineTo(9,-33);k.lineTo(-9,-33)},MAT.iron,22);
  form(cc,function(k){k.ellipse(0,-33,9.5,3.4,0,0,TAU)},MAT.gold,12);
  return {img:c,w:w,h:h,ox:w/2,oy:h};
}
function bakeRubble(P,kind){
  var w=46,h=40,c=document.createElement('canvas');
  c.width=w*2;c.height=h*2;var cc=c.getContext('2d');cc.scale(2,2);cc.translate(w/2,h);
  rt.FLASH=false;
  if(kind===0){ // barrel
    form(cc,function(k){k.moveTo(-10,-2);k.lineTo(-12,-24);k.lineTo(12,-24);k.lineTo(10,-2)},MAT.wood,26);
    trim(cc,function(k){k.moveTo(-11.4,-9);k.lineTo(11.4,-9);k.moveTo(-11.8,-18);k.lineTo(11.8,-18)},MAT.iron,2.2);
    form(cc,function(k){k.ellipse(0,-24,12,3.6,0,0,TAU)},MAT.wood,10);
  } else if(kind===1){ // crate
    form(cc,function(k){k.moveTo(-12,-2);k.lineTo(-12,-21);k.lineTo(12,-21);k.lineTo(12,-2)},MAT.wood,24);
    trim(cc,function(k){k.moveTo(-12,-21);k.lineTo(12,-2);k.moveTo(12,-21);k.lineTo(-12,-2)},MAT.leather,1.8);
  } else if(kind===2){ // bone pile
    form(cc,function(k){k.ellipse(-4,-4,9,4.4,0.2,0,TAU)},MAT.bone,10);
    limb(cc,-11,-3,6,-6,2.6,MAT.bone,12);
    limb(cc,-6,-7,9,-3,2.4,MAT.bone,12);
    form(cc,function(k){k.ellipse(9,-9,5,4.4,0,0,TAU)},MAT.bone,10);
    if(!rt.FLASH){cc.fillStyle='rgba(0,0,0,0.75)';cc.beginPath();cc.arc(7.6,-9.4,1.5,0,TAU);cc.fill();
      cc.beginPath();cc.arc(11,-9,1.5,0,TAU);cc.fill()}
  } else { // rubble
    for(var i=0;i<6;i++){
      var rx=rr(-14,14),ry=rr(-12,-1),s=rr(3,8);
      form(cc,function(k){k.moveTo(rx-s,ry);k.lineTo(rx-s*0.5,ry-s);k.lineTo(rx+s*0.6,ry-s*0.7);k.lineTo(rx+s,ry)},
        {b:P.fB,l:P.fL,s:P.fD,k:'#0B0A08'},14);
    }
  }
  return {img:c,w:w,h:h,ox:w/2,oy:h};
}
function seeded(seed){
  var a=seed>>>0;
  return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
}
function buildProps(stage){
  var P=STAGEART[stage];
  PROPART.pillar=bakePillar(P);
  PROPART.brazier=bakeBrazier(P);
  PROPART.r0=bakeRubble(P,0);PROPART.r1=bakeRubble(P,1);
  PROPART.r2=bakeRubble(P,2);PROPART.r3=bakeRubble(P,3);
  props=[];braziers=[];WALLFIRE=[];
  var R=seeded(1337+stage*7919);
  var cx=WORLD_W/2, cy=WORLD_H/2;
  function clear(x,y,r){return Math.abs(x-cx)<r&&Math.abs(y-cy)<r*0.7}   // keep the start open
  /* colonnades: a loose grid of pillars, some knocked out */
  for(var gy=WALLY+300;gy<WORLD_H-160;gy+=430){
    for(var gx=380;gx<WORLD_W-300;gx+=470){
      if(R()<0.28)continue;
      var x=gx+(R()-0.5)*90, y=gy+(R()-0.5)*70;
      if(clear(x,y,240))continue;
      props.push({art:'pillar',x:x,y:y,solid:24});
      if(R()<0.42){var bx=x+(R()<0.5?-1:1)*68,by=y+18;
        props.push({art:'brazier',x:bx,y:by,solid:0});braziers.push({x:bx,y:by-36})}
    }
  }
  /* freestanding braziers so the far corners are not black */
  for(var i=0;i<8;i++){
    var fx=120+R()*(WORLD_W-240), fy=WALLY+140+R()*(WORLD_H-WALLY-260);
    if(clear(fx,fy,300))continue;
    props.push({art:'brazier',x:fx,y:fy,solid:0});braziers.push({x:fx,y:fy-36});
  }
  /* scatter */
  for(i=0;i<70;i++){
    var sx=60+R()*(WORLD_W-120), sy=WALLY+40+R()*(WORLD_H-WALLY-70);
    if(clear(sx,sy,220))continue;
    props.push({art:'r'+Math.floor(R()*4),x:sx,y:sy,solid:0});
  }
  /* torches along the back wall, one per alcove plus the gate flanks */
  for(var tx=GATE.x-236;tx>120;tx-=560)WALLFIRE.push({x:tx,y:WALLY-46});
  for(tx=GATE.x+236;tx<WORLD_W-120;tx+=560)WALLFIRE.push({x:tx,y:WALLY-46});
  WALLFIRE.push({x:64,y:WALLY-34},{x:WORLD_W-64,y:WALLY-34});
  /* stage 3 keeps one torch dark: the second right of the gate. secret.js
     knows what it means. */
  if(stage===2){var dark=WALLFIRE.filter(function(t){return t.x>GATE.x+300&&t.y===WALLY-46})[0]; if(dark)dark.lit=false}
}
function propShadow(p){
  var A=PROPART[p.art];if(!A)return;
  g.save();g.globalAlpha=0.5;
  g.translate(p.x,p.y);g.transform(1,0,-0.62,0.30,0,0);
  g.globalCompositeOperation='multiply';
  g.fillStyle='#000';
  if(p.art==='pillar'){g.fillRect(-17,-A.h*0.92,34,A.h*0.92)}
  else{g.beginPath();g.ellipse(0,-8,13,11,0,0,TAU);g.fill()}
  g.restore();g.globalAlpha=1;g.globalCompositeOperation='source-over';
}
function drawProp(p){
  var A=PROPART[p.art];if(!A)return;
  g.drawImage(A.img,0,0,A.img.width,A.img.height,p.x-A.ox,p.y-A.oy,A.w,A.h);
}

export { bgCv, vignetteCv, PROPART, props, braziers, WALLFIRE, paintBlock, paintWall, paintFloor, paintSideWalls, bakeRoom, bakePillar, bakeBrazier, bakeRubble, buildProps, propShadow, drawProp };
