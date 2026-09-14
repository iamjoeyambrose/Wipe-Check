/**
 * Sound: modern synthwave in the vein of The Midnight, generated at runtime.
 * No audio files.
 *
 * Signal chain -- deliberately clean. There is no waveshaper anywhere; the only
 * non-linearity is a limiter on the way out, and it should barely work.
 *
 *   voices ─┬─────────────────────────────► mix ─► limiter ─► master ─► out
 *           ├─► plate  (1.9s hall)  ──────►
 *           ├─► gate   (0.34s, cut) ──────►      (the big gated snare)
 *           └─► echo   (dotted 8th) ──────►      (arps and stabs bounce)
 *
 * Pads, bass, stabs and arps sit behind `duck`, a gain node pulled hard down on
 * every kick: four on the floor plus that pump is the whole feel.
 *
 * The track is an 8-bar phrase over Am F C G. Bars 0-3 are the verse, 4-7 the
 * chorus, which lifts one intensity layer above whatever the room is doing, so
 * even a quiet stage breathes. Bar 7 rolls and rises into a crash on bar 0.
 *
 * LEVELS: every voice declares a peak in VOICE below and nothing else sets
 * gain by feel. audioRender() renders any sound offline so peak and RMS can be
 * measured rather than guessed -- see the level table in the README.
 */

const BPM = 122;
const SPB = 60 / BPM;
const STEP = SPB / 4;
const BAR = SPB * 4;

/* One place for every voice level, in linear peak. Sum of a full bar lands
   around -6 dBFS before the limiter, which then has almost nothing to do. */
const VOICE = {
  /* the track is a bed: it sits about 5 dB under the effects so a slam always
     punches through instead of fighting the kick */
  kick: 0.255, snare: 0.128, clap: 0.113, hat: 0.024, openhat: 0.034, tom: 0.105,
  crash: 0.09, bass: 0.086, pad: 0.030, pluck: 0.07, arp: 0.055, lead: 0.075,
  riser: 0.12,
  sfxSoft: 0.14, sfxMid: 0.22, sfxHard: 0.34, slam: 0.52,
};

let actx = null;
let master = null, busMusic = null, busSfx = null, voiceBus = null;
let muted = false;
let volMusic = 0.8, volSfx = 1.0;
try {
  const m = localStorage.getItem('wipecheck.volMusic');
  const f = localStorage.getItem('wipecheck.volSfx');
  if (m !== null) volMusic = Math.min(1, Math.max(0, +m));
  if (f !== null) volSfx = Math.min(1, Math.max(0, +f));
} catch (e) { /* private mode */ }
let musicOn = false, intensity = 0, bossMode = false;
let nextStep = 0, stepTime = 0, schedTimer = 0;
let noiseBuf = null;

try { muted = localStorage.getItem('wipecheck.muted') === '1'; } catch (e) { muted = false; }

