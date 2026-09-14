/**
 * The three party rigs, drawn live so they react to speed and swings.
 */

import { glow } from './atlas.js';
import { MAT, eyes, form, gem, limb, trim } from './materials.js';
import { g } from '../canvas.js';
import { TAU } from '../config.js';
import { S, rt } from '../state.js';
import { clamp, kf } from '../util.js';

function heroPose(h){
  var sp=Math.sqrt(h.vx*h.vx+h.vy*h.vy)/h.speed;
  return {w:h.phase*TAU,sp:sp,sw:h.swing>0?1-h.swing/h.swingDur:-1};
}
function drawTank(h){
  var P=heroPose(h),w=P.w;
  var bob=Math.abs(Math.sin(w))*2*P.sp,sw=Math.sin(w)*4.8*P.sp;
  var hip=-16-bob,sh=-29-bob;
  var arm=kf(P.sw,[[0,-0.45],[0.28,-2.05],[0.46,1.3],[0.7,0.7],[1,-0.45]]);
  if(P.sw<0)arm=-0.45+Math.sin(S.elapsed*2.2)*0.06;
  var lean=kf(P.sw,[[0,0],[0.28,-1.7],[0.46,2.8],[1,0]]);
  form(g,function(k){k.moveTo(-5,sh+1);k.lineTo(5,sh+1);k.lineTo(8-h.vx*0.03,-1);k.lineTo(-8-h.vx*0.03,-1)},MAT.tanC,34);
  limb(g,-3.4,hip,-4.6-sw,-1,6,MAT.plate,36);
  limb(g, 3.4,hip, 4.6+sw,-1,6,MAT.plate,36);
  form(g,function(k){k.moveTo(-5.4,-1);k.lineTo(-6.6-sw*0.4,-1);k.lineTo(-6.2-sw*0.4,-5);k.lineTo(-5,-5)},MAT.iron,10);
  form(g,function(k){k.moveTo(-8.4+lean*0.4,sh);k.lineTo(8.4+lean*0.4,sh);k.lineTo(6.2,hip+2);k.lineTo(-6.2,hip+2)},MAT.plate,36);
  form(g,function(k){k.moveTo(-3.6,sh+3);k.lineTo(3.6,sh+3);k.lineTo(2.8,hip+3);k.lineTo(-2.8,hip+3)},MAT.tanC,24);
  trim(g,function(k){k.moveTo(-8,hip+1);k.lineTo(8,hip+1)},MAT.gold,2);
  form(g,function(k){k.ellipse(-9.4+lean*0.3,sh+1.4,6.4,5.4,-0.34,0,TAU)},MAT.plate,20);
  form(g,function(k){k.ellipse(9.4+lean*0.3,sh+1.4,6.4,5.4,0.34,0,TAU)},MAT.plate,20);
  trim(g,function(k){k.moveTo(5,sh-1.6);k.lineTo(13,sh+1)},MAT.gold,1.6);
  var ax=6.6+lean*0.5,ay=sh+5;
  var hx=ax+Math.cos(arm)*11,hy=ay+Math.sin(arm)*11;
  limb(g,ax,ay,hx,hy,4.2,MAT.plate,30);
  var mx=hx+Math.cos(arm-0.25)*13,my=hy+Math.sin(arm-0.25)*13;
  limb(g,hx,hy,mx,my,2.8,MAT.wood,26);
  form(g,function(k){k.ellipse(mx+Math.cos(arm-0.25)*3,my+Math.sin(arm-0.25)*3,4.8,4.2,arm,0,TAU)},MAT.iron,14);
  trim(g,function(k){k.moveTo(mx-3,my-3);k.lineTo(mx+4,my+2)},MAT.gold,1.5);
  form(g,function(k){k.ellipse(0.5+lean*0.3,sh-5.4,5.2,4.8,0,0,TAU)},MAT.plate,16);
  form(g,function(k){k.moveTo(-5.2,sh-5.4);k.lineTo(5.4,sh-5.4);k.lineTo(4.4,sh-9.6);k.lineTo(-4.4,sh-9.6)},MAT.iron,12);
  form(g,function(k){k.moveTo(-1.6+lean*0.3,sh-9);k.lineTo(2.4+lean*0.3,sh-16.4);k.lineTo(4.6+lean*0.3,sh-8.6)},MAT.gold,14);
  if(!rt.FLASH){g.fillStyle='rgba(6,5,4,0.9)';g.fillRect(-4.2,sh-5.4,8.6,2.6)}
  eyes(g,0.4,sh-4.8,2.4,'#FFC98A');
  var shx=-10.4+lean*0.7,shy=hip-4;
  limb(g,-7.6,sh+5,shx+2,shy,4.2,MAT.plate,26);
  form(g,function(k){k.moveTo(shx-6,shy-11.4);k.lineTo(shx+6,shy-11.4);k.lineTo(shx+6.4,shy+5);
    k.lineTo(shx,shy+12);k.lineTo(shx-6.4,shy+5)},MAT.iron,32);
  trim(g,function(k){k.moveTo(shx-5,shy-10);k.lineTo(shx+5,shy-10);k.lineTo(shx+5.4,shy+4.4);
    k.lineTo(shx,shy+10.6);k.lineTo(shx-5.4,shy+4.4);k.closePath()},MAT.gold,1.7);
  gem(g,shx,shy-1,3,'#E8C46A');
}
function drawDps(h){
  var P=heroPose(h),w=P.w;
  var bob=Math.abs(Math.sin(w))*2.2*P.sp,sw=Math.sin(w)*5.6*P.sp;
  var hip=-14-bob,sh=-25-bob;
  var pull=h.atkCd>0?clamp(1-h.atk/h.atkCd,0,1):1;
  var recoil=kf(P.sw,[[0,0],[0.15,-3.6],[0.5,0.6],[1,0]]);
  if(P.sw<0)recoil=0;
  form(g,function(k){k.moveTo(-4.4,sh);k.lineTo(4.4,sh);k.lineTo(7-h.vx*0.025,hip+4);k.lineTo(-7-h.vx*0.025,hip+4)},MAT.dpsC,28);
  limb(g,-2.6,hip,-3.8-sw,-1,4.4,MAT.leather,30);
  limb(g, 2.6,hip, 3.8+sw,-1,4.4,MAT.leather,30);
  form(g,function(k){k.moveTo(-4.6,-1);k.lineTo(-6-sw*0.4,-1);k.lineTo(-5.6-sw*0.4,-5.4);k.lineTo(-4.4,-5.4)},MAT.leather,10);
  form(g,function(k){k.moveTo(-6,sh);k.lineTo(6.4,sh);k.lineTo(4.6,hip+2);k.lineTo(-4.6,hip+2)},MAT.leather,30);
  form(g,function(k){k.moveTo(-4,sh+1);k.lineTo(4,sh+1);k.lineTo(3,hip+2);k.lineTo(-3,hip+2)},MAT.dpsC,22);
  trim(g,function(k){k.moveTo(-5.4,hip+1);k.lineTo(5.4,hip+1)},MAT.gold,1.6);
  form(g,function(k){k.moveTo(-6.4,sh-1);k.lineTo(-10.4,hip+1);k.lineTo(-6.6,hip+2.4);k.lineTo(-3.4,sh)},MAT.leather,18);
  [0,1,2].forEach(function(q){limb(g,-8.4+q*1.5,hip+0.5,-9.6+q*1.5,sh-6,1,MAT.wood,12)});
  var bx=13.4+recoil,by=sh+3;
  limb(g,5.4,sh+3,bx,by,3.3,MAT.leather,26);
  form(g,function(k){k.moveTo(bx-1.4,by-15);k.quadraticCurveTo(bx+8,by,bx-1.4,by+15);
    k.quadraticCurveTo(bx+4,by,bx-1.4,by-15)},MAT.wood,32);
  var sx=bx-8-pull*7.4;
  if(!rt.FLASH){g.strokeStyle='rgba(236,228,204,0.85)';g.lineWidth=1.1;
    g.beginPath();g.moveTo(bx-0.6,by-14);g.lineTo(sx,by);g.lineTo(bx-0.6,by+14);g.stroke()}
  limb(g,-4.4,sh+3,sx+1,by+1,2.9,MAT.leather,22);
  form(g,function(k){k.moveTo(-6,sh+1.4);k.lineTo(-4.6,sh-6.6);k.lineTo(1.8,sh-10.4);
    k.lineTo(5.8,sh-4.6);k.lineTo(4.8,sh+1.4)},MAT.dpsC,20);
  if(!rt.FLASH){g.fillStyle='rgba(8,10,6,0.88)';g.beginPath();
    g.ellipse(1.6,sh-4.2,3.4,3.2,0,0,TAU);g.fill()}
  eyes(g,2,sh-4.6,1.9,'#CFF08A');
}
function drawHeal(h){
  var P=heroPose(h),w=P.w;
  var bob=Math.abs(Math.sin(w))*1.6*P.sp;
  var hem=-1,hip=-15-bob,sh=-26-bob;
  var raise=kf(P.sw,[[0,0],[0.3,-8.4],[0.6,-6],[1,0]]);
  if(P.sw<0)raise=Math.sin(S.elapsed*1.8)*0.7;
  var sway=-h.vx*0.045+Math.sin(w*0.5)*1.7;
  form(g,function(k){k.moveTo(-5.6,sh+2);k.lineTo(5.6,sh+2);k.lineTo(9.6+sway,hem);
    k.lineTo(5+sway,hem+2.4);k.lineTo(1.2+sway,hem-0.8);k.lineTo(-3.2+sway,hem+2.2);
    k.lineTo(-9.6+sway,hem-0.4)},MAT.cloth,34);
  trim(g,function(k){k.moveTo(-8.6+sway,hem-0.2);k.lineTo(-2.8+sway,hem+2);k.lineTo(1.2+sway,hem-0.6);
    k.lineTo(4.8+sway,hem+2.2);k.lineTo(8.8+sway,hem+0.2)},MAT.healC,2);
  form(g,function(k){k.moveTo(-3.4,sh+3);k.lineTo(3.4,sh+3);k.lineTo(4.6,hip+4);k.lineTo(-4.6,hip+4)},MAT.healC,22);
  trim(g,function(k){k.moveTo(-5.6,sh+8);k.lineTo(5.6,sh+8)},MAT.gold,1.8);
  var stx=9.4,sty=sh+2+raise;
  limb(g,5,sh+4,stx-1,sty+7,2.9,MAT.cloth,24);
  limb(g,stx,sty+25,stx+1.6,sty-6,2.3,MAT.wood,34);
  var ox=stx+1.8,oy2=sty-10.4;
  form(g,function(k){k.moveTo(ox-5,oy2+4);k.lineTo(ox-3.4,oy2-3);k.lineTo(ox+3.4,oy2-3);k.lineTo(ox+5,oy2+4)},MAT.gold,14);
  if(!rt.FLASH){
    g.globalCompositeOperation='lighter';
    glow('#F58CBA',ox,oy2,14+(P.sw>=0?8*(1-P.sw):0),0.95);
    g.globalCompositeOperation='source-over';
  }
  gem(g,ox,oy2,3.3,'#FFC0DC');
  limb(g,-5.2,sh+4,-8.8,hip+3,2.7,MAT.cloth,22);
  form(g,function(k){k.moveTo(-5.6,sh+1);k.lineTo(-4.2,sh-7.4);k.lineTo(0,sh-10.6);
    k.lineTo(4.2,sh-7.4);k.lineTo(5.6,sh+1)},MAT.cloth,20);
  trim(g,function(k){k.moveTo(-4.2,sh-7);k.lineTo(0,sh-10.2);k.lineTo(4.2,sh-7)},MAT.healC,1.8);
  if(!rt.FLASH){g.fillStyle='rgba(14,10,12,0.85)';g.beginPath();
    g.ellipse(0,sh-4.4,3.2,3,0,0,TAU);g.fill()}
  eyes(g,0,sh-4.8,2.1,'#FFDCEC');
}
/* the Shade: hooded, low, two daggers; the swing is a crossing slash */
function drawRogue(h){
  var P=heroPose(h),w=P.w;
  var bob=Math.abs(Math.sin(w))*2.4*P.sp,sw=Math.sin(w)*6*P.sp;
  var hip=-13-bob,sh=-24-bob;
  var cut=kf(P.sw,[[0,0],[0.18,-1.2],[0.45,1.5],[1,0]]);
  if(P.sw<0)cut=Math.sin(S.elapsed*3)*0.08;
  var dashing=!!h.dash;
  /* cloak, trailing back when moving */
  var trail=-h.vx*0.05-(dashing?6:0);
  form(g,function(k){k.moveTo(-5,sh+1);k.lineTo(5,sh+1);k.lineTo(7.4+trail,hip+7);k.lineTo(-8.6+trail*1.4,hip+8)},MAT.shroud,30);
  limb(g,-2.4,hip,-3.6-sw,-1,4,MAT.shroud,28);
  limb(g, 2.4,hip, 3.6+sw,-1,4,MAT.shroud,28);
  form(g,function(k){k.moveTo(-5.4,sh);k.lineTo(5.8,sh);k.lineTo(4.2,hip+2);k.lineTo(-4.2,hip+2)},MAT.leather,28);
  form(g,function(k){k.moveTo(-3.2,sh+1);k.lineTo(3.2,sh+1);k.lineTo(2.4,hip+2);k.lineTo(-2.4,hip+2)},MAT.shadeC,20);
  trim(g,function(k){k.moveTo(-4.8,hip+1);k.lineTo(4.8,hip+1)},MAT.shadeC,1.5);
  /* daggers: the lead arm crosses on a strike, the off hand holds reversed */
  var ax=5.2,ay=sh+4, ang=-0.3+cut*1.4;
  var hx=ax+Math.cos(ang)*9,hy=ay+Math.sin(ang)*9;
  limb(g,ax,ay,hx,hy,3,MAT.leather,22);
  limb(g,hx,hy,hx+Math.cos(ang-0.4)*11,hy+Math.sin(ang-0.4)*11,1.8,MAT.iron,20);
  var bx2=-5,by2=sh+4, ang2=2.6-cut*0.8;
  var hx2=bx2+Math.cos(ang2)*7,hy2=by2+Math.sin(ang2)*7;
  limb(g,bx2,by2,hx2,hy2,3,MAT.leather,20);
  limb(g,hx2,hy2,hx2+Math.cos(ang2+2.9)*9,hy2+Math.sin(ang2+2.9)*9,1.6,MAT.iron,18);
  /* hood */
  form(g,function(k){k.moveTo(-6.4,sh+2);k.lineTo(-5.2,sh-7);k.lineTo(-0.6,sh-11.8);k.lineTo(5,sh-7.6);k.lineTo(6.2,sh+2);
    k.lineTo(3.4,sh+0.6);k.lineTo(-3.4,sh+0.6)},MAT.shroud,22);
  trim(g,function(k){k.moveTo(-5.2,sh-6.6);k.lineTo(-0.6,sh-11.2);k.lineTo(5,sh-7.2)},MAT.shadeC,1.4);
  if(!rt.FLASH){g.fillStyle='rgba(6,4,10,0.95)';g.beginPath();g.ellipse(0.4,sh-3.6,4.2,3.6,0,0,TAU);g.fill()}
  eyes(g,1.2,sh-4.2,2,'#D9C2FF');
}
var HERODRAW={tank:drawTank,dps:drawDps,heal:drawHeal,rogue:drawRogue};

export { heroPose, drawTank, drawDps, drawHeal, drawRogue, HERODRAW };
