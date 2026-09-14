import test from 'node:test';
import assert from 'node:assert/strict';
import { step, launch, airborne, ensureZ, AIR } from '../src/physics.js';

test('a launched object rises, falls, bounces once and rests', () => {
  const o = ensureZ({ x: 0, y: 0 });
  launch(o, 420, 1, 0, 90);
  let lands = 0, peak = 0, t = 0;
  while (t < 3) { if (step(o, 1 / 120)) lands++; peak = Math.max(peak, o.z); t += 1 / 120; }
  assert.ok(peak > 40, 'it got some air: ' + peak);
  assert.equal(o.z, 0);
  assert.equal(lands, 2, 'one bounce = two landings, got ' + lands);
  assert.ok(o.x > 10, 'it was carried along the blow: ' + o.x);
  assert.equal(o.vz, 0);
});

test('airborne flips at AIR and a resting object never lands again', () => {
  const o = ensureZ({ x: 0, y: 0 });
  assert.equal(airborne(o), false);
  o.z = AIR + 1; assert.equal(airborne(o), true);
  o.z = 0; o.vz = 0;
  assert.equal(step(o, 0.016), false);
  assert.equal(o.z, 0);
});

test('launch never cancels upward motion already in progress', () => {
  const o = ensureZ({ x: 0, y: 0 });
  launch(o, 500, 0, 0, 0);
  launch(o, 100, 0, 0, 0);
  assert.equal(o.vz, 500);
});
