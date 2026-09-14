/**
 * The vertical axis. Everything on the floor has z=0; a launch gives it vz
 * and an optional horizontal carry (ax, ay) that decays while it is in the
 * air. One meaningful bounce, then it rests. Collision keeps using (x, y);
 * `airborne` is what the rest of the game asks before touching something.
 */

const G = 1500;          // px/s^2
const AIR = 6;           // above this, you are off the floor
const BOUNCE = 0.42;     // restitution
const MIN_BOUNCE = 60;   // a rebound slower than this is not worth drawing

function ensureZ(o) {
  if (o.z == null) o.z = 0;
  if (o.vz == null) o.vz = 0;
  if (o.ax == null) o.ax = 0;
  if (o.ay == null) o.ay = 0;
  if (o.bounces == null) o.bounces = 0;
  return o;
}

function launch(o, vz, dirX, dirY, push) {
  ensureZ(o);
  o.vz = Math.max(o.vz, vz);
  const p = push || 0;
  o.ax = (dirX || 0) * p; o.ay = (dirY || 0) * p;
  if (o.z <= 0) o.z = 0.01;
  o.bounces = 0;
  return o;
}

function airborne(o) { return o != null && o.z > AIR; }

/* returns true on the frame the object touches the floor */
function step(o, dt, onLand) {
  if (o.z <= 0 && o.vz <= 0) { o.z = 0; o.vz = 0; return false; }
  o.vz -= G * dt;
  o.z += o.vz * dt;
  if (o.ax || o.ay) {
    o.x += o.ax * dt; o.y += o.ay * dt;
    const k = Math.pow(0.35, dt);
    o.ax *= k; o.ay *= k;
  }
  if (o.z <= 0) {
    const speed = -o.vz;
    o.z = 0;
    /* one bounce, and only if it will be visible */
    if (o.bounces < 1 && speed * BOUNCE > MIN_BOUNCE) { o.vz = speed * BOUNCE; o.bounces++; }
    else { o.vz = 0; o.ax = 0; o.ay = 0; }
    if (onLand) onLand(o, speed);
    return true;
  }
  return false;
}

export { G, AIR, ensureZ, launch, airborne, step };
