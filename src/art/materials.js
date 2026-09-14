/**
 * Material table and the shaded drawing primitives every rig is built from.
 */

import { TAU } from '../config.js';
import { rt } from '../state.js';
import { hexA } from '../util.js';

var LDX=-0.34, LDY=-0.94;      /* light direction, up-left */

function M(base,light,shade,line){return{b:base,l:light,s:shade,k:line||'#0C0B09'}}
var MAT={
  plate:   M('#6C6862','#A9A399','#33312C'),
  iron:    M('#41403C','#6E6C66','#1C1B19'),
  gold:    M('#B98B36','#F0CE7C','#5E4416','#100D06'),
  leather: M('#4A382A','#755B42','#211913'),
  wood:    M('#4A3524','#75553A','#221810'),
  bone:    M('#6E6656','#A79C80','#2E2A20'),
  flesh:   M('#4C4838','#75705A','#1E1C15'),
  rot:     M('#414C34','#68764C','#191E14'),
  darkrobe:M('#3B3450','#655C86','#1A1726'),
  cloth:   M('#B3A996','#E7DCC8','#5A5346'),
  tanC:    M('#A87A4C','#D9AC79','#573A22'),
  dpsC:    M('#6E8F45','#A9C972','#33421F'),
  healC:   M('#C4658F','#F3A6C6','#5E2C42'),
  shadeC:  M('#7D5FC2','#B48CFF','#3A2A66'),
  shroud:  M('#2A2438','#4A4160','#120F1C')
};
function grad(c,m,h){
  if(rt.FLASH)return '#FFF3E8';
  var g2=c.createLinearGradient(h*LDX*0.9,h*LDY*0.9,-h*LDX*0.9,-h*LDY*0.55);
  g2.addColorStop(0,m.l);g2.addColorStop(0.42,m.b);g2.addColorStop(1,m.s);
  return g2;
}
function lineC(m){return rt.FLASH?'#FFFFFF':m.k}
/* tube limb: keyline, body gradient, specular streak */
function limb(c,x1,y1,x2,y2,w,m,h){
  c.lineCap='round';c.lineJoin='round';
  c.strokeStyle=lineC(m);c.lineWidth=w+2.1;
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
  c.strokeStyle=grad(c,m,h||34);c.lineWidth=w;
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
  if(!rt.FLASH&&w>3.2){
    c.strokeStyle=hexA(m.l,0.5);c.lineWidth=w*0.28;
    c.beginPath();c.moveTo(x1+LDX*w*0.28,y1+LDY*w*0.28);c.lineTo(x2+LDX*w*0.28,y2+LDY*w*0.28);c.stroke();
  }
}
/* solid form: keyline + graded fill */
function form(c,pf,m,h){
  c.lineJoin='round';c.lineCap='round';
  c.beginPath();pf(c);c.closePath();
  c.strokeStyle=lineC(m);c.lineWidth=2.2;c.stroke();
  c.fillStyle=grad(c,m,h||34);c.fill();
}
function trim(c,pf,m,wdt){
  c.beginPath();pf(c);
  c.strokeStyle=rt.FLASH?'#FFFFFF':m.b;c.lineWidth=wdt||1.6;c.lineCap='round';c.stroke();
}
function gem(c,x,y,r,col){
  if(rt.FLASH){c.fillStyle='#FFF';c.beginPath();c.arc(x,y,r,0,TAU);c.fill();return}
  c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
  c.fillStyle='rgba(255,255,255,0.75)';c.beginPath();c.arc(x-r*0.3,y-r*0.35,r*0.36,0,TAU);c.fill();
}
function eyes(c,x,y,d,col){
  if(rt.FLASH)return;
  c.fillStyle=col;
  c.beginPath();c.ellipse(x-d,y,1.5,1.15,0,0,TAU);c.fill();
  c.beginPath();c.ellipse(x+d,y,1.5,1.15,0,0,TAU);c.fill();
}

export { LDX, LDY, M, MAT, grad, lineC, limb, form, trim, gem, eyes };
