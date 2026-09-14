/**
 * Skeletal rigs for the five enemy archetypes.
 */

import { MAT, eyes, form, gem, limb, trim } from './materials.js';
import { TAU } from '../config.js';
import { rt } from '../state.js';

function rigGrunt(c,p){
  var w=p.t*TAU,bob=Math.abs(Math.sin(w))*1.8,sw=Math.sin(w)*3.8;
  var hip=-12-bob, sh=-21-bob;
  limb(c,-2.6,hip,-3.6-sw,-1,4.6,MAT.flesh,26);
  limb(c, 2.6,hip, 3.6+sw,-1,4.6,MAT.flesh,26);
  form(c,function(k){k.moveTo(-4.8,-2);k.lineTo(4.8,-2);k.lineTo(4.2,hip+3);k.lineTo(-4.2,hip+3)},MAT.leather,20);
  form(c,function(k){k.moveTo(-6.8,sh);k.lineTo(6.8,sh);k.lineTo(5,hip+1.5);k.lineTo(-5,hip+1.5)},MAT.flesh,26);
  form(c,function(k){k.moveTo(-7.2,sh-0.6);k.lineTo(7.2,sh-0.6);k.lineTo(6,sh+4.4);k.lineTo(-6,sh+4.4)},MAT.iron,18);
  limb(c,-6.2,sh+2,-8.6+sw*0.7,hip+5,3.3,MAT.flesh,24);
  limb(c, 6.2,sh+2, 8.6-sw*0.7,hip+5,3.3,MAT.flesh,24);
  limb(c, 8.6-sw*0.7,hip+5, 12-sw*0.7,hip-3,1.9,MAT.iron,16);
  form(c,function(k){k.ellipse(0.7,sh-4.8,4.6,4.4,0.1,0,TAU)},MAT.bone,12);
  form(c,function(k){k.moveTo(-4.6,sh-6.4);k.lineTo(4.8,sh-6.4);k.lineTo(4,sh-9);k.lineTo(-3.8,sh-9)},MAT.iron,10);
  eyes(c,0.8,sh-4.6,2.3,'#FF6A4A');
}
function rigRunner(c,p){
  var w=p.t*TAU,sw=Math.sin(w)*6.6,bob=Math.abs(Math.sin(w))*2.4;
  var hip=-10-bob, sh=-17-bob, ln=2.4;
  limb(c,-1.8+ln,hip,-2.2-sw+ln*0.4,-1,3.1,MAT.bone,22);
  limb(c, 1.8+ln,hip, 2.2+sw+ln*0.4,-1,3.1,MAT.bone,22);
  form(c,function(k){k.moveTo(-4.2+ln,sh);k.lineTo(5+ln,sh-0.8);k.lineTo(3.6,hip+1);k.lineTo(-3.6,hip+1)},MAT.bone,22);
  trim(c,function(k){k.moveTo(-3+ln,sh+3);k.lineTo(3.4+ln,sh+2.6);k.moveTo(-3+ln,sh+6);k.lineTo(3.2+ln,sh+5.6)},MAT.flesh,1.1);
  limb(c,-3.8+ln,sh+1,-6-sw*0.5+ln,hip+1,2.4,MAT.bone,20);
  limb(c, 4+ln,sh+1, 6.4+sw*0.5+ln,hip+0.4,2.4,MAT.bone,20);
  form(c,function(k){k.ellipse(1.6+ln,sh-3.8,3.7,3.4,0.28,0,TAU)},MAT.bone,11);
  form(c,function(k){k.moveTo(3.6+ln,sh-4.6);k.lineTo(7+ln,sh-2.6);k.lineTo(3.4+ln,sh-1.4)},MAT.bone,8);
  eyes(c,2.2+ln,sh-4.4,1.9,'#FFB13A');
}
function rigCaster(c,p){
  var w=p.t*TAU,fl=Math.sin(w)*2.6;
  var hem=-3+Math.sin(w)*1.6, sh=-25+fl*0.5;
  form(c,function(k){
    k.moveTo(-5.6,sh+2);k.lineTo(5.6,sh+2);k.lineTo(9.4,hem);
    k.lineTo(5.4,hem+2.6);k.lineTo(2,hem-0.8);k.lineTo(-1.8,hem+3);k.lineTo(-5.2,hem-0.6);k.lineTo(-9.4,hem+1.8);
  },MAT.darkrobe,30);
  trim(c,function(k){k.moveTo(-5,sh+7);k.lineTo(5,sh+7)},MAT.gold,1.4);
  limb(c,-5.2,sh+4,-8.8,sh+11+fl,2.5,MAT.darkrobe,22);
  limb(c, 5.2,sh+4, 8.8,sh+10-fl,2.5,MAT.darkrobe,22);
  form(c,function(k){k.moveTo(-4.8,sh+2.5);k.lineTo(-3.6,sh-5.4);k.lineTo(0,sh-8);k.lineTo(3.6,sh-5.4);k.lineTo(4.8,sh+2.5)},MAT.darkrobe,16);
  if(!rt.FLASH){c.fillStyle='rgba(8,6,14,0.9)';c.beginPath();
    c.ellipse(0,sh-1.6,3.2,3.6,0,0,TAU);c.fill()}
  eyes(c,0,sh-2.4,2.2,'#E4A6FF');
  limb(c,8.8,sh+10-fl,9.8,sh+23,1.7,MAT.wood,24);
  gem(c,10,sh+24.5,2.6,'#D08CFF');
}
function rigBrute(c,p){
  var w=p.t*TAU,bob=Math.abs(Math.sin(w))*2.8,sw=Math.sin(w)*4.6;
  var hip=-20-bob, sh=-36-bob;
  limb(c,-6.4,hip,-8-sw,-2,9.4,MAT.rot,48);
  limb(c, 6.4,hip, 8+sw,-2,9.4,MAT.rot,48);
  form(c,function(k){k.moveTo(-10,-3);k.lineTo(10,-3);k.lineTo(9,hip+4);k.lineTo(-9,hip+4)},MAT.leather,26);
  form(c,function(k){k.moveTo(-13.4,sh);k.lineTo(13.4,sh);k.lineTo(9.4,hip+2);k.lineTo(-9.4,hip+2)},MAT.rot,44);
  form(c,function(k){k.ellipse(-13,sh+1.6,6,5.2,-0.3,0,TAU)},MAT.iron,20);
  form(c,function(k){k.ellipse(13,sh+1.6,6.4,5.4,0.3,0,TAU)},MAT.iron,20);
  limb(c,-12.4,sh+4,-17.4+sw*0.5,hip+7,5.8,MAT.rot,40);
  limb(c, 12.4,sh+4, 17.4-sw*0.5,hip+4,6.6,MAT.rot,40);
  form(c,function(k){k.moveTo(15.4,hip+1);k.lineTo(25,hip-4);k.lineTo(26.4,hip+7.4);k.lineTo(15.4,hip+8.6)},MAT.iron,22);
  trim(c,function(k){k.moveTo(17,hip+2.6);k.lineTo(24.6,hip-1.4)},MAT.plate,1.5);
  form(c,function(k){k.ellipse(0,sh-3.4,6.2,5.4,0,0,TAU)},MAT.rot,16);
  form(c,function(k){k.moveTo(-6.4,sh-5.6);k.lineTo(-9.8,sh-13.4);k.lineTo(-3.4,sh-8.2)},MAT.bone,14);
  form(c,function(k){k.moveTo(6.4,sh-5.6);k.lineTo(9.8,sh-13.4);k.lineTo(3.4,sh-8.2)},MAT.bone,14);
  eyes(c,0,sh-4.4,3.2,'#D48CFF');
}
function rigBoss(c,p){
  var w=p.t*TAU,bob=Math.abs(Math.sin(w))*3.8,sw=Math.sin(w)*5.6;
  var hip=-34-bob, sh=-60-bob;
  limb(c,-10.4,hip,-12.6-sw,-3,15.4,MAT.iron,78);
  limb(c, 10.4,hip, 12.6+sw,-3,15.4,MAT.iron,78);
  form(c,function(k){k.moveTo(-15,-4);k.lineTo(15,-4);k.lineTo(14,hip+5);k.lineTo(-14,hip+5)},MAT.leather,40);
  form(c,function(k){k.moveTo(-22,sh);k.lineTo(22,sh);k.lineTo(15.4,hip+3);k.lineTo(-15.4,hip+3)},MAT.plate,72);
  trim(c,function(k){k.moveTo(-16,sh+13);k.lineTo(16,sh+13)},MAT.gold,2.2);
  form(c,function(k){k.ellipse(-21,sh+3,10,8.4,-0.32,0,TAU)},MAT.iron,32);
  form(c,function(k){k.ellipse(21,sh+3,10.4,8.6,0.32,0,TAU)},MAT.iron,32);
  form(c,function(k){k.moveTo(-27,sh-4);k.lineTo(-22,sh-15);k.lineTo(-17,sh-3)},MAT.bone,18);
  form(c,function(k){k.moveTo(27,sh-4);k.lineTo(22,sh-15);k.lineTo(17,sh-3)},MAT.bone,18);
  limb(c,-20,sh+7,-29+sw*0.4,hip+9,9,MAT.iron,60);
  limb(c, 20,sh+7, 29-sw*0.4,hip+5,9.6,MAT.iron,60);
  form(c,function(k){k.moveTo(26,hip+3);k.lineTo(45,hip-10);k.lineTo(47,hip+11);k.lineTo(26,hip+13)},MAT.iron,34);
  trim(c,function(k){k.moveTo(29,hip+5);k.lineTo(44,hip-5)},MAT.plate,2);
  limb(c,-29+sw*0.4,hip+9,-39+sw*0.4,hip-18,4.2,MAT.wood,40);
  form(c,function(k){k.ellipse(0,sh-6,9.6,8.4,0,0,TAU)},MAT.iron,22);
  form(c,function(k){k.moveTo(-9.8,sh-8.4);k.lineTo(-18,sh-26);k.lineTo(-4.6,sh-13)},MAT.bone,26);
  form(c,function(k){k.moveTo(9.8,sh-8.4);k.lineTo(18,sh-26);k.lineTo(4.6,sh-13)},MAT.bone,26);
  if(!rt.FLASH){c.fillStyle='rgba(6,4,4,0.92)';c.beginPath();c.ellipse(0,sh-5,6.4,5,0,0,TAU);c.fill()}
  eyes(c,0,sh-6,4.4,'#FF7A4A');
}

export { rigGrunt, rigRunner, rigCaster, rigBrute, rigBoss };
