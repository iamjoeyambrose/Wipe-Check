/**
 * Keyboard, pointer and on-screen controls.
 */

import { cv } from './canvas.js';
import { useAbility } from './combat.js';
import { ORDER } from './config.js';
import { S, mode, setMode } from './state.js';
import { audioToggle } from './audio.js';
import { syncFrames, syncAbil, toggleGear, syncMute, toggleFullscreen, openPause, closePause } from './ui.js';
import { isGuest } from './net.js';
import { press, trySwap } from './seats.js';
import { $ } from './util.js';

let keys = {};
let touch = null;

document.addEventListener('keydown',function(e){
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;   // typing a name or a code
  var k=e.key.toLowerCase();
  if(k===' '){e.preventDefault(); if(isGuest())press(1); else useAbility(S&&S.h[S.ctrl]); return}
  if(k==='p'||k==='escape'){ if(mode==='play')openPause(); else if(mode==='paused')closePause(); return }
  if(k==='f'){ toggleFullscreen(); return }
  if(k==='g'){ e.preventDefault(); toggleGear(); return }
  if(k==='m'){ audioToggle(); syncMute(); return }
  if(k>='1'&&k<='3'){ if(S&&mode==='play'){ var t=ORDER[+k-1]; if(isGuest())press(2<<(+k-1)); else trySwap('host',t); } return }
  keys[k]=true;
  if(['arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0) e.preventDefault();
});
document.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false});
window.addEventListener('blur',function(){keys={}});

cv.addEventListener('pointerdown',function(e){cv.setPointerCapture(e.pointerId);touch={ox:e.clientX,oy:e.clientY,x:e.clientX,y:e.clientY}});
cv.addEventListener('pointermove',function(e){if(touch){touch.x=e.clientX;touch.y=e.clientY}});
cv.addEventListener('pointerup',function(){touch=null});
cv.addEventListener('pointercancel',function(){touch=null});

function inputVec(){
  /* dev hook: a bot can drive the hero directly */
  if(window.WC&&window.WC.drive)return window.WC.drive;
  var dx=0,dy=0;
  if(keys.w||keys.arrowup)dy-=1; if(keys.s||keys.arrowdown)dy+=1;
  if(keys.a||keys.arrowleft)dx-=1; if(keys.d||keys.arrowright)dx+=1;
  if(touch){var tx=touch.x-touch.ox,ty=touch.y-touch.oy,m=Math.sqrt(tx*tx+ty*ty);
    if(m>8){dx=tx/m;dy=ty/m}}
  var m2=Math.sqrt(dx*dx+dy*dy);
  return m2>0?{x:dx/m2,y:dy/m2}:{x:0,y:0};
}

export { inputVec, keys, touch };
