/**
 * Ten achievements, persisted in localStorage. `award(id, value)` is the only
 * entry point: it checks, saves, records a best where the achievement has one,
 * and toasts the first time -- it never pauses the game.
 */

import { sfx } from './audio.js';
import { isHost } from './net.js';
import { evPush } from './snapshot.js';
import { $ } from './util.js';

const ACH = [
  { id: 'century',  n: 'Century',       t: 'Kill 100 enemies in one run.' },
  { id: 'clear',    n: 'Vault Cleared', t: 'Finish the run.' },
  { id: 'speed',    n: 'Speed Clear',   t: 'Finish the run in under 15:00.', best: 'time' },
  { id: 'blitz',    n: 'Blitz',         t: 'Turn a key within 90 seconds of arriving on a stage.', best: 'time' },
  { id: 'overtime', n: 'Overtime',      t: 'Clear a stage after the Horde meter has filled.' },
  { id: 'marathon', n: 'Marathon',      t: 'Overtime on all five stages in one run.' },
  { id: 'nowipe',   n: 'No Wipe',       t: 'Finish the run with no hero ever downed.' },
  { id: 'cursed',   n: 'Cursed Crown',  t: 'Win while holding three or more curses.' },
  { id: 'hoarder',  n: 'Hoarder',       t: 'Open ten chests in one run.' },
  { id: 'giant',    n: 'Giant Slayer',  t: 'Kill the final boss before it enrages.' },
  { id: 'seats',    n: 'Seat Hopper',   t: 'Clear a stage having driven all three heroes on it.' },
  { id: 'shade',    n: 'The Shade',     t: 'Find what the vault keeps in the dark.', hidden: 1 },
];
const ACH_BY_ID = {};
ACH.forEach((a) => { ACH_BY_ID[a.id] = a; });

const ACH_KEY = 'wipecheck.ach';
let achStore = null;
let earnedThisRun = [];

function achLoad() {
  if (achStore) return achStore;
  try { achStore = JSON.parse(localStorage.getItem(ACH_KEY) || '{}') || {}; } catch (e) { achStore = {}; }
  return achStore;
}
function achSave() { try { localStorage.setItem(ACH_KEY, JSON.stringify(achLoad())); } catch (e) { /* private mode */ } }

function achHas(id) { return !!achLoad()[id]; }
function bestOf(id) { const r = achLoad()[id]; return r && r.best != null ? r.best : null; }
function achEarned() { return earnedThisRun.slice(); }
function resetRun() { earnedThisRun = []; }

function fmtAchTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; }

function award(id, value) {
  const def = ACH_BY_ID[id]; if (!def) return false;
  const st = achLoad();
  let fresh = false;
  if (!st[id]) { st[id] = { at: Date.now() }; fresh = true; }
  if (def.best && value != null && (st[id].best == null || value < st[id].best)) {
    st[id].best = Math.round(value * 10) / 10;
  }
  achSave();
  if (isHost()) evPush(['a', id, value]);   // guests earn it on their own machines
  if (fresh) {
    earnedThisRun.push(id);
    achToast(def);
    sfx('ach');
  }
  return fresh;
}

/* ---------------------------------------------------------------- toast */
let achToastTimer = 0;
function achToast(def) {
  const el = $('achToast'); if (!el) return;
  el.innerHTML = '<div class="tk">Achievement</div><div class="tn">' + def.n + '</div><div class="tt">' + def.t + '</div>';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(achToastTimer);
  achToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ------------------------------------------------------ trophies panel */
function buildTrophies() {
  const wrap = $('trophyBody'); if (!wrap) return;
  const st = achLoad();
  wrap.innerHTML = ACH.map((a) => {
    const r = st[a.id];
    const when = r ? new Date(r.at).toLocaleDateString() : '';
    const best = r && r.best != null ? ' &middot; best ' + fmtAchTime(r.best) : '';
    const secret = a.hidden && !r;   // a hidden one stays a rumour until it is earned
    return '<div class="trophy' + (r ? ' got' : '') + (secret ? ' secret' : '') + '">' +
      '<div class="tn">' + (secret ? '???' : a.n) + '</div><div class="tt">' + (secret ? 'A secret. The vault keeps one.' : a.t) + '</div>' +
      '<div class="tw">' + (r ? when + best : 'Locked') + '</div></div>';
  }).join('');
  const n = ACH.filter((a) => st[a.id]).length;
  const cnt = $('trophyCount'); if (cnt) cnt.textContent = n + ' / ' + ACH.length;
}

/* the run-end tally: earned-this-run first, highlighted */
function runEndHtml() {
  if (!earnedThisRun.length) return '';
  return earnedThisRun.map((id) => '<span class="ach new">' + ACH_BY_ID[id].n + '</span>').join('');
}

export { ACH, award, achHas, bestOf, achEarned, resetRun, buildTrophies, runEndHtml, fmtAchTime };
