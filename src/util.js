/**
 * Small math, random and DOM helpers used everywhere.
 */

import { rnd } from './config.js';

function rr(a,b){return a+rnd()*(b-a)}
function ri(a,b){return Math.floor(rr(a,b+1))}
function pick(a){return a[Math.floor(rnd()*a.length)]}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function dist(a,b){var dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy)}
var $=function(i){return document.getElementById(i)};

function kf(p,st){
  if(p<0)return st[0][1];
  for(var i=1;i<st.length;i++){if(p<=st[i][0]){var a=st[i-1],b=st[i];
    var u=(p-a[0])/((b[0]-a[0])||1);u=u*u*(3-2*u);return a[1]+(b[1]-a[1])*u}}
  return st[st.length-1][1];
}
function hexA(hex,a){var h=hex.replace('#','');
  return 'rgba('+parseInt(h.substr(0,2),16)+','+parseInt(h.substr(2,2),16)+','+parseInt(h.substr(4,2),16)+','+a+')'}

export { rr, ri, pick, clamp, dist, $, kf, hexA };
