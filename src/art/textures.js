/**
 * Procedural noise, blotch and stipple passes that give stone its grain.
 */

import { TAU } from '../config.js';
import { hexA } from '../util.js';

var NOISE=null, BLOTCH=null;
function mkNoise(size,amp){
  var c=document.createElement('canvas');c.width=c.height=size;
  var cc=c.getContext('2d'),id=cc.createImageData(size,size),d=id.data;
  for(var i=0;i<d.length;i+=4){var v=128+(Math.random()-0.5)*amp;
    d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}
  cc.putImageData(id,0,0);return c;
}
function mkBlotch(size){
  var c=document.createElement('canvas');c.width=c.height=size;
  var cc=c.getContext('2d');cc.fillStyle='#808080';cc.fillRect(0,0,size,size);
  for(var i=0;i<54;i++){
    var v=Math.random()<0.5?'rgba(0,0,0,':'rgba(255,255,255,';
    var gr=cc.createRadialGradient(0,0,0,0,0,1);
    cc.save();cc.translate(Math.random()*size,Math.random()*size);
    var r=6+Math.random()*22;
    var g2=cc.createRadialGradient(0,0,0,0,0,r);
    g2.addColorStop(0,v+(0.10+Math.random()*0.18)+')');g2.addColorStop(1,v+'0)');
    cc.fillStyle=g2;cc.beginPath();cc.arc(0,0,r,0,TAU);cc.fill();cc.restore();
  }
  return c;
}
function tileOver(cc,tile,x,y,w,h,mode,alpha,sc){
  cc.save();cc.beginPath();cc.rect(x,y,w,h);cc.clip();
  cc.globalCompositeOperation=mode;cc.globalAlpha=alpha;
  var s=tile.width*(sc||1);
  for(var ty=y;ty<y+h;ty+=s)for(var tx=x;tx<x+w;tx+=s)cc.drawImage(tile,tx,ty,s,s);
  cc.restore();
}
function stipple(cc,x,y,w,h,n,dark,lightc){
  for(var i=0;i<n;i++){
    var r=Math.random();
    cc.fillStyle=r<0.55?hexA(dark,0.05+Math.random()*0.14):hexA(lightc,0.03+Math.random()*0.10);
    cc.fillRect(x+Math.random()*w,y+Math.random()*h,1+Math.random()*1.8,1+Math.random()*1.3);
  }
}

function ensureTextures(){ if(!NOISE){ NOISE=mkNoise(128,86); BLOTCH=mkBlotch(96); } }

export { NOISE, BLOTCH, mkNoise, mkBlotch, tileOver, stipple, ensureTextures };