/* ------------------------------------------------------------------ setup */
function impulse(seconds, decay, gated) {
  const n = Math.floor(actx.sampleRate * seconds);
  const buf = actx.createBuffer(2, n, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let env = Math.pow(1 - t, decay);
      if (gated) env = t < 0.82 ? Math.pow(1 - t * 0.35, 1.4) : env * Math.pow(1 - (t - 0.82) / 0.18, 3);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

function audioInit(ctxOverride) {
  if (actx && !ctxOverride) { if (actx.state === 'suspended') actx.resume(); return actx; }
  if (ctxOverride) actx = ctxOverride;
  else {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }

  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.85;

  /* a limiter, not a distortion box: it should catch peaks and nothing else */
  const limiter = actx.createDynamicsCompressor();
  /* a safety net, not a compressor: with the levels below, it should only ever
     catch a stray simultaneous pile-up. Sitting it at -8 squashed every impact
     and made slams quieter than the drums. */
  limiter.threshold.value = -2; limiter.ratio.value = 20;
  limiter.attack.value = 0.001; limiter.release.value = 0.08; limiter.knee.value = 0;
  limiter.connect(master); master.connect(actx.destination);

  /* Music and effects get separate buses so the sliders are real: each owns
     its own reverb returns, otherwise a muted music bed would still bleed
     through the shared plate. The IR buffers are shared -- only the convolver
     nodes are duplicated, which is cheap. */
  const plateIR = impulse(1.9, 2.6, false);
  const gateIR = impulse(0.34, 1.1, true);

  function makeBus(volume) {
    const out = actx.createGain(); out.gain.value = volume; out.connect(limiter);
    const dry = actx.createGain(); dry.gain.value = 1; dry.connect(out);
    const duckNode = actx.createGain(); duckNode.gain.value = 1; duckNode.connect(dry);

    const plate = actx.createConvolver(); plate.buffer = plateIR;
    const plateSend = actx.createGain(); plateSend.gain.value = 1;
    const plateLvl = actx.createGain(); plateLvl.gain.value = 0.34;
    const plateTone = actx.createBiquadFilter();
    plateTone.type = 'highpass'; plateTone.frequency.value = 320;
    plateSend.connect(plate); plate.connect(plateTone);
    plateTone.connect(plateLvl); plateLvl.connect(out);

    const gate = actx.createConvolver(); gate.buffer = gateIR;
    const gateSend = actx.createGain(); gateSend.gain.value = 1;
    const gateLvl = actx.createGain(); gateLvl.gain.value = 0.42;
    gateSend.connect(gate); gate.connect(gateLvl); gateLvl.connect(out);

    /* dotted-eighth echo, darkened each pass: what makes an arp sound like 1985 */
    const echo = actx.createDelay(1.0); echo.delayTime.value = STEP * 3;
    const echoFb = actx.createGain(); echoFb.gain.value = 0.38;
    const echoTone = actx.createBiquadFilter();
    echoTone.type = 'lowpass'; echoTone.frequency.value = 3800;
    const echoSend = actx.createGain(); echoSend.gain.value = 1;
    const echoLvl = actx.createGain(); echoLvl.gain.value = 0.5;
    echoSend.connect(echo); echo.connect(echoTone); echoTone.connect(echoFb); echoFb.connect(echo);
    echoTone.connect(echoLvl); echoLvl.connect(duckNode);   // echoes pump too

    return { out: out, dry: dry, duck: duckNode, plateSend: plateSend, gateSend: gateSend, echoSend: echoSend };
  }
  busMusic = makeBus(volMusic);
  busSfx = makeBus(volSfx);
  voiceBus = busSfx;

  const n = Math.floor(actx.sampleRate * 2);
  noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

  return actx;
}

function audioToggle() {
  muted = !muted;
  try { localStorage.setItem('wipecheck.muted', muted ? '1' : '0'); } catch (e) { /* private mode */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, actx.currentTime, 0.02);
  return muted;
}
function audioMuted() { return muted; }

function setVolume(which, value) {
  const v = Math.min(1, Math.max(0, value));
  if (which === 'music') volMusic = v; else volSfx = v;
  const bus = which === 'music' ? busMusic : busSfx;
  if (bus && actx) bus.out.gain.setTargetAtTime(v, actx.currentTime, 0.015);
  try { localStorage.setItem('wipecheck.vol' + (which === 'music' ? 'Music' : 'Sfx'), String(v)); }
  catch (e) { /* private mode */ }
  return v;
}
function getVolume(which) { return which === 'music' ? volMusic : volSfx; }

/* ------------------------------------------------------------- utilities */
function noiseSrc() { const s = actx.createBufferSource(); s.buffer = noiseBuf; return s; }
function panner(p) { const n = actx.createStereoPanner(); n.pan.value = p || 0; return n; }
function adsr(g, t, peak, atk, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
}
/* Route a voice into whichever bus is currently sounding (the sequencer sets
   the music bus, sfx() sets the effects bus). `ducked` puts it behind the
   sidechain. */
function route(node, ducked, plateAmt, gateAmt, echoAmt) {
  const b = voiceBus || busSfx;
  node.connect(ducked ? b.duck : b.dry);
  if (plateAmt) { const s = actx.createGain(); s.gain.value = plateAmt; node.connect(s); s.connect(b.plateSend); }
  if (gateAmt) { const s = actx.createGain(); s.gain.value = gateAmt; node.connect(s); s.connect(b.gateSend); }
  if (echoAmt) { const s = actx.createGain(); s.gain.value = echoAmt; node.connect(s); s.connect(b.echoSend); }
}

/* --------------------------------------------------------------- the kit */
function synKick(t, v) {
  v = v == null ? 1 : v;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.04);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(VOICE.kick * v, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g); route(g, 0, 0.04, 0);
  o.start(t); o.stop(t + 0.28);
  /* beater click: tight, so four on the floor stays punchy and not muddy */
  const c = noiseSrc(), cf = actx.createBiquadFilter(), cg = actx.createGain();
  cf.type = 'bandpass'; cf.frequency.value = 3000; cf.Q.value = 0.9;
  adsr(cg, t, 0.07 * v, 0.001, 0.012);
  c.connect(cf); cf.connect(cg); route(cg, 0, 0, 0);
  c.start(t); c.stop(t + 0.03);
  /* sidechain: the pump. Pads, bass, stabs and arps all breathe with the kick. */
  const dk = busMusic && busMusic.duck;
  if (dk) {
    dk.gain.cancelScheduledValues(t);
    dk.gain.setValueAtTime(1, t);
    dk.gain.linearRampToValueAtTime(0.30, t + 0.010);
    dk.gain.linearRampToValueAtTime(1, t + 0.30);
  }
}
function synSnare(t, v) {
  v = v == null ? 1 : v;
  const s = noiseSrc(), bp = actx.createBiquadFilter(), g = actx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.5;
  adsr(g, t, VOICE.snare * v, 0.002, 0.16);
  s.connect(bp); bp.connect(g); route(g, 0, 0.14, 0.9);      // the big gated snare
  s.start(t); s.stop(t + 0.24);
  [178, 320].forEach((f, i) => {
    const o = actx.createOscillator(), og = actx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.1, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    adsr(og, t, VOICE.snare * v * (i ? 0.30 : 0.55), 0.001, 0.09);
    o.connect(og); route(og, 0, 0, 0.4);
    o.start(t); o.stop(t + 0.12);
  });
}
function synClap(t, v) {
  v = v == null ? 1 : v;
  for (let i = 0; i < 4; i++) {
    const s = noiseSrc(), bp = actx.createBiquadFilter(), g = actx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.3;
    adsr(g, t + i * 0.011, VOICE.clap * v * (i === 3 ? 1 : 0.6), 0.001, i === 3 ? 0.14 : 0.02);
    s.connect(bp); bp.connect(g); route(g, 0, 0.1, 0.55);
    s.start(t + i * 0.011); s.stop(t + i * 0.011 + 0.2);
  }
}
function synHat(t, open, v) {
  v = v == null ? 1 : v;
  const s = noiseSrc(), hp = actx.createBiquadFilter(), g = actx.createGain();
  hp.type = 'highpass'; hp.frequency.value = open ? 7800 : 9400;
  const dur = open ? 0.26 : 0.034;
  adsr(g, t, (open ? VOICE.openhat : VOICE.hat) * v, 0.001, dur);
  const p = panner(open ? 0.14 : -0.18);
  s.connect(hp); hp.connect(g); g.connect(p); route(p, 0, open ? 0.18 : 0.04, 0);
  s.start(t); s.stop(t + dur + 0.03);
}
function synCrash(t, v) {
  v = v == null ? 1 : v;
  const s = noiseSrc(), hp = actx.createBiquadFilter(), g = actx.createGain();
  hp.type = 'highpass'; hp.frequency.value = 5200;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(VOICE.crash * v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  s.connect(hp); hp.connect(g); route(g, 0, 0.5, 0);
  s.start(t); s.stop(t + 1.5);
}
function synTom(t, f, v) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.24);
  adsr(g, t, VOICE.tom * (v == null ? 1 : v), 0.003, 0.26);
  o.connect(g); route(g, 0, 0.22, 0.2);
  o.start(t); o.stop(t + 0.32);
}
/* octave-gallop bass: saw through a snappy filter, plus a sub sine underneath */
function synBass(t, f, dur, v) {
  v = v == null ? 1 : v;
  const lp = actx.createBiquadFilter(), g = actx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 6;
  lp.frequency.setValueAtTime(220, t);
  lp.frequency.linearRampToValueAtTime(1500, t + 0.012);
  lp.frequency.exponentialRampToValueAtTime(260, t + dur);
  const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
  o.connect(lp); o.start(t); o.stop(t + dur + 0.03);
  const sb = actx.createOscillator(), sg = actx.createGain();
  sb.type = 'sine'; sb.frequency.value = f <= 60 ? f : f / 2; sg.gain.value = 0.55;
  sb.connect(sg); sg.connect(lp); sb.start(t); sb.stop(t + dur + 0.03);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(VOICE.bass * v, t + 0.006);
  g.gain.setValueAtTime(VOICE.bass * v, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g); route(g, 1, 0.05, 0);
}
/* supersaw pad: three detuned saws per note, spread wide, slow filter open */
function synPad(t, freqs, dur, bright) {
  const lp = actx.createBiquadFilter(), g = actx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 1.8;
  const top = bright ? 3400 : 1900;
  lp.frequency.setValueAtTime(380, t);
  lp.frequency.linearRampToValueAtTime(top, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(600, t + dur);
  freqs.forEach((f) => {
    [[-11, -0.7], [0, 0], [11, 0.7]].forEach(([cents, pan]) => {
      const o = actx.createOscillator(), p = panner(pan);
      const vg = actx.createGain(); vg.gain.value = VOICE.pad;
      o.type = 'sawtooth';
      o.frequency.value = f * Math.pow(2, cents / 1200);
      o.connect(vg); vg.connect(p); p.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    });
  });
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1, t + 0.25);
  g.gain.setValueAtTime(1, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g); route(g, 1, 0.6, 0);
}
/* offbeat chord stab: short, bright, the disco pump */
function synPluck(t, freqs, v) {
  const lp = actx.createBiquadFilter(), g = actx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 5;
  lp.frequency.setValueAtTime(5200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
  freqs.forEach((f, i) => {
    const o = actx.createOscillator(), p = panner((i - 1) * 0.35);
    o.type = i === 1 ? 'square' : 'sawtooth'; o.frequency.value = f;
    const vg = actx.createGain(); vg.gain.value = VOICE.pluck / Math.sqrt(freqs.length);
    o.connect(vg); vg.connect(p); p.connect(lp);
    o.start(t); o.stop(t + 0.2);
  });
  adsr(g, t, v == null ? 1 : v, 0.003, 0.15);
  lp.connect(g); route(g, 1, 0.3, 0, 0.5);
}
/* 16th arp: bright square, into the dotted-eighth echo */
function synArp(t, f, v) {
  const o = actx.createOscillator(), g = actx.createGain();
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4600; lp.Q.value = 2;
  o.type = 'square'; o.frequency.value = f;
  adsr(g, t, VOICE.arp * (v == null ? 1 : v), 0.003, 0.14);
  const p = panner(Math.sin(t * 2.7) * 0.5);
  o.connect(lp); lp.connect(g); g.connect(p); route(p, 1, 0.3, 0, 0.7);
  o.start(t); o.stop(t + 0.2);
}
/* the lead: a breathy saw+triangle with delayed vibrato and portamento -- as
   close as an oscillator gets to a saxophone standing on a rooftop */
let leadPrev = 0;
function synLead(t, f, dur, v) {
  const g = actx.createGain();
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.linearRampToValueAtTime(2600, t + 0.09);
  lp.frequency.exponentialRampToValueAtTime(1300, t + dur);
  const from = leadPrev && Math.abs(leadPrev / f - 1) < 0.6 ? leadPrev : f * 0.985;
  leadPrev = f;
  const lfo = actx.createOscillator(), depth = actx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 5.4;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.32);   // vibrato arrives late, like a player
  lfo.connect(depth); lfo.start(t); lfo.stop(t + dur + 0.3);
  [['sawtooth', 1, 0], ['triangle', 0.7, 0.003], ['sawtooth', 0.35, -0.004]].forEach(([w, gn, det]) => {
    const o = actx.createOscillator(); o.type = w;
    o.frequency.setValueAtTime(from * (1 + det), t);
    o.frequency.exponentialRampToValueAtTime(f * (1 + det), t + 0.07);
    depth.connect(o.frequency);
    const vg = actx.createGain(); vg.gain.value = gn;
    o.connect(vg); vg.connect(lp); o.start(t); o.stop(t + dur + 0.3);
  });
  /* a little breath under the note */
  const br = noiseSrc(), bf = actx.createBiquadFilter(), bg = actx.createGain();
  bf.type = 'bandpass'; bf.frequency.value = f * 2; bf.Q.value = 3;
  adsr(bg, t, 0.05, 0.03, dur * 0.5);
  br.connect(bf); bf.connect(bg); bg.connect(lp); br.start(t); br.stop(t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(VOICE.lead * (v == null ? 1 : v), t + 0.04);
  g.gain.setValueAtTime(VOICE.lead * (v == null ? 1 : v), t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  lp.connect(g); route(g, 0, 0.62, 0, 0.35);
}
/* a bar-long build into the next phrase */
function synRiser(t, dur, v) {
  v = v == null ? 1 : v;
  const s = noiseSrc(), bp = actx.createBiquadFilter(), g = actx.createGain();
  bp.type = 'bandpass'; bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(VOICE.riser * v, t + dur * 0.96);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
  s.connect(bp); bp.connect(g); route(g, 0, 0.5, 0);
  s.start(t); s.stop(t + dur + 0.05);
}

/* ------------------------------------------------------------- the track */
/* vi - IV - I - V in C: Am F C G. The Midnight's whole catalogue lives on this
   rotation. One bar each, twice through an 8-bar phrase; bars 4-7 are the
   chorus, where every layer that intensity allows is in. */
const ROOTS = [55.00, 43.65, 65.41, 49.00];                 // A1 F1 C2 G1
const CHORD = [
  [220.00, 261.63, 329.63, 440.00],   // Am (add octave)
  [174.61, 220.00, 261.63, 349.23],   // F
  [261.63, 329.63, 392.00, 523.25],   // C
  [196.00, 246.94, 293.66, 392.00],   // G
];
const STAB = [
  [440.00, 523.25, 659.25],
  [349.23, 440.00, 523.25],
  [392.00, 523.25, 659.25],
  [392.00, 493.88, 587.33],
];
/* 16 arp steps per bar over the chord tones, two octaves up */
const ARPSEQ = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 2, 1, 2, 1];
/* the hook: step -> [freq, beats], eight bars */
const LEAD = [
  { 0: [659.25, 1.4], 6: [523.25, 0.5], 8: [440.00, 2.0] },
  { 0: [523.25, 1.0], 4: [587.33, 1.0], 8: [698.46, 2.0] },
  { 0: [659.25, 3.0], 12: [783.99, 1.0] },
  { 0: [587.33, 2.0], 8: [493.88, 1.0], 12: [587.33, 1.0] },
  { 0: [880.00, 2.0], 8: [783.99, 1.0], 12: [659.25, 1.0] },
  { 0: [698.46, 1.5], 6: [659.25, 0.5], 8: [523.25, 2.0] },
  { 0: [783.99, 2.0], 8: [659.25, 2.0] },
  { 0: [587.33, 1.0], 4: [659.25, 1.0], 8: [783.99, 1.0], 12: [880.00, 1.0] },
];
const BOSS_ROOTS = [55.00, 49.00, 43.65, 41.20];            // A1 G1 F1 E1 -- the descent
const BOSS_CHORD = [
  [220.00, 261.63, 329.63], [196.00, 246.94, 293.66],
  [174.61, 220.00, 261.63], [164.81, 207.65, 246.94],
];

function scheduleUntil(horizon) {
  if (!actx || !musicOn) return;
  const prevBus = voiceBus;
  voiceBus = busMusic;
  while (stepTime < horizon) {
    const step = nextStep % 16;
    const bar = Math.floor(nextStep / 16);
    const pbar = bar % 8;                    // position in the 8-bar phrase
    const ch = pbar % 4;                     // which chord
    const chorus = pbar >= 4;
    const lastBar = pbar === 7;
    const t = stepTime;
    /* the chorus lifts one layer above whatever the room is doing */
    const lvl = Math.min(2, intensity + (chorus ? 1 : 0));

    if (bossMode) {
      const bch = pbar % 4;
      if (step === 0 || step === 8 || step === 11) synKick(t, step === 0 ? 1 : 0.8);
      if (step === 4 || step === 12) { synSnare(t); synClap(t, 0.8); }
      if (step % 2 === 0) synHat(t, false, step % 4 === 0 ? 1 : 0.5);
      if (step === 14) synTom(t, 150, 0.8);
      if (step % 2 === 0) synBass(t, BOSS_ROOTS[bch] * (step % 4 === 2 ? 2 : 1), STEP * 1.7, 1.05);
      if (step === 0) synPad(t, BOSS_CHORD[bch], BAR, false);
      if (chorus && step % 4 === 2) synPluck(t, BOSS_CHORD[bch].map((f) => f * 2), 0.8);
      if (lastBar && step >= 8 && step % 2 === 0) synSnare(t, 0.6 + (step - 8) * 0.06);
      if (lastBar && step === 0) synRiser(t, BAR, 0.9);
      if (pbar === 0 && step === 0) synCrash(t, 0.9);
    } else {
      /* drums: four on the floor, big snare + clap on 2 and 4, tss on the offbeats */
      if (step % 4 === 0) synKick(t, step === 0 ? 1 : 0.92);
      if (step === 4 || step === 12) { synSnare(t); if (lvl >= 1) synClap(t, 0.85); }
      if (step % 4 === 2) synHat(t, false, 1);
      if (lvl >= 1 && step % 4 === 0) synHat(t, false, 0.45);
      if (lvl >= 1 && step === 14) synHat(t, true, 0.8);
      if (lvl >= 2 && step === 15) synSnare(t, 0.35);
      /* the gallop: root on the beat, octave between */
      const root = ROOTS[ch];
      synBass(t, step % 2 === 0 ? root : root * 2, STEP * 0.92, step % 4 === 0 ? 1 : 0.78);
      /* pad every bar, brighter in the chorus */
      if (step === 0) synPad(t, CHORD[ch], BAR * 0.99, chorus);
      /* offbeat stabs */
      if (lvl >= 1 && step % 4 === 2) synPluck(t, STAB[ch], chorus ? 1 : 0.8);
      /* 16th arp */
      if (lvl >= 1) synArp(t, CHORD[ch][ARPSEQ[step]] * 2, step % 4 === 0 ? 1 : 0.7);
      /* the hook */
      if (lvl >= 2 && LEAD[pbar][step]) {
        const note = LEAD[pbar][step];
        synLead(t, note[0], SPB * note[1], 1);
      }
      /* phrase dynamics: a small fill at bar 3, a build and roll into bar 0 */
      if (pbar === 3 && (step === 14 || step === 15)) synSnare(t, 0.7);
      if (lastBar && step === 0) synRiser(t, BAR, 1);
      if (lastBar && step >= 8 && step % 2 === 0) synSnare(t, 0.55 + (step - 8) * 0.06);
      if (lastBar && step >= 12) synSnare(t, 0.85);
      if (pbar === 0 && step === 0) synCrash(t, 1);
    }

    nextStep++;
    stepTime += STEP;
  }
  voiceBus = prevBus;
}
function schedule() { if (actx) scheduleUntil(actx.currentTime + 0.20); }
/* schedule a stretch up front -- offline rendering has no setInterval */
function musicPrime(seconds) { scheduleUntil(stepTime + seconds); }

function musicStart() {
  if (!actx || musicOn) return;
  musicOn = true;
  nextStep = 0; leadPrev = 0;
  stepTime = actx.currentTime + 0.10;
  clearInterval(schedTimer);
  schedTimer = setInterval(schedule, 25);
  schedule();
}
function musicStop() { musicOn = false; clearInterval(schedTimer); }
/* taps: when hosting, the snapshot layer mirrors cues and music state to guests */
let sfxTap = null, musicTap = null;
function setAudioTaps(s, m) { sfxTap = s; musicTap = m; }
function musicIntensity(n) { intensity = n; if (musicTap) musicTap('i', n); }
function musicBoss(on) {
  if (musicTap) musicTap('b', !!on);
  const was = bossMode;
  bossMode = !!on;
  if (on && !was && actx && !muted) sfx('bossHit');
}

/* ------------------------------------------------------------------- sfx */
function sweep(t, dur, f0, f1, peak, q) {
  const s = noiseSrc(), bp = actx.createBiquadFilter(), g = actx.createGain();
  bp.type = 'bandpass'; bp.Q.value = q || 1.2;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  adsr(g, t, peak, 0.008, dur);
  s.connect(bp); bp.connect(g); route(g, 0, 0.18, 0);
  s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, f0, f1, dur, peak, wave, plate) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = wave || 'sine';
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  adsr(g, t, peak, 0.004, dur);
  o.connect(g); route(g, 0, plate == null ? 0.25 : plate, 0);
  o.start(t); o.stop(t + dur + 0.05);
}
function chord(t, freqs, dur, peak, wave) {
  freqs.forEach((f) => tone(t, f, f, dur, peak / Math.sqrt(freqs.length), wave || 'sawtooth', 0.6));
}
/* the SLAM: sub thump + metal transient + a gated tail. Used on every impact
   the UI wants you to feel. */
