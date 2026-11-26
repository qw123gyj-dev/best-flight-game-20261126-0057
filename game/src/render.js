// SKYHAWK's renderer: a pseudo-3D chase view drawn on one canvas.
// Sky, sun, mountains, a perspective ground grid, the runway, rings,
// obstacles, the bosses, the plane itself and a full instrument HUD —
// all plain canvas 2D, no images, no network.

import { BEST_KEY, FOCAL, HORIZON_BASE, LANDING, PLAYER, RUNWAY, SCORE, UPGRADES, ZONES } from './config.js';
import { hash1 } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

const PXM = 1.55; // pixels per metre at scale 1
const CORRIDOR_PX = 420; // pixels per corridor unit at scale 1
const CORRIDOR_M = 500;
const FT_PER_M = 3.28084;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /** Project a world point (corridor x, altitude m, downrange z) to screen.
   * The camera rides 35 m above the plane's own altitude (the chase camera's
   * eye height): without it, the ground plane collapses to the horizon line
   * whenever the plane is on the runway, and the strip is invisible. */
  function project(state, fx, falt, fz) {
    const dz = Math.max(8, fz - state.z);
    const k = FOCAL / (dz + 90);
    const horizonY = H * HORIZON_BASE - state.pitchVis * H * 0.28;
    const cx = W / 2 - state.heading * 7;
    const sx = cx + (fx - state.x) * k * CORRIDOR_PX;
    const sy = horizonY + (state.alt + 35 - falt) * k * PXM;
    return { x: sx, y: sy, k, dz, on: dz > 8 && dz < 1700 };
  }

  function drawSky(state, zone) {
    const horizonY = H * HORIZON_BASE - state.pitchVis * H * 0.28;
    const grad = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
    grad.addColorStop(0, zone.skyTop);
    grad.addColorStop(0.6, zone.skyMid);
    grad.addColorStop(1, zone.skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, Math.max(1, horizonY) + 1);
    // Sun, low in the canyon, high in the valley; the storm hides it.
    if (zone.id !== 'storm') {
      const sunX = W * (zone.id === 'canyon' ? 0.82 : 0.78);
      const sunY = H * (zone.id === 'canyon' ? 0.2 : 0.13);
      const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
      glow.addColorStop(0, 'rgba(255,244,200,0.95)');
      glow.addColorStop(0.25, 'rgba(255,220,130,0.55)');
      glow.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // Drifting cloud puffs, parallaxed by heading.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 7; i += 1) {
      const cxp = ((i * 317 + state.time * 6 - state.heading * 22) % (W + 320) + W + 320) % (W + 320) - 160;
      const cyp = H * (0.07 + (i % 3) * 0.05);
      const cw = 90 + (i % 3) * 40;
      ctx.beginPath();
      ctx.ellipse(cxp, cyp, cw, cw * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lightning flash whites the sky for a blink.
    if (state.lightning > 0) {
      ctx.fillStyle = `rgba(230,235,255,${clamp(state.lightning * 4, 0, 0.55)})`;
      ctx.fillRect(0, 0, W, horizonY);
    }
    drawMountains(state, zone, horizonY, 0.5, 0.16);
    drawMountains(state, zone, horizonY, 1, 0.3);
  }

  function drawMountains(state, zone, horizonY, parallax, heightFrac) {
    // Rolling ridges: overlapping rounded humps, each a different height and
    // width, parallaxed by heading so the ridge slides as the plane turns.
    const off = -state.heading * 14 * parallax;
    const base = zone.id === 'storm' ? '#3a3f58' : zone.id === 'canyon' ? '#8a4a28' : '#4a7a52';
    const far = zone.id === 'storm' ? '#2c3049' : zone.id === 'canyon' ? '#6e3a1e' : '#38603f';
    const colour = parallax < 1 ? far : base;
    const spacing = 230;
    const span = W + spacing * 2;
    const start = Math.floor((-off - spacing) / spacing);
    const count = Math.ceil(span / spacing) + 2;
    for (let i = start; i < start + count; i += 1) {
      const h1 = hash1(i * 17 + Math.round(parallax * 10));
      const h2 = hash1(i * 31 + 5);
      const cx = i * spacing + off + h2 * 90;
      const peakH = (0.45 + h1 * 0.75) * H * heightFrac;
      const rx = spacing * (0.75 + h2 * 0.5);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.ellipse(cx, horizonY + 6, rx, peakH, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Snow on the storm peaks: a pale cap on the tallest humps.
      if (zone.id === 'storm' && peakH > H * heightFrac * 0.85) {
        ctx.fillStyle = 'rgba(235,240,250,0.8)';
        ctx.beginPath();
        ctx.ellipse(cx, horizonY + 6 - peakH * 0.82, rx * 0.34, peakH * 0.2, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGround(state, zone) {
    const horizonY = H * HORIZON_BASE - state.pitchVis * H * 0.28;
    const grad = ctx.createLinearGradient(0, horizonY, 0, H);
    grad.addColorStop(0, zone.groundFar);
    grad.addColorStop(1, zone.ground);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    // Perspective grid: lateral lines and downrange lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    const cx = W / 2 - state.heading * 7;
    for (let gx = -1; gx <= 1.01; gx += 0.25) {
      ctx.beginPath();
      let first = true;
      for (let dz = 60; dz <= 1500; dz += 60) {
        const p = project(state, gx, 0, state.z + dz);
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    for (let dz = 100; dz <= 1500; dz += 100) {
      const left = project(state, -1, 0, state.z + dz);
      const right = project(state, 1, 0, state.z + dz);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
    // A winding road in the valley and the canyon.
    if (zone.id !== 'storm') {
      ctx.strokeStyle = 'rgba(40,32,24,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      let first = true;
      for (let dz = 60; dz <= 1500; dz += 60) {
        const roadX = Math.sin((state.z + dz) / 700) * 0.35;
        const p = project(state, roadX, -0.5, state.z + dz);
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // Canyon walls close in on both sides.
    if (zone.id === 'canyon') {
      for (const side of [-1, 1]) {
        ctx.fillStyle = 'rgba(122,62,30,0.9)';
        ctx.beginPath();
        const top = project(state, side * 0.62, 700, state.z + 60);
        const bot = project(state, side * 0.62, 0, state.z + 60);
        const farTop = project(state, side * 0.62, 700, state.z + 1500);
        const farBot = project(state, side * 0.62, 0, state.z + 1500);
        ctx.moveTo(side < 0 ? -20 : W + 20, horizonY);
        ctx.lineTo(farTop.x, farTop.y);
        ctx.lineTo(farBot.x, farBot.y);
        ctx.lineTo(bot.x, bot.y);
        ctx.lineTo(top.x, top.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(state) {
    const runs = [
      { from: 0, to: 900 },
      { from: LANDING.runwayZ, to: LANDING.runwayZ + RUNWAY.length },
    ];
    for (const run of runs) {
      if (run.to < state.z - 50 || run.from > state.z + 1600) continue;
      const hw = RUNWAY.halfWidth;
      ctx.fillStyle = '#2e2f33';
      for (let dz = Math.max(20, run.from - state.z); dz < run.to - state.z; dz += 50) {
        const a = project(state, -hw, -1, state.z + dz);
        const b = project(state, hw, -1, state.z + dz);
        const c = project(state, hw, -1, state.z + dz + 50);
        const d = project(state, -hw, -1, state.z + dz + 50);
        if (!a.on && dz > 60) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
      }
      // Centreline dashes and threshold bars.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let dz = Math.max(30, run.from - state.z); dz < run.to - state.z; dz += 90) {
        const a = project(state, -0.012, -0.4, state.z + dz);
        const b = project(state, 0.012, -0.4, state.z + dz);
        const c = project(state, 0.012, -0.4, state.z + dz + 34);
        const d = project(state, -0.012, -0.4, state.z + dz + 34);
        if (!a.on) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
      }
      // Runway edge lights, amber, blinking slowly.
      if (Math.floor(state.time * 2) % 2 === 0) {
        ctx.fillStyle = '#ffb02e';
        for (let dz = 80; dz < 900 && run.from + dz < run.to; dz += 150) {
          for (const side of [-hw, hw]) {
            const p = project(state, side, -0.4, state.z + dz);
            if (!p.on) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1.5, p.k * 2.4), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  function drawRing(r, state) {
    const p = project(state, r.x, r.alt, r.z);
    if (!p.on) return;
    const radius = 55 * p.k * PXM;
    const passed = r.passed;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.lineWidth = Math.max(2, radius * 0.09);
    ctx.strokeStyle = passed ? 'rgba(120,220,140,0.35)' : '#ffd94d';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = passed ? 'rgba(120,220,140,0.2)' : 'rgba(255,217,77,0.5)';
    ctx.lineWidth = Math.max(1, radius * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.78, radius * 0.73, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!passed) {
      ctx.fillStyle = '#fff3c4';
      ctx.font = `bold ${Math.max(9, radius * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RING', 0, 0);
    }
    ctx.restore();
  }

  function drawFeature(f, state) {
    const p = project(state, f.x, f.alt, f.z);
    if (!p.on) return;
    const s = Math.max(0.4, f.size * p.k * PXM);
    ctx.save();
    ctx.translate(p.x, p.y);
    switch (f.kind) {
      case 'tree':
      case 'pine': {
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(-s * 0.08, -s * 0.3, s * 0.16, s * 0.3);
        ctx.fillStyle = f.kind === 'pine' ? '#1f5c33' : '#2f7a3d';
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(-s * 0.5, -s * 0.25);
        ctx.lineTo(s * 0.5, -s * 0.25);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'house': {
        ctx.fillStyle = '#e8dcc0';
        ctx.fillRect(-s * 0.5, -s * 0.45, s, s * 0.45);
        ctx.fillStyle = '#a33d2a';
        ctx.beginPath();
        ctx.moveTo(-s * 0.58, -s * 0.45);
        ctx.lineTo(0, -s * 0.85);
        ctx.lineTo(s * 0.58, -s * 0.45);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'rock': {
        ctx.fillStyle = '#8a7f74';
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, 0);
        ctx.lineTo(-s * 0.3, -s * 0.8);
        ctx.lineTo(s * 0.2, -s);
        ctx.lineTo(s * 0.5, -s * 0.3);
        ctx.lineTo(s * 0.45, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'balloon': {
        const bob = Math.sin(state.time * 2 + f.z) * 3;
        ctx.translate(0, bob);
        ctx.fillStyle = '#e84a5f';
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.4, s * 0.55, s * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.4, s * 0.2, s * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5a3a22';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.2);
        ctx.lineTo(0, s * 0.45);
        ctx.stroke();
        ctx.fillStyle = '#7a4a22';
        ctx.fillRect(-s * 0.14, s * 0.42, s * 0.28, s * 0.22);
        break;
      }
      case 'cloud':
      case 'stormcloud': {
        ctx.fillStyle = f.kind === 'stormcloud' ? 'rgba(52,52,74,0.92)' : 'rgba(255,255,255,0.85)';
        for (const [ox, oy, r] of [[-0.5, 0, 0.55], [0, -0.35, 0.7], [0.55, 0, 0.5], [0, 0.15, 0.6]]) {
          ctx.beginPath();
          ctx.ellipse(ox * s, oy * s, r * s, r * s * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (f.kind === 'stormcloud') {
          ctx.strokeStyle = 'rgba(255,220,80,0.9)';
          ctx.lineWidth = Math.max(1, s * 0.06);
          ctx.beginPath();
          ctx.moveTo(-s * 0.1, s * 0.2);
          ctx.lineTo(s * 0.05, s * 0.55);
          ctx.lineTo(-s * 0.05, s * 0.55);
          ctx.lineTo(s * 0.12, s * 0.95);
          ctx.stroke();
        }
        break;
      }
      case 'drone': {
        ctx.fillStyle = '#3a3f4a';
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.6, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e84a5f';
        ctx.beginPath();
        ctx.arc(0, -s * 0.08, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#9aa0b8';
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, 0); ctx.lineTo(-s * 1.05, -s * 0.2);
        ctx.moveTo(s * 0.6, 0); ctx.lineTo(s * 1.05, -s * 0.2);
        ctx.stroke();
        break;
      }
      case 'pickup': {
        const up = UPGRADES[f.up] || UPGRADES.fuel;
        const bob = Math.sin(state.time * 3 + f.z) * 4;
        ctx.translate(0, bob);
        ctx.fillStyle = 'rgba(20,24,40,0.55)';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = up.colour;
        ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = up.colour;
        ctx.font = `bold ${Math.max(9, s * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(up.name[0], 0, 1);
        if (s > 18) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = `${Math.max(8, s * 0.26)}px sans-serif`;
          ctx.fillText(up.name, 0, s * 0.85);
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  function drawBoss(state) {
    const b = state.boss;
    if (!b) return;
    const p = project(state, b.x, b.alt, b.z);
    if (!p.on) return;
    const s = b.size * p.k * PXM;
    const def = b.def;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Hull: a long armoured airship with a gondola and fins.
    ctx.fillStyle = def.colour;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.sail;
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, -s * 0.24, s * 0.55, s * 0.16, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d1420';
    ctx.fillRect(-s * 0.35, s * 0.28, s * 0.7, s * 0.16);
    // Tail fins.
    ctx.fillStyle = mix(def.colour, '#000000', 0.25);
    ctx.beginPath();
    ctx.moveTo(s * 0.75, -s * 0.05);
    ctx.lineTo(s * 1.08, -s * 0.55);
    ctx.lineTo(s * 1.08, s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.75, s * 0.05);
    ctx.lineTo(s * 1.08, s * 0.5);
    ctx.lineTo(s * 1.08, s * 0.05);
    ctx.closePath();
    ctx.fill();
    // Gun ports glow while it fires.
    const firing = b.flakTimer > b.def.flakInterval - 0.25;
    ctx.fillStyle = firing ? '#ff5a3c' : '#ffb02e';
    for (const gx of [-0.6, -0.2, 0.2, 0.6]) {
      ctx.beginPath();
      ctx.arc(gx * s, s * 0.3, Math.max(2, s * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
    // Damage smoke when hurt.
    if (b.hp < b.maxHp * 0.5) {
      ctx.fillStyle = 'rgba(60,60,70,0.7)';
      ctx.beginPath();
      ctx.arc(-s * 0.4 + Math.sin(state.time * 5) * 6, -s * 0.5, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Health bar above the boss.
    const barW = Math.max(120, s * 1.6);
    ctx.fillStyle = 'rgba(10,12,20,0.7)';
    ctx.fillRect(p.x - barW / 2, p.y - s * 0.75 - 26, barW, 14);
    ctx.fillStyle = '#e84a5f';
    ctx.fillRect(p.x - barW / 2 + 2, p.y - s * 0.75 - 24, (barW - 4) * (b.hp / b.maxHp), 10);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, p.x, p.y - s * 0.75 - 32);
  }

  function drawProjectiles(state) {
    // Player tracers: short yellow streaks.
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 2.5;
    for (const b of state.bullets) {
      const p = project(state, b.x, b.alt, b.z);
      if (!p.on) continue;
      const tail = project(state, b.x, b.alt, b.z - 26);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    // Homing missiles: white streaks with a smoke dot.
    for (const m of state.missiles) {
      const p = project(state, m.x, m.alt, m.z);
      if (!p.on) continue;
      const tail = project(state, m.x, m.alt, m.z - 34);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = '#ffb02e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.k * 3), 0, Math.PI * 2);
      ctx.fill();
    }
    // Incoming flak: red-hot dots that grow as they close.
    for (const fl of state.flak) {
      const p = project(state, fl.x, fl.alt, fl.z);
      if (!p.on) continue;
      const r = Math.max(2.5, 260 / Math.max(20, p.dz) * 1.4);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      glow.addColorStop(0, 'rgba(255,90,60,0.95)');
      glow.addColorStop(1, 'rgba(255,90,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd0c0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles: bursts from hits, rings and explosions.
    for (const pt of state.particles || []) {
      const p = project(state, pt.x, pt.alt, pt.z);
      if (!p.on) continue;
      const a = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.colour;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, pt.size * p.k * (1.6 - a)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawPlane(state) {
    const px = W / 2;
    const py = H * 0.74 + state.pitchVis * 26;
    const s = Math.min(W, H) / 9.2;
    const boosting = state.timers.turbo > 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.roll);
    ctx.scale(1 + Math.abs(state.roll) * 0.06, 1);
    // Engine glow.
    if (boosting || state.throttle > 0.6) {
      const glow = ctx.createRadialGradient(0, s * 0.52, 0, 0, s * 0.52, s * 0.5);
      glow.addColorStop(0, 'rgba(255,170,60,0.85)');
      glow.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.62, s * 0.22, s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Wings, swept back, seen from behind.
    ctx.fillStyle = '#274b8f';
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, -s * 0.1);
    ctx.lineTo(-s * 1.05, s * 0.28);
    ctx.lineTo(-s * 1.02, s * 0.44);
    ctx.lineTo(-s * 0.1, s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.08, -s * 0.1);
    ctx.lineTo(s * 1.05, s * 0.28);
    ctx.lineTo(s * 1.02, s * 0.44);
    ctx.lineTo(s * 0.1, s * 0.3);
    ctx.closePath();
    ctx.fill();
    // Fuselage: tail cone at the bottom, nose away up-screen.
    ctx.fillStyle = '#1d3a6e';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.95);
    ctx.quadraticCurveTo(s * 0.16, -s * 0.3, s * 0.13, s * 0.42);
    ctx.lineTo(-s * 0.13, s * 0.42);
    ctx.quadraticCurveTo(-s * 0.16, -s * 0.3, 0, -s * 0.95);
    ctx.fill();
    // Belly stripe and canopy.
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.9);
    ctx.quadraticCurveTo(s * 0.07, -s * 0.4, s * 0.06, s * 0.1);
    ctx.lineTo(-s * 0.06, s * 0.1);
    ctx.quadraticCurveTo(-s * 0.07, -s * 0.4, 0, -s * 0.9);
    ctx.fill();
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.42, s * 0.075, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fin and tailplane.
    ctx.fillStyle = '#e8590c';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.42);
    ctx.lineTo(-s * 0.05, s * 0.78);
    ctx.lineTo(s * 0.05, s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#274b8f';
    ctx.fillRect(-s * 0.34, s * 0.34, s * 0.68, s * 0.07);
    // Twin engine nacelles.
    ctx.fillStyle = '#16294d';
    ctx.beginPath();
    ctx.ellipse(-s * 0.22, s * 0.3, s * 0.09, s * 0.2, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.22, s * 0.3, s * 0.09, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nav lights: red port, green starboard, blinking.
    if (Math.floor(state.time * 2.4) % 2 === 0) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(-s * 1.03, s * 0.34, s * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4dff88';
      ctx.beginPath(); ctx.arc(s * 1.03, s * 0.34, s * 0.045, 0, Math.PI * 2); ctx.fill();
    }
    // Shield shimmer.
    if (state.timers.shield > 0) {
      ctx.strokeStyle = `rgba(56,189,248,${0.35 + 0.25 * Math.sin(state.time * 8)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.1, s * 1.15, s * 0.95, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Muzzle flash when the guns are hot.
    if (state.gunTimer > PLAYER.gunCooldown - 0.05) {
      ctx.fillStyle = 'rgba(255,226,122,0.9)';
      ctx.beginPath();
      ctx.arc(px, py - s * 0.95, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHud(state, screen, best) {
    const zone = ZONES[state.zoneIndex];
    const horizonY = H * HORIZON_BASE - state.pitchVis * H * 0.28;
    // Reticle: where the guns converge.
    if (screen === SCREEN_PLAY) {
      const rx = W / 2;
      const ry = clamp(horizonY + 30, 90, H * 0.6);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, ry, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - 20, ry); ctx.lineTo(rx - 8, ry);
      ctx.moveTo(rx + 8, ry); ctx.lineTo(rx + 20, ry);
      ctx.moveTo(rx, ry - 20); ctx.lineTo(rx, ry - 8);
      ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry + 20);
      ctx.stroke();
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Compass strip.
    const compassY = 26;
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.fillRect(W / 2 - 190, 8, 380, 34);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const headings = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (let d = -60; d <= 60; d += 5) {
      const h = ((Math.round(state.heading) + d) % 360 + 360) % 360;
      const x = W / 2 + d * 3;
      const major = h % 45 === 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(x, compassY + (major ? -9 : -5));
      ctx.lineTo(x, compassY + 4);
      ctx.stroke();
      if (major) {
        const label = headings.find(([deg]) => deg === h);
        ctx.fillText(label ? label[1] : String(h).padStart(3, '0'), x, compassY + 14);
      }
    }
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 6, 4); ctx.lineTo(W / 2 + 6, 4); ctx.lineTo(W / 2, 12);
    ctx.closePath();
    ctx.fill();
    // Speed tape (left) and altimeter (right).
    drawTape(state, true);
    drawTape(state, false);
    // Attitude indicator, bottom left.
    drawAttitude(state);
    // Bottom centre: throttle, fuel, hull.
    const bw = 300;
    const bx = W / 2 - bw / 2;
    const by = H - 56;
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.fillRect(bx - 12, by - 10, bw + 24, 52);
    gauge(bx, by, bw, 'THR', state.throttle, '#38bdf8');
    gauge(bx, by + 16, bw, 'FUEL', state.fuel / 100, state.fuel < 20 ? '#e84a5f' : '#ffb02e');
    gauge(bx, by + 32, bw, 'HULL', state.hull / 100, state.hull < 30 ? '#e84a5f' : '#4ade80');
    // Top left: zone, objective, rings, score.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.fillRect(12, 8, 300, 86);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(zone.name, 22, 14);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(zone.objective, 22, 36, 280);
    ctx.fillStyle = '#9fd8ff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`RINGS ${state.ringsPassed} / ${state.ringsNeeded}    SCORE ${state.score}`, 22, 58);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '12px sans-serif';
    ctx.fillText(`BEST ${best}`, 22, 76);
    // Top right: lives as little planes.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.fillRect(W - 132, 8, 120, 40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`AIRFRAMES ${state.lives}`, W - 22, 14);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`DIST ${(state.z / 1000).toFixed(1)} km`, W - 22, 30);
    // Active power-ups with their remaining seconds.
    let py2 = H - 30;
    ctx.textAlign = 'right';
    for (const key of Object.keys(state.timers)) {
      const left = state.timers[key];
      if (left <= 0) continue;
      const up = UPGRADES[key];
      ctx.fillStyle = up.colour;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`${up.name} ${Math.ceil(left)}s`, W - 22, py2);
      py2 -= 18;
    }
    // Warnings, flashing centre screen.
    if (screen === SCREEN_PLAY) {
      const warns = [];
      if (state.warnPullUp) warns.push('PULL UP');
      if (state.warnFuel) warns.push('LOW FUEL');
      if (state.speed < PLAYER.minSpeed && state.alt > 0.5) warns.push('STALL — NOSE DOWN');
      if (state.timers.shield > 0) warns.push('');
      if (warns.length && Math.floor(state.time * 3) % 2 === 0) {
        ctx.fillStyle = '#ff5a3c';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(warns.join('  ·  '), W / 2, H * 0.3);
      }
    }
    // Banner: zone changes, boss warnings, landing calls.
    if (state.banner && screen === SCREEN_PLAY) {
      const remain = state.banner.until - state.time;
      const alpha = clamp(remain / 1.2, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner.text, W / 2, H * 0.2);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(state.banner.sub, W / 2, H * 0.2 + 30);
      ctx.globalAlpha = 1;
    }
    // Boss bar under the compass.
    if (state.boss) {
      const b = state.boss;
      const barW = 380;
      ctx.fillStyle = 'rgba(8,12,22,0.6)';
      ctx.fillRect(W / 2 - barW / 2, 52, barW, 26);
      ctx.fillStyle = '#e84a5f';
      ctx.fillRect(W / 2 - barW / 2 + 4, 58, (barW - 8) * (b.hp / b.maxHp), 8);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${b.name} — ${Math.max(0, Math.ceil(b.hp))} HP`, W / 2, 73);
    }
  }

  function gauge(x, y, w, label, frac, colour) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 42, y, w - 42, 9);
    ctx.fillStyle = colour;
    ctx.fillRect(x + 42, y, (w - 42) * clamp(frac, 0, 1), 9);
  }

  function drawTape(state, isSpeed) {
    const x = isSpeed ? 26 : W - 26;
    const value = isSpeed ? state.speed : state.alt * FT_PER_M;
    const unit = isSpeed ? 'KT' : 'FT';
    const step = isSpeed ? 20 : 200;
    const range = isSpeed ? 120 : 1200;
    const cy = H * 0.42;
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.fillRect(x - 34, cy - 110, 68, 220);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(x - 24, cy - 100);
    ctx.lineTo(x - 24, cy + 100);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const base = Math.floor(value / step) * step;
    for (let v = base - range; v <= base + range; v += step) {
      if (v < 0) continue;
      const y = cy - ((v - value) / range) * 100;
      if (y < cy - 100 || y > cy + 100) continue;
      ctx.fillText(String(v), x - 2, y + 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(x - 24, y);
      ctx.lineTo(x - 18, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(x - 34, cy - 11, 68, 22);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${Math.round(value)}`, x, cy + 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(unit, x, cy - 122);
    if (isSpeed && value < PLAYER.minSpeed) {
      ctx.fillStyle = '#ff5a3c';
      ctx.fillText('STALL', x, cy + 122);
    }
  }

  function drawAttitude(state) {
    const cx = 86;
    const cy = H - 86;
    const r = 52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.roll);
    ctx.translate(0, state.pitchVis * r * 1.4);
    ctx.fillStyle = '#3d7ac2';
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 7);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATT', cx, cy + r + 13);
  }

  function drawScreen(state, screen, best) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(6,10,20,0.42)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText('SKYHAWK', W / 2, H * 0.3);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('THREE VALLEYS — one sortie, three zones, two bosses, one runway', W / 2, H * 0.3 + 52);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#dfe9f5';
      const lines = [
        'Take off from the valley strip, thread the rings, and break the Sky Pirate Galleon',
        'and the Tempest Queen — then bring her home onto the Skyhaven runway.',
        '',
        'ARROWS / WASD — steer and climb · W / S — throttle · SHIFT — afterburner',
        'SPACE or CLICK — fire · P — pause · M — mute',
        '',
        'Fuel burns with throttle. Rings pay 100. Bosses pay 1,500 and 3,000.',
      ];
      lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.46 + i * 24));
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(best > 0 ? `BEST SCORE ${best} — PRESS SPACE OR CLICK TO FLY` : 'PRESS SPACE OR CLICK TO FLY', W / 2, H * 0.68);
    } else if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(6,10,20,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('PAUSED', W / 2, H * 0.42);
      ctx.font = '16px sans-serif';
      ctx.fillText('P or SPACE to resume · M to mute', W / 2, H * 0.42 + 46);
    } else if (screen === SCREEN_OVER) {
      ctx.fillStyle = 'rgba(20,6,8,0.62)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff6b5e';
      ctx.font = 'bold 46px sans-serif';
      const reason = {
        ground: 'TERRAIN STRIKE', runway: 'CRASHED ON THE RUNWAY', overshoot: 'OVERSHOT THE RUNWAY',
        flak: 'SHOT DOWN BY FLAK', drone: 'RAMMED BY A DRONE', balloon: 'HIT A BALLOON',
        stormcloud: 'LOST IN THE STORM', tree: 'CLIPPED A TREE', pine: 'CLIPPED A PINE',
        rock: 'HIT A ROCK', house: 'HIT A HOUSE',
      }[state.crashReason] || 'SHOT DOWN';
      ctx.fillText(reason, W / 2, H * 0.34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(`SCORE ${state.score}${state.score > best ? ' — NEW BEST!' : `   BEST ${best}`}`, W / 2, H * 0.34 + 48);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#dfe9f5';
      ctx.fillText(`Rings ${state.stats.rings} · Kills ${state.stats.kills} · Pickups ${state.stats.pickups} · Distance ${(state.z / 1000).toFixed(1)} km`, W / 2, H * 0.34 + 84);
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText('PRESS SPACE OR CLICK TO FLY AGAIN', W / 2, H * 0.34 + 130);
    } else if (screen === SCREEN_DONE) {
      ctx.fillStyle = 'rgba(6,16,10,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#7dff9a';
      ctx.font = 'bold 46px sans-serif';
      ctx.fillText('MISSION COMPLETE', W / 2, H * 0.3);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(`SCORE ${state.score}${state.score > best ? ' — NEW BEST!' : `   BEST ${best}`}`, W / 2, H * 0.3 + 48);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#dfe9f5';
      const rows = [
        `Rings threaded ${state.stats.rings} · Drones downed ${state.stats.kills} · Pickups ${state.stats.pickups}`,
        `Flight time ${Math.floor(state.stats.flightTime / 60)}:${String(Math.floor(state.stats.flightTime % 60)).padStart(2, '0')} · Airframes left ${state.lives}`,
        `Accuracy ${state.stats.shots ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0}% — ${state.stats.hits} hits from ${state.stats.shots} shots`,
      ];
      rows.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.3 + 84 + i * 24));
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText('PRESS SPACE OR CLICK TO FLY IT AGAIN', W / 2, H * 0.3 + 180);
    }
  }

  function draw(state, screen, best) {
    const zone = ZONES[state.zoneIndex];
    drawSky(state, zone);
    drawGround(state, zone);
    drawRunway(state);
    // World objects, far to near.
    const items = [];
    for (const r of state.rings) if (r.active && !r.passed) items.push({ z: r.z, draw: () => drawRing(r, state) });
    for (const f of state.features) if (f.active) items.push({ z: f.z, draw: () => drawFeature(f, state) });
    items.sort((a, b) => b.z - a.z);
    for (const item of items) item.draw();
    drawBoss(state);
    drawProjectiles(state);
    drawPlane(state);
    drawHud(state, screen, best);
    if (screen !== SCREEN_PLAY) drawScreen(state, screen, best);
  }

  return { draw, resize };
}
