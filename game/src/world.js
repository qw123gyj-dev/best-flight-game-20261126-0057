// SKYHAWK's world: one continuous sortie from takeoff to landing.
// The plane flies downrange along +z. The corridor is x in [-1, 1]
// (about 500 m either side of the centreline) and altitude is metres above
// the ground. Features are generated per 100 m segment from a hash of the
// segment number, so the same seed always builds the same flight.

import {
  BEST_KEY, BOSSES, DESPAWN_BEHIND, FOCAL, GUST_STRENGTH, LANDING,
  PLAYER, RUNWAY, SCORE, SPAWN_AHEAD, STEP, UPGRADE_KEYS, ZONES,
} from './config.js';
import { hash1 } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_RING = 2;
export const EVENT_OVER = 4;
export const EVENT_BOSS = 8;
export const EVENT_ZONE = 16;
export const EVENT_LAND = 32;
export const EVENT_PICKUP = 64;

const SEG = 100; // metres per generated segment
const CORRIDOR_M = 500; // corridor half-width in metres
const RING_RADIUS_M = 55;
const INVULN_AFTER_HIT = 1.2;

/** Rings for a zone: evenly spaced downrange, staggered left and right. */
function buildRings(zone, rand) {
  const rings = [];
  const span = zone.endZ - zone.startZ - 1200;
  for (let i = 0; i < zone.rings; i += 1) {
    const z = zone.startZ + 700 + (span * (i + 0.5)) / zone.rings;
    rings.push({
      kind: 'ring',
      z,
      x: (rand() * 2 - 1) * 0.62,
      alt: 130 + rand() * 520,
      active: true,
      passed: false,
      index: i,
    });
  }
  return rings;
}

function segmentFeatures(n, zoneIndex, randSeed) {
  // One segment's scenery, decided by hash so order never matters.
  const z0 = n * SEG;
  const out = [];
  const zone = ZONES[zoneIndex];
  const h = hash1(n * 7919 + zoneIndex * 131);
  const h2 = hash1(n * 104729 + 17);
  const h3 = hash1(n * 31 + 977);
  if (zone.id === 'valley') {
    if (h < 0.55) out.push({ kind: 'tree', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.95, alt: 0, size: 14 + h2 * 10, active: true });
    else if (h < 0.68) out.push({ kind: 'house', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.9, alt: 0, size: 20, active: true });
    else if (h < 0.78) out.push({ kind: 'rock', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.95, alt: 0, size: 10 + h2 * 8, active: true });
    if (h2 > 0.86) out.push({ kind: 'balloon', z: z0 + 40, x: (h3 * 2 - 1) * 0.7, alt: 180 + h * 420, size: 22, active: true });
    if (h3 > 0.93) out.push({ kind: 'drone', z: z0 + 60, x: (h * 2 - 1) * 0.6, alt: 200 + h2 * 450, size: 14, vx: (h2 - 0.5) * 0.2, active: true });
    if (h2 > 0.97) out.push({ kind: 'pickup', z: z0 + 50, x: (h3 * 2 - 1) * 0.6, alt: 150 + h * 450, size: 13, up: h < 0.3 ? 'fuel' : UPGRADE_KEYS[Math.floor(h * UPGRADE_KEYS.length) % UPGRADE_KEYS.length], active: true });
    if (h < 0.3) out.push({ kind: 'cloud', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.9, alt: 750 + h2 * 200, size: 70 + h * 60, active: true });
  } else if (zone.id === 'canyon') {
    if (h < 0.5) out.push({ kind: 'rock', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.92, alt: 0, size: 16 + h2 * 22, active: true });
    if (h2 > 0.8) out.push({ kind: 'balloon', z: z0 + 40, x: (h3 * 2 - 1) * 0.6, alt: 180 + h * 420, size: 22, active: true });
    if (h3 > 0.88) out.push({ kind: 'drone', z: z0 + 60, x: (h * 2 - 1) * 0.55, alt: 200 + h2 * 450, size: 14, vx: (h2 - 0.5) * 0.3, active: true });
    if (h2 > 0.93) out.push({ kind: 'pickup', z: z0 + 50, x: (h3 * 2 - 1) * 0.55, alt: 150 + h * 450, size: 13, up: h < 0.3 ? 'fuel' : UPGRADE_KEYS[Math.floor(h * UPGRADE_KEYS.length) % UPGRADE_KEYS.length], active: true });
    if (h < 0.25) out.push({ kind: 'cloud', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.9, alt: 800 + h2 * 150, size: 60 + h * 50, active: true });
  } else {
    if (h < 0.4) out.push({ kind: 'pine', z: z0 + h2 * SEG, x: (h3 * 2 - 1) * 0.95, alt: 0, size: 18 + h2 * 12, active: true });
    if (h2 > 0.72) out.push({ kind: 'stormcloud', z: z0 + 40, x: (h3 * 2 - 1) * 0.75, alt: 220 + h * 500, size: 55 + h2 * 40, active: true });
    if (h3 > 0.86) out.push({ kind: 'drone', z: z0 + 60, x: (h * 2 - 1) * 0.6, alt: 200 + h2 * 500, size: 14, vx: (h2 - 0.5) * 0.3, active: true });
    if (h2 > 0.92) out.push({ kind: 'pickup', z: z0 + 50, x: (h3 * 2 - 1) * 0.6, alt: 150 + h * 500, size: 13, up: h < 0.3 ? 'fuel' : UPGRADE_KEYS[Math.floor(h * UPGRADE_KEYS.length) % UPGRADE_KEYS.length], active: true });
    if (h < 0.2) out.push({ kind: 'balloon', z: z0 + 30, x: (h3 * 2 - 1) * 0.7, alt: 200 + h * 400, size: 22, active: true });
  }
  // Nothing grows on a runway: keep ground features off both strips.
  for (const f of out) {
    if ((f.kind === 'tree' || f.kind === 'pine' || f.kind === 'house' || f.kind === 'rock')
      && (z0 < 900 || (z0 >= LANDING.runwayZ - 100 && z0 < LANDING.runwayZ + RUNWAY.length + 100))
      && Math.abs(f.x) < 0.25) {
      f.x = (f.x >= 0 ? 1 : -1) * (0.25 + hash1(n * 13 + 5) * 0.35);
    }
  }
  return out;
}

