/**
 * Bakes enemy rigs into sprite atlases; blitting, glows and contact shadows.
 */

import { g } from '../canvas.js';
import { H, W } from '../config.js';
import { rt } from '../state.js';
import { hexA, rr } from '../util.js';

var ATLAS={},GLOW={},SHADOW=null;
function bake(name,fn,fw,fh,oy,sc){
  sc=sc||1;
  var frames=[],i;
  for(i=0;i<8;i++)frames.push({t:i/8,k:0,state:'walk'});
  for(i=0;i<5;i++)frames.push({t:0.25,k:(i+1)/5,state:'death'});
  function paint(ctx2,flash){
    rt.FLASH=flash;
    frames.forEach(function(f,idx){
      ctx2.save();ctx2.translate(idx*fw+fw/2,oy);ctx2.scale(sc,sc);
      if(f.state==='death'){ctx2.globalAlpha=1-f.k*0.75;ctx2.rotate(f.k*0.30);
        ctx2.translate(0,f.k*3);ctx2.scale(1+f.k*0.20,1-f.k*0.62)}
      fn(ctx2,{t:f.t,k:f.k,state:f.state});
      ctx2.restore();
    });
    rt.FLASH=false;
  }
  var SS=2;
  var c=document.createElement('canvas');c.width=fw*SS*frames.length;c.height=fh*SS;
  var cc=c.getContext('2d');cc.scale(SS,SS);paint(cc,false);
  var c2=document.createElement('canvas');c2.width=c.width;c2.height=c.height;
  var c3=c2.getContext('2d');c3.scale(SS,SS);paint(c3,true);
  ATLAS[name]={img:c,flash:c2,fw:fw,fh:fh,oy:oy,n:frames.length,S:SS};
}
function blit(name,idx,x,y,face,alpha,flash){
  var A=ATLAS[name];if(!A)return;
  g.save();g.translate(x,y);if(face<0)g.scale(-1,1);
  if(alpha!=null&&alpha<1)g.globalAlpha=alpha;
  g.drawImage(flash?A.flash:A.img,idx*A.fw*A.S,0,A.fw*A.S,A.fh*A.S,-A.fw/2,-A.oy,A.fw,A.fh);
  g.restore();
}
/* blit with squash-and-stretch about the feet and a tumble rotation */
function blitSquash(name,idx,x,y,face,alpha,flash,sx,sy,rot){
  var A=ATLAS[name];if(!A)return;
  g.save();g.translate(x,y);
  if(rot)g.rotate(rot);
  g.scale((face<0?-1:1)*(sx||1),sy||1);
  if(alpha!=null&&alpha<1)g.globalAlpha=alpha;
  g.drawImage(flash?A.flash:A.img,idx*A.fw*A.S,0,A.fw*A.S,A.fh*A.S,-A.fw/2,-A.oy,A.fw,A.fh);
  g.restore();
}
function bakeGlow(col){
  var c=document.createElement('canvas');c.width=c.height=128;
  var cc=c.getContext('2d');
  var gr=cc.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,hexA(col,0.5));gr.addColorStop(0.45,hexA(col,0.13));gr.addColorStop(1,hexA(col,0));
  cc.fillStyle=gr;cc.fillRect(0,0,128,128);return c;
}
function glow(col,x,y,r,a){
  var img=GLOW[col];if(!img)img=GLOW[col]=bakeGlow(col);
  g.globalAlpha=a==null?1:a;g.drawImage(img,x-r,y-r,r*2,r*2);g.globalAlpha=1;
}
function bakeShadow(){
  var c=document.createElement('canvas');c.width=c.height=64;
  var cc=c.getContext('2d');
  var gr=cc.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(0,0,0,0.62)');gr.addColorStop(0.55,'rgba(0,0,0,0.24)');gr.addColorStop(1,'rgba(0,0,0,0)');
  cc.fillStyle=gr;cc.fillRect(0,0,64,64);SHADOW=c;
}
function shadow(x,y,r){g.drawImage(SHADOW,x-r*1.7,y-r*0.56,r*3.4,r*1.12)}

var motes=[];
function seedMotes(){motes=[];for(var i=0;i<58;i++)
  motes.push({x:rr(0,W),y:rr(0,H),vx:rr(-8,8),vy:rr(-15,-3),s:rr(.7,2),a:rr(.12,.42)})}

export { ATLAS, GLOW, SHADOW, bake, blit, blitSquash, bakeGlow, glow, bakeShadow, shadow, motes, seedMotes };
