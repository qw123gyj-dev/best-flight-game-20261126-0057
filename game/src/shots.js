// The screenshot scenes behind ?shot=start|play|boss|end.
// Each one plays the real rules forward from a fresh world, steered by a
// simple autopilot (chase the next ring, keep the speed up, fire when a boss
// or a drone is ahead), so every frame is what a short game really looks
// like and the same seed always gives the same frame.

import { BOSSES, LANDING, STEP, ZONES } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_DONE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 30;
const SAMPLE = STEP;

/** Steer toward the next ring, keep the throttle open, fire at targets. */
function autopilot(state) {
  const next = state.rings.find((r) => r.active && !r.passed && r.z > state.z);
  let steer = 0;
  let pitch = 0;
  if (next) {
    steer = Math.max(-1, Math.min(1, (next.x - state.x) * 3.2));
    pitch = Math.max(-1, Math.min(1, (next.alt - state.alt) / 240));
  }
  // In a boss fight, aim the plane at the boss instead of the next ring.
  if (state.boss) {
    steer = Math.max(-1, Math.min(1, (state.boss.x - state.x) * 3));
    pitch = Math.max(-1, Math.min(1, (state.boss.alt - state.alt) / 240));
  }
  // Dodge what is dead ahead and close.
  for (const f of state.features) {
    if (!f.active) continue;
    if (f.kind !== 'balloon' && f.kind !== 'stormcloud' && f.kind !== 'drone') continue;
    const dz = f.z - state.z;
    if (dz > 0 && dz < 260 && Math.abs(f.x - state.x) < 0.12 && Math.abs(f.alt - state.alt) < 60) {
      steer = f.x > state.x ? -0.9 : 0.9;
      if (f.alt > state.alt) pitch = -0.7;
      else pitch = 0.7;
      break;
    }
  }
  // Never fly into the ground: pull up early.
  if (state.alt < 120 && pitch < 0.2) pitch = 0.55;
  if (state.alt > 800) pitch = -0.4;
  const firing = Boolean(state.boss) || state.features.some((f) => f.active && f.kind === 'drone' && f.z - state.z > 0 && f.z - state.z < 700);
  return {
    steer, pitch,
    throttleUp: state.speed < 260,
    throttleDown: state.speed > 300,
    boost: false,
    firing,
  };
}

/** A glideslope controller for the landing scene: ride a 14% slope down to the strip. */
function landingPilot(state) {
  const touchdown = LANDING.runwayZ + 300;
  const desired = Math.max(-12, (touchdown - state.z) * 0.14);
  const pitch = Math.max(-0.6, Math.min(0.3, (desired - state.alt) / 120));
  return {
    steer: Math.max(-1, Math.min(1, (0 - state.x) * 4)),
    pitch,
    throttleUp: state.speed < 145,
    throttleDown: state.speed > 158,
    boost: false,
    firing: false,
  };
}

function runFor(world, seconds, pilot) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(SAMPLE, pilot(world.state));
    if (events & EVENT_OVER) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Any other name is the title scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'end') {
    // Title: spool up, lift off the runway, climb into the valley.
    runFor(world, START_SECONDS, (s) => ({
      steer: 0, pitch: s.speed > 150 ? 0.45 : 0, throttleUp: true, throttleDown: false, boost: false, firing: false,
    }));
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    runFor(world, PLAY_SECONDS, autopilot);
    const over = state.phase === 'over';
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  if (name === 'boss') {
    // Jump to the canyon's end, where the Galleon waits, then fight it.
    state.zoneIndex = 1;
    state.z = BOSSES.galleon.z - 1400;
    state.alt = 360;
    state.speed = 250;
    state.throttle = 0.7;
    state.fuel = 70;
    state.phase = 'fly';
    state.nextSeg = Math.floor(state.z / 100);
    state.features = [];
    state.rings = world.allRings.filter((r) => r.z >= ZONES[1].startZ && r.z < ZONES[1].endZ);
    let passed = 0;
    for (const r of state.rings) {
      if (r.z < state.z) { r.passed = true; passed += 1; }
    }
    state.ringsPassed = passed;
    state.ringsNeeded = ZONES[1].rings;
    state.score = 1450;
    state.stats.rings = passed;
    // Close in without firing, so the Galleon is still up when the frame is taken.
    const quiet = (s) => ({ ...autopilot(s), firing: false });
    for (let i = 0; i < 60 * 12; i += 1) {
      world.step(SAMPLE, quiet(state));
      if (state.boss) break;
    }
    // Then a short exchange: guns hot, flak in the air, boss still flying.
    if (state.boss) runFor(world, 3, autopilot);
    const over = state.phase === 'over';
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  // End: the landing leg — on the glideslope to the Skyhaven runway.
  state.zoneIndex = 2;
  state.z = LANDING.runwayZ - 1000;
  state.x = 0.02;
  state.alt = 150;
  state.speed = 165;
  state.throttle = 0.45;
  state.fuel = 62;
  state.hull = 84;
  state.phase = 'landing';
  state.bossDefeated.tempest = true; // the Queen is already down for this scene
  state.nextSeg = Math.floor(state.z / 100);
  state.features = [];
  state.score = 2840;
  state.stats.rings = 19;
  state.stats.kills = 7;
  state.stats.pickups = 6;
  state.rings = world.allRings.filter((r) => r.z >= ZONES[2].startZ && r.z < ZONES[2].endZ);
  for (const r of state.rings) r.passed = true;
  state.ringsPassed = 8;
  state.ringsNeeded = 8;
  for (let i = 0; i < 1200; i += 1) {
    const events = world.step(SAMPLE, landingPilot(state));
    if (state.phase === 'done') break;
    if (events & EVENT_OVER) break;
  }
  const over = state.phase === 'over';
  return { screen: over ? SCREEN_OVER : state.phase === 'done' ? SCREEN_DONE : SCREEN_PLAY, best: state.score };
}