export function createWorld(rand) {
  const state = {
    time: 0,
    z: 0, x: 0, alt: 0, heading: 0, roll: 0, pitchVis: 0,
    speed: 0, throttle: 0.35, fuel: PLAYER.fuelMax, hull: PLAYER.hullMax,
    lives: PLAYER.lives, score: 0, zoneIndex: 0,
    phase: 'takeoff', // takeoff | fly | boss | landing | done | over
    ringsPassed: 0, ringsNeeded: ZONES[0].rings,
    features: [], rings: [], bullets: [], flak: [], missiles: [], particles: [],
    boss: null, bossDefeated: {},
    timers: { shield: 0, turbo: 0, twin: 0, spread: 0, missile: 0, magnet: 0, double: 0, flare: 0, autopilot: 0 },
    invuln: 0, gunTimer: 0, missileTimer: 0,
    gust: 0, gustTimer: 0, lightning: 0, lightningTimer: 4,
    banner: null, crashReason: null, landed: false,
    stats: { rings: 0, kills: 0, pickups: 0, shots: 0, hits: 0, flightTime: 0 },
    nextSeg: 0, onRunway: true, warnPullUp: false, warnFuel: false,
  };
  let rings = buildRings(ZONES[0], rand);
  let allRings = [...rings];
  for (let i = 1; i < ZONES.length; i += 1) allRings = allRings.concat(buildRings(ZONES[i], rand));

  function zone() { return ZONES[state.zoneIndex]; }

  function setBanner(text, sub, seconds) {
    state.banner = { text, sub, until: state.time + seconds };
  }

  function reset() {
    state.time = 0; state.z = 0; state.x = 0; state.alt = 0; state.heading = 0;
    state.roll = 0; state.pitchVis = 0; state.speed = 0; state.throttle = 0.35;
    state.fuel = PLAYER.fuelMax; state.hull = PLAYER.hullMax; state.lives = PLAYER.lives;
    state.score = 0; state.zoneIndex = 0; state.phase = 'takeoff';
    state.ringsPassed = 0; state.ringsNeeded = ZONES[0].rings;
    state.features = []; state.bullets = []; state.flak = []; state.missiles = []; state.particles = [];
    state.boss = null; state.bossDefeated = {};
    for (const k of Object.keys(state.timers)) state.timers[k] = 0;
    state.invuln = 0; state.gunTimer = 0; state.missileTimer = 0;
    state.gust = 0; state.gustTimer = 0; state.lightning = 0; state.lightningTimer = 4;
    state.banner = null; state.crashReason = null; state.landed = false;
    state.stats = { rings: 0, kills: 0, pickups: 0, shots: 0, hits: 0, flightTime: 0 };
    state.nextSeg = 0; state.onRunway = true;
    for (const r of allRings) { r.active = true; r.passed = false; }
    state.rings = allRings.filter((r) => r.z >= ZONES[0].startZ && r.z < ZONES[0].endZ);
    setBanner('SKYHAWK', 'Take off — full throttle, pull up gently', 4);
  }

  function addScore(n) {
    state.score += state.timers.double > 0 ? n * 2 : n;
  }

  /** A short-lived burst of debris at a world point, for hits and explosions. */
  function burst(x, alt, z, colour, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      state.particles.push({
        x, alt, z,
        vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.6) / CORRIDOR_M,
        vy: Math.sin(angle) * speed * (0.4 + Math.random() * 0.6),
        life: 0.5 + Math.random() * 0.6, maxLife: 1.1,
        size: 3 + Math.random() * 7, colour,
      });
    }
  }

  function applyPickup(up) {
    const t = state.timers;
    state.stats.pickups += 1;
    addScore(SCORE.pickup);
    switch (up) {
      case 'fuel': state.fuel = Math.min(PLAYER.fuelMax, state.fuel + 40); break;
      case 'repair': state.hull = Math.min(PLAYER.hullMax, state.hull + 35); break;
      case 'shield': t.shield = 10; break;
      case 'turbo': t.turbo = 8; break;
      case 'twin': t.twin = 20; break;
      case 'spread': t.spread = 20; break;
      case 'missile': t.missile = 15; break;
      case 'magnet': t.magnet = 12; break;
      case 'double': t.double = 20; break;
      case 'life': state.lives += 1; break;
      case 'flare': t.flare = 12; break;
      case 'autopilot': t.autopilot = 10; break;
      default: break;
    }
  }

  function damage(amount, reason) {
    if (state.invuln > 0 || state.timers.shield > 0) return EVENT_NONE;
    state.hull -= amount;
    state.invuln = INVULN_AFTER_HIT;
    if (state.hull > 0) return EVENT_HIT;
    burst(state.x, state.alt, state.z, '#ff5a3c', 26, 260);
    burst(state.x, state.alt, state.z, '#3a3f4a', 18, 180);
    state.lives -= 1;
    if (state.lives <= 0) {
      state.crashReason = reason;
      state.phase = 'over';
      return EVENT_HIT | EVENT_OVER;
    }
    // Lost an airframe: respawn at the current zone's start, hull and fuel restored.
    const zn = zone();
    state.z = zn.startZ + 120;
    state.x = 0; state.alt = 320; state.heading = 0; state.speed = 200;
    state.hull = PLAYER.hullMax; state.fuel = 60; state.invuln = 3;
    state.boss = null;
    state.phase = 'fly';
    setBanner('AIRFRAME LOST', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left — back in the air`, 3.5);
    return EVENT_HIT;
  }

  function fireBullet() {
    const spread = state.timers.spread > 0;
    const twin = state.timers.twin > 0;
    const offsets = spread ? [-0.09, 0, 0.09] : twin ? [-0.045, 0.045] : [0];
    for (const off of offsets) {
      state.bullets.push({ z: state.z + 12, x: state.x + off, alt: state.alt, life: PLAYER.bulletRange / PLAYER.bulletSpeed });
    }
    state.stats.shots += offsets.length;
  }

  function fireMissile(target) {
    state.missiles.push({ z: state.z + 12, x: state.x, alt: state.alt, target, life: 4 });
    state.stats.shots += 1;
  }

  function nearestTarget() {
    if (state.boss) return { kind: 'boss', ref: state.boss };
    let best = null;
    let bestDz = Infinity;
    for (const f of state.features) {
      if (!f.active || f.kind !== 'drone') continue;
      const dz = f.z - state.z;
      if (dz > 0 && dz < bestDz) { bestDz = dz; best = f; }
    }
    return best ? { kind: 'drone', ref: best } : null;
  }

  function spawnBoss(key) {
    const def = BOSSES[key];
    state.boss = {
      key, name: def.name, title: def.title, hp: def.hp, maxHp: def.hp,
      z: state.z + 520, x: def.x, alt: def.alt, size: def.size,
      flakTimer: 1.5, driftPhase: Math.random() * 6.28, def,
    };
    state.phase = 'boss';
    setBanner(def.title, 'Shoot it down — watch the flak', 4);
    return EVENT_BOSS;
  }

  function step(dt, control) {
    let events = EVENT_NONE;
    state.time += dt;
    state.stats.flightTime += dt;
    if (state.banner && state.time > state.banner.until) state.banner = null;
    for (const k of Object.keys(state.timers)) if (state.timers[k] > 0) state.timers[k] -= dt;
    if (state.invuln > 0) state.invuln -= dt;
    if (state.lightningTimer > 0) state.lightningTimer -= dt;
    if (state.lightning > 0) state.lightning -= dt;
    const zn = zone();

    // Storm gusts push the plane sideways.
    if (zn.storm) {
      state.gustTimer -= dt;
      if (state.gustTimer <= 0) {
        // Gusts calm near the airfield, so the landing leg stays flyable.
        const calm = state.phase === 'landing' ? 0.3 : 1;
        state.gust = (Math.random() * 2 - 1) * GUST_STRENGTH * calm;
        state.gustTimer = 1.5 + Math.random() * 2;
      }
      if (state.lightningTimer <= 0) {
        state.lightning = 0.14;
        state.lightningTimer = 5 + Math.random() * 7;
      }
    } else {
      state.gust = 0;
    }

    // Autopilot assist steers toward the next ring when it is on.
    let steer = control.steer;
    let pitchIn = control.pitch;
    if (state.timers.autopilot > 0) {
      const next = state.rings.find((r) => r.active && !r.passed && r.z > state.z);
      if (next) {
        steer = Math.max(-1, Math.min(1, (next.x - state.x) * 3));
        pitchIn = Math.max(-1, Math.min(1, (next.alt - state.alt) / 220));
      }
    }

    // Throttle: up/down keys move it, boost is the afterburner.
    if (control.throttleUp) state.throttle = Math.min(1, state.throttle + 0.5 * dt);
    if (control.throttleDown) state.throttle = Math.max(0, state.throttle - 0.5 * dt);
    const boosting = control.boost || state.timers.turbo > 0;
    const targetSpeed = state.throttle * PLAYER.maxSpeed * (boosting ? 1.6 : 1);
    const rate = PLAYER.accel * (targetSpeed > state.speed ? 1 : 0.7);
    state.speed += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - state.speed));
    if (state.speed < 0) state.speed = 0;

    // Fuel: empty tanks mean a glide, and a glide means a slow fall.
    const drain = state.throttle * PLAYER.fuelDrain * (boosting ? 2 : 1);
    state.fuel = Math.max(0, state.fuel - drain * dt);
    state.warnFuel = state.fuel < 20;
    if (state.fuel <= 0) state.throttle = Math.min(state.throttle, 0.15);

    // Steering, heading, climb.
    const speedFactor = Math.max(0, Math.min(1, state.speed / PLAYER.maxSpeed));
    state.heading += steer * 26 * speedFactor * dt;
    // On the landing leg the plane weathervanes back onto the runway heading.
    if (state.phase === 'landing') state.heading += (0 - state.heading) * Math.min(1, 0.5 * dt);
    state.x += steer * PLAYER.turnRate * speedFactor * dt + state.gust * dt;
    const corridor = zn.corridor ?? 1;
    state.x = Math.max(-corridor, Math.min(corridor, state.x));
    const airborne = state.alt > 0.5 || state.speed > 130;
    const climb = airborne ? pitchIn * PLAYER.climbRate * (0.35 + 0.65 * speedFactor) : 0;
    state.alt += climb * dt;
    state.alt = Math.max(0, Math.min(1200, state.alt));
    state.roll += (steer * PLAYER.maxRoll - state.roll) * Math.min(1, dt * 6);
    state.pitchVis += (pitchIn * 0.35 - state.pitchVis) * Math.min(1, dt * 5);
    state.warnPullUp = state.alt < 90 && climb < -8;

    // Downrange motion.
    const prevZ = state.z;
    state.z += state.speed * 0.514444 * dt;

    // On a runway while slow and level: rolling, not flying.
    state.onRunway = (state.z < 900 && state.phase === 'takeoff')
      || (state.z >= LANDING.runwayZ && state.z <= LANDING.runwayZ + RUNWAY.length && state.phase === 'landing');

    // Ground contact.
    if (state.alt <= 0 && state.phase !== 'done') {
      if (state.onRunway) {
        if (state.phase === 'landing') {
          if (Math.abs(state.x) < 0.14 && state.speed < 175) {
            state.phase = 'done';
            state.landed = true;
            addScore(SCORE.landing);
            addScore(Math.max(0, Math.round((300 - state.stats.flightTime)) * SCORE.timeBonusPerSec));
            return EVENT_LAND;
          }
          if (Math.abs(state.x) >= 0.3) {
            events |= damage(1000, 'runway');
            if (events & EVENT_OVER) return events;
          } else if (Math.abs(state.x) >= 0.14) {
            // Off the centreline but still on the strip: bounce, don't crash.
            state.alt = 12;
            state.speed *= 0.97;
          }
          // Too fast to stop: keep rolling down the strip; the overshoot check ends it.
        }
        // Rolling on a runway (takeoff roll, or a fast landing roll) is fine.
      } else {
        const reason = state.phase === 'landing' ? 'runway' : 'ground';
        events |= damage(1000, reason);
        if (events & EVENT_OVER) return events;
      }
    }
    if (state.phase === 'landing' && state.z > LANDING.runwayZ + RUNWAY.length + 250) {
      events |= damage(1000, 'overshoot');
      if (events & EVENT_OVER) return events;
    }

    // Stall: too slow to fly, the nose drops.
    if (state.speed < PLAYER.minSpeed && state.alt > 0.5 && !state.onRunway) {
      state.alt = Math.max(0, state.alt - 55 * dt);
    }

    // Populate the world ahead and prune what is behind.
    const wantSeg = Math.floor((state.z + SPAWN_AHEAD) / SEG);
    while (state.nextSeg <= wantSeg) {
      const segZone = ZONES.findIndex((z) => state.nextSeg * SEG >= z.startZ && state.nextSeg * SEG < z.endZ);
      if (segZone >= 0) state.features.push(...segmentFeatures(state.nextSeg, segZone, rand));
      state.nextSeg += 1;
    }
    state.features = state.features.filter((f) => f.z > state.z - DESPAWN_BEHIND);

    // Magnet pulls pickups and rings toward the plane.
    if (state.timers.magnet > 0) {
      for (const f of state.features) {
        if (!f.active || (f.kind !== 'pickup')) continue;
        const dz = f.z - state.z;
        if (dz > 0 && dz < 500) {
          f.x += (state.x - f.x) * dt * 2;
          f.alt += (state.alt - f.alt) * dt * 2;
        }
      }
    }

    // Drones drift sideways.
    for (const f of state.features) {
      if (f.kind === 'drone' && f.active) f.x = Math.max(-0.9, Math.min(0.9, f.x + (f.vx || 0) * dt));
    }

    // Rings: fly through one to score.
    for (const r of state.rings) {
      if (!r.active || r.passed) continue;
      if (prevZ < r.z && state.z >= r.z) {
        r.passed = true;
        const dxM = Math.abs(r.x - state.x) * CORRIDOR_M;
        const dAlt = Math.abs(r.alt - state.alt);
        if (dxM < RING_RADIUS_M && dAlt < RING_RADIUS_M) {
          state.ringsPassed += 1;
          state.stats.rings += 1;
          addScore(SCORE.ring);
          burst(r.x, r.alt, r.z, '#ffd94d', 16, 160);
          events |= EVENT_RING;
        }
      }
    }

    // Feature crossings: pickups, obstacles, drones.
    for (const f of state.features) {
      if (!f.active) continue;
      if (!(prevZ < f.z && state.z >= f.z)) continue;
      const dxM = Math.abs(f.x - state.x) * CORRIDOR_M;
      const dAlt = Math.abs(f.alt - state.alt);
      if (f.kind === 'pickup') {
        if (dxM < 45 && dAlt < 45) {
          f.active = false;
          applyPickup(f.up);
          events |= EVENT_PICKUP;
        }
      } else if (f.kind === 'balloon' || f.kind === 'stormcloud') {
        if (dxM < 40 && dAlt < 42) {
          f.active = false;
          events |= damage(25, f.kind);
        }
      } else if (f.kind === 'drone') {
        if (dxM < 32 && dAlt < 32) {
          f.active = false;
          events |= damage(30, 'drone');
        }
      } else if (f.kind === 'tree' || f.kind === 'pine' || f.kind === 'rock' || f.kind === 'house') {
        const height = f.kind === 'house' ? 26 : f.kind === 'rock' ? f.size * 0.8 : 22;
        if (state.alt < height && dxM < f.size * 0.9) {
          f.active = false;
          events |= damage(25, f.kind);
        }
      }
    }
    if (events & EVENT_OVER) return events;

    // Bosses: the Galleon waits at the end of the canyon, the Tempest Queen at the end of the storm.
    if (!state.boss && !state.bossDefeated.galleon && zn.boss === 'galleon' && state.z >= BOSSES.galleon.z - 900) {
      events |= spawnBoss('galleon');
    }
    if (!state.boss && !state.bossDefeated.tempest && zn.boss === 'tempest' && state.z >= BOSSES.tempest.z - 900) {
      events |= spawnBoss('tempest');
    }
    if (state.boss) {
      const b = state.boss;
      b.z = state.z + 480;
      b.driftPhase += dt;
      b.x = Math.sin(b.driftPhase * 0.7) * b.def.drift;
      b.alt = b.def.alt + Math.sin(b.driftPhase * 1.3) * 40;
      b.flakTimer -= dt;
      if (b.flakTimer <= 0) {
        b.flakTimer = b.def.flakInterval * (0.85 + Math.random() * 0.3);
        const spread = state.timers.flare > 0 ? 0.5 : 0.16;
        state.flak.push({
          z: b.z, x: b.x + (Math.random() * 2 - 1) * spread,
          alt: b.alt + (Math.random() * 2 - 1) * 60, speed: b.def.flakSpeed,
        });
      }
    }

    // Flak travels back toward the plane.
    for (const fl of state.flak) {
      fl.z -= fl.speed * dt;
      if (fl.z <= state.z + 8 && fl.z > state.z - 60) {
        const dxM = Math.abs(fl.x - state.x) * CORRIDOR_M;
        const dAlt = Math.abs(fl.alt - state.alt);
        if (dxM < 55 && dAlt < 55) {
          fl.dead = true;
          events |= damage(12, 'flak');
        }
      }
      if (fl.z < state.z - 80) fl.dead = true;
    }
    state.flak = state.flak.filter((fl) => !fl.dead);

    // Guns.
    state.gunTimer -= dt;
    if (control.firing && state.gunTimer <= 0 && state.phase !== 'takeoff') {
      state.gunTimer = PLAYER.gunCooldown;
      fireBullet();
    }
    state.missileTimer -= dt;
    if (state.timers.missile > 0 && state.missileTimer <= 0) {
      const target = nearestTarget();
      if (target) {
        state.missileTimer = PLAYER.missileCooldown;
        fireMissile(target);
      }
    }

    // Bullets fly downrange and hit drones or the boss.
    for (const b of state.bullets) {
      b.z += PLAYER.bulletSpeed * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      if (state.boss) {
        const boss = state.boss;
        const dxM = Math.abs(b.x - boss.x) * CORRIDOR_M;
        const dAlt = Math.abs(b.alt - boss.alt);
        if (Math.abs(b.z - boss.z) < 70 && dxM < boss.size * 0.9 && dAlt < boss.size * 0.7) {
          b.dead = true;
          boss.hp -= 5;
          state.stats.hits += 1;
          addScore(SCORE.bossHit);
          if (boss.hp <= 0) {
            state.bossDefeated[boss.key] = true;
            addScore(boss.def.reward);
            burst(boss.x, boss.alt, boss.z, '#ff5a3c', 40, 320);
            burst(boss.x, boss.alt, boss.z, '#ffd94d', 24, 220);
            state.boss = null;
            state.phase = 'fly';
            setBanner(`${boss.name} DOWN`, `+${boss.def.reward} — press on`, 3.5);
          }
          continue;
        }
      }
      for (const f of state.features) {
        if (!f.active || f.kind !== 'drone') continue;
        if (Math.abs(b.z - f.z) < 30 && Math.abs(b.x - f.x) * CORRIDOR_M < 26 && Math.abs(b.alt - f.alt) < 30) {
          b.dead = true;
          f.active = false;
          burst(f.x, f.alt, f.z, '#ff8a3c', 14, 180);
          state.stats.kills += 1;
          state.stats.hits += 1;
          addScore(SCORE.kill);
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => !b.dead);

    // Homing missiles steer toward their target.
    for (const m of state.missiles) {
      m.life -= dt;
      const t = m.target;
      if (!t || (t.kind === 'boss' && !state.boss) || (t.kind === 'drone' && !t.ref.active)) { m.dead = true; continue; }
      const tx = t.kind === 'boss' ? state.boss.x : t.ref.x;
      const ta = t.kind === 'boss' ? state.boss.alt : t.ref.alt;
      const tz = t.kind === 'boss' ? state.boss.z : t.ref.z;
      m.z += 700 * dt;
      m.x += Math.max(-1.2 * dt, Math.min(1.2 * dt, tx - m.x));
      m.alt += Math.max(-260 * dt, Math.min(260 * dt, ta - m.alt));
      const dxM = Math.abs(m.x - tx) * CORRIDOR_M;
      if (Math.abs(m.z - tz) < 45 && dxM < 45 && Math.abs(m.alt - ta) < 45) {
        m.dead = true;
        if (t.kind === 'boss') {
          state.boss.hp -= 20;
          addScore(SCORE.bossHit * 4);
          burst(m.x, m.alt, m.z, '#ff8a3c', 12, 200);
          if (state.boss.hp <= 0) {
            state.bossDefeated[state.boss.key] = true;
            addScore(state.boss.def.reward);
            burst(state.boss.x, state.boss.alt, state.boss.z, '#ff5a3c', 40, 320);
            setBanner(`${state.boss.name} DOWN`, `+${state.boss.def.reward} — press on`, 3.5);
            state.boss = null;
            state.phase = 'fly';
          }
        } else {
          t.ref.active = false;
          burst(t.ref.x, t.ref.alt, t.ref.z, '#ff8a3c', 14, 180);
          state.stats.kills += 1;
          addScore(SCORE.kill);
        }
      }
      if (m.life <= 0) m.dead = true;
    }
    state.missiles = state.missiles.filter((m) => !m.dead);

    // Particles drift and fade.
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.alt += pt.vy * dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);

    // Zone transitions.
    if (state.zoneIndex < ZONES.length - 1 && state.z >= zn.endZ) {
      state.zoneIndex += 1;
      const next = ZONES[state.zoneIndex];
      state.ringsPassed = 0;
      state.ringsNeeded = next.rings;
      state.rings = allRings.filter((r) => r.z >= next.startZ && r.z < next.endZ);
      addScore(SCORE.zoneClear);
      setBanner(next.name, next.objective, 4);
      events |= EVENT_ZONE;
      if (next.id === 'storm') {
        // The storm opens with a lightning crack.
        state.lightning = 0.2;
      }
    }
    // The landing leg begins after the last zone.
    if (state.zoneIndex === ZONES.length - 1 && state.z >= LANDING.startZ && state.phase !== 'landing' && state.phase !== 'done') {
      state.phase = 'landing';
      setBanner('SKYHAVEN AIRFIELD', 'Line up, slow down, put her on the runway', 4.5);
    }
    if (state.phase === 'takeoff' && state.alt > 40) state.phase = 'fly';

    return events;
  }

  return { state, reset, step, zone, allRings };
}

export { BEST_KEY, FOCAL };