function slam(t, v) {
  v = v == null ? 1 : v;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(VOICE.slam * v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  o.connect(g); route(g, 0, 0.10, 0.25);
  o.start(t); o.stop(t + 0.38);

  const s = noiseSrc(), bp = actx.createBiquadFilter(), ng = actx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.7;
  adsr(ng, t, 0.26 * v, 0.001, 0.09);
  s.connect(bp); bp.connect(ng); route(ng, 0, 0.12, 0.55);
  s.start(t); s.stop(t + 0.14);

  const r = actx.createOscillator(), rg = actx.createGain();
  r.type = 'triangle'; r.frequency.setValueAtTime(880, t);
  r.frequency.exponentialRampToValueAtTime(300, t + 0.14);
  adsr(rg, t, 0.10 * v, 0.001, 0.14);
  r.connect(rg); route(rg, 0, 0.3, 0);
  r.start(t); r.stop(t + 0.2);
}
function riser(t, dur, peak) {
  const s = noiseSrc(), bp = actx.createBiquadFilter(), g = actx.createGain();
  bp.type = 'bandpass'; bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(6500, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.92);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  s.connect(bp); bp.connect(g); route(g, 0, 0.4, 0);
  s.start(t); s.stop(t + dur + 0.1);
  const o = actx.createOscillator(), og = actx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(900, t + dur);
  adsr(og, t, peak * 0.4, dur * 0.9, 0.08);
  o.connect(og); route(og, 0, 0.4, 0);
  o.start(t); o.stop(t + dur + 0.1);
}

/* Per-sound output trim. Solved by rendering each cue offline and comparing
   its peak against a target, so the mix is measured rather than guessed.
   Re-solve them by opening build/levels.html (see README, "Sound levels"). */
const TRIM = {
  click: 5.895, reel: 6.267, hit: 5.734, swing: 8.996,
  bow: 4.624, hurt: 5.284, smite: 5.585, equip: 1.546,
  volley: 6.442, cleave: 4.065, crit: 2.478, heal: 1.337,
  rez: 1.226, loot: 2.099, enrage: 1.378, levelup: 2.002,
  bene: 2.122, stage: 2.537, down: 2.416, lootEpic: 1.835,
  shock: 5.868, jackpot: 2.887, lock: 9.225, wipe: 2.475,
  win: 2.524, bossHit: 2.369,
  chest: 3.49, relicGood: 2.67, relicBad: 2.6, mimic: 3.25, still: 2.0,
  key: 1.53, keyTurn: 2.3, ward: 2.1, fanfare: 1, ach: 1.9,
  slash: 3.0, shadow: 2.2, torch: 2.4, grind: 1.6, unchain: 2.0,
};

const lastAt = {};
function sfx(name, opt) {
  if (sfxTap) sfxTap(name, opt);
  if (!actx || muted) return;
  opt = opt || {};
  const t = actx.currentTime + 0.002;
  const gap = opt.gap == null ? 0.045 : opt.gap;
  if (lastAt[name] && t - lastAt[name] < gap) return;
  lastAt[name] = t;
  voiceBus = busSfx;
  const v = (opt.v == null ? 1 : opt.v) * (TRIM[name] || 1);
  const M = VOICE;

  switch (name) {
    /* --- combat --- */
    case 'swing':   sweep(t, 0.15, 900, 3000, M.sfxSoft * v, 1.5); break;
    case 'cleave':  sweep(t, 0.20, 700, 3600, M.sfxMid * v, 1.2);
                    tone(t, 240, 120, 0.14, M.sfxSoft * v, 'triangle'); break;
    case 'bow':     tone(t, 1300, 520, 0.05, M.sfxSoft * v, 'triangle', 0.15);
                    sweep(t, 0.09, 2600, 6000, M.sfxSoft * 0.5 * v, 2); break;
    case 'hit':     tone(t, 300, 130, 0.045, M.sfxSoft * 0.8 * v, 'square', 0.1); break;
    case 'crit':    tone(t, 1760, 1760, 0.22, M.sfxMid * v, 'triangle', 0.75);
                    tone(t, 2640, 2640, 0.18, M.sfxSoft * v, 'sine', 0.75); break;
    case 'smite':   tone(t, 1500, 420, 0.12, M.sfxSoft * v, 'sawtooth', 0.4); break;
    case 'heal':    [523.25, 659.25, 880].forEach((f, i) =>
                      tone(t + i * 0.045, f, f, 0.34, M.sfxSoft * 0.85 * v, 'triangle', 0.8)); break;
    case 'bene':    chord(t, [392, 523.25, 659.25, 784], 1.1, M.sfxMid * v, 'sawtooth');
                    riser(t, 0.42, M.sfxSoft * v); break;
    case 'shock':   slam(t, v); sweep(t, 0.3, 500, 120, M.sfxMid * v, 0.8); break;
    case 'volley':  for (let i = 0; i < 5; i++) sweep(t + i * 0.04, 0.11, 2200, 5600, M.sfxSoft * 0.5 * v, 2.2); break;
    /* --- party --- */
    case 'hurt':    tone(t, 200, 84, 0.10, M.sfxSoft * v, 'sine', 0.1); break;
    case 'down':    tone(t, 440, 60, 0.75, M.sfxMid * v, 'sawtooth', 0.7);
                    slam(t, 0.55 * v); break;
    case 'rez':     [392, 523.25, 659.25, 880].forEach((f, i) =>
                      tone(t + i * 0.05, f, f, 0.5, M.sfxSoft * v, 'triangle', 0.85)); break;
    /* --- level up: riser, ticks, three slams --- */
    case 'levelup': riser(t, 0.42, M.sfxMid * v); break;
    case 'reel':    tone(t, 2100, 2100, 0.014, M.sfxSoft * 0.55 * v, 'square', 0.05); break;
    case 'lock':    slam(t, v); break;
    case 'jackpot': [523.25, 659.25, 784, 1046.5].forEach((f, i) =>
                      tone(t + i * 0.055, f, f, 0.42, M.sfxMid * 0.7 * v, 'sawtooth', 0.7));
                    slam(t, 0.7 * v); break;
    /* --- loot --- */
    case 'loot':     chord(t, [349.23, 440, 523.25], 0.6, M.sfxMid * v, 'sawtooth'); break;
    case 'lootEpic': chord(t, [349.23, 440, 523.25, 698.46], 0.9, M.sfxHard * v, 'sawtooth');
                     riser(t, 0.3, M.sfxSoft * v); break;
    case 'equip':    tone(t, 2400, 1400, 0.05, M.sfxSoft * v, 'square', 0.3);
                     tone(t + 0.05, 1600, 1100, 0.07, M.sfxSoft * 0.7 * v, 'square', 0.3); break;
    case 'click':    tone(t, 1500, 1500, 0.02, M.sfxSoft * 0.45 * v, 'square', 0.05); break;
    /* --- run beats --- */
    case 'stage':    chord(t, [220, 329.63, 440], 1.0, M.sfxMid * v, 'sawtooth');
                     riser(t, 0.5, M.sfxSoft * v); break;
    case 'bossHit':  slam(t, v);
                     chord(t + 0.02, [110, 164.81, 207.65], 1.4, M.sfxHard * v, 'sawtooth');
                     synTom(t + 0.3, 160, v); synTom(t + 0.45, 130, v); break;
    case 'enrage':   for (let i = 0; i < 3; i++) tone(t + i * 0.2, 660, 990, 0.17, M.sfxMid * v, 'sawtooth', 0.4); break;
    /* --- relic chests --- */
    case 'chest':    slam(t, 0.6 * v);
                     [784, 1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
                       tone(t + 0.06 + i * 0.04, f, f, 0.26, M.sfxSoft * 0.6 * v, 'triangle', 0.8)); break;
    case 'relicGood': slam(t, 0.85 * v);
                     [523.25, 659.25, 784, 1046.5, 1318.5].forEach((f, i) =>
                       tone(t + 0.03 + i * 0.05, f, f, 0.55, M.sfxMid * 0.75 * v, 'sawtooth', 0.75)); break;
    case 'relicBad': slam(t, 1.1 * v);
                     [466.16, 415.3, 349.23, 311.13].forEach((f, i) =>
                       tone(t + 0.04 + i * 0.09, f, f * 0.94, 0.5, M.sfxMid * 0.8 * v, 'sawtooth', 0.7));
                     sweep(t, 0.6, 1800, 140, M.sfxMid * v, 0.9); break;
    case 'mimic':    slam(t, 0.8 * v);
                     tone(t, 180, 60, 0.5, M.sfxMid * v, 'sawtooth', 0.6);
                     for (let i = 0; i < 4; i++) tone(t + 0.08 + i * 0.07, 900 - i * 120, 700 - i * 120, 0.06, M.sfxSoft * v, 'square', 0.2); break;
    /* --- the door --- */
    case 'key':      [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
                       tone(t + i * 0.045, f, f, 0.5, M.sfxMid * 0.7 * v, 'triangle', 0.85));
                     sweep(t + 0.1, 0.35, 3000, 9000, M.sfxSoft * 0.5 * v, 2.5); break;
    case 'keyTurn':  slam(t, 0.7 * v);
                     tone(t + 0.02, 90, 60, 0.7, M.sfxMid * v, 'sawtooth', 0.6);
                     tone(t + 0.22, 130, 95, 0.5, M.sfxMid * 0.8 * v, 'square', 0.5);
                     chord(t + 0.35, [220, 277.18, 329.63, 440], 1.6, M.sfxMid * v, 'sawtooth'); break;
    case 'ward':     sweep(t, 0.55, 60, 900, M.sfxMid * v, 0.7);
                     tone(t, 55, 38, 0.6, M.sfxMid * v, 'sawtooth', 0.4);
                     tone(t + 0.3, 660, 620, 0.25, M.sfxMid * 0.7 * v, 'sawtooth', 0.6);
                     tone(t + 0.3, 932, 880, 0.25, M.sfxSoft * v, 'sawtooth', 0.6); break;
    case 'ach':      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) =>
                       tone(t + i * 0.07, f, f, 0.45, M.sfxMid * 0.6 * v, 'triangle', 0.85));
                     tone(t + 0.28, 2093, 2093, 0.5, M.sfxSoft * 0.6 * v, 'sine', 0.9); break;
    case 'fanfare':  [[523.25,0],[659.25,0.12],[783.99,0.24],[1046.5,0.36],[1318.5,0.72],[1046.5,0.9],[1567.98,1.1]].forEach((n) =>
                       tone(t + n[1], n[0], n[0], 0.9, M.sfxMid * 0.8 * v, 'sawtooth', 0.85));
                     chord(t + 1.1, [523.25, 659.25, 783.99, 1046.5], 2.2, M.sfxMid * v, 'sawtooth');
                     slam(t + 1.1, 0.7 * v); break;
    case 'still':    sweep(t, 0.7, 7000, 220, M.sfxMid * v, 1.4);
                     tone(t + 0.05, 1568, 1568, 1.1, M.sfxSoft * 0.7 * v, 'sine', 0.95);
                     tone(t + 0.05, 2349, 2349, 0.9, M.sfxSoft * 0.4 * v, 'sine', 0.95); break;
    case 'wipe':     tone(t, 330, 40, 1.7, M.sfxHard * v, 'sawtooth', 0.9);
                     slam(t, 0.9 * v); break;
    case 'win':      [523.25, 659.25, 784, 1046.5].forEach((f, i) =>
                       tone(t + i * 0.11, f, f, 0.9, M.sfxMid * v, 'sawtooth', 0.85));
                     slam(t, 0.8 * v); break;
    /* the Shade */
    case 'slash':    sweep(t, 0.09, 2600, 6500, M.sfxSoft * 0.8 * v, 2.4); break;
    case 'shadow':   sweep(t, 0.28, 3200, 180, M.sfxMid * v, 1.1);
                     tone(t, 110, 70, 0.3, M.sfxMid * 0.6 * v, 'sawtooth', 0.4); break;
    /* the secret */
    case 'torch':    sweep(t, 0.35, 200, 2400, M.sfxMid * v, 0.9);
                     tone(t + 0.05, 880, 1320, 0.4, M.sfxSoft * 0.6 * v, 'triangle', 0.7); break;
    case 'grind':    tone(t, 48, 40, 1.0, M.sfxHard * v, 'sawtooth', 0.6);
                     sweep(t, 0.9, 90, 60, M.sfxMid * v, 0.5); slam(t + 0.85, 0.6 * v); break;
    case 'unchain':  slam(t, 0.5 * v); tone(t + 0.02, 2400, 900, 0.12, M.sfxSoft * v, 'square', 0.4);
                     sweep(t + 0.1, 0.6, 400, 4200, M.sfxMid * 0.7 * v, 1.6); break;
    default: break;
  }
}

/* ------------------------------------------------------- offline metering */
/* Renders a sound with no speakers attached so its level can be measured.
   Used by the level check in the README rather than tuning gains by ear. */
async function audioRender(fn, seconds) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const keepCtx = actx, keepMuted = muted, keepOn = musicOn;
  const off = new OAC(2, Math.ceil(44100 * seconds), 44100);
  muted = false; musicOn = false; nextStep = 0; leadPrev = 0;
  audioInit(off);
  fn();
  const buf = await off.startRendering();
  actx = keepCtx; muted = keepMuted; musicOn = keepOn;
  if (actx) audioInit();
  let peak = 0, sum = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
  }
  const db = (x) => (x <= 0 ? -Infinity : 20 * Math.log10(x));
  return { peak: +db(peak).toFixed(2), rms: +db(Math.sqrt(sum / n)).toFixed(2) };
}

export {
  audioInit, audioToggle, audioMuted, sfx, audioRender, TRIM,
  setVolume, getVolume,
  musicStart, musicStop, musicIntensity, musicBoss, musicPrime, setAudioTaps,
};
