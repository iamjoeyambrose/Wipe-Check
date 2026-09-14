/**
 * Canvas sizing, device-pixel scaling and the world transform.
 */

import { H, W } from './config.js';
import { rt } from './state.js';
import { $ } from './util.js';

var cv=$('cv'), g=cv.getContext('2d'), arena=$('arena'), scale=1, DPR=1, OX=0, OY=0;

/* Full-window on a Retina display is ~5M pixels a frame, and fill rate is the
   whole cost of this renderer. Cap the backing store: small windows keep 2x,
   a fullscreen laptop lands near 1.4x, which this art does not notice. */
var MAX_PIXELS=2.6e6;
function resize(){
  var r=arena.getBoundingClientRect();
  DPR=Math.min(2,window.devicePixelRatio||1,Math.sqrt(MAX_PIXELS/Math.max(1,r.width*r.height)));
  if(DPR<1)DPR=Math.max(0.75,DPR);
  rt.redraw=2;
  cv.width=Math.round(r.width*DPR); cv.height=Math.round(r.height*DPR);
  scale=Math.min(r.width/W, r.height/H);
  OX=(r.width-W*scale)/2; OY=(r.height-H*scale)/2;
}
function setWorld(){ g.setTransform(scale*DPR,0,0,scale*DPR,OX*DPR,OY*DPR) }
function clearAll(){
  g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle='#080A0F'; g.fillRect(0,0,cv.width/DPR,cv.height/DPR);
}
window.addEventListener('resize',resize);

export { cv, g, arena, resize, setWorld, clearAll };
