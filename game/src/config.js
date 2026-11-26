// SKYHAWK — tuning, zones and the upgrade table.
// Everything the world and the renderer agree on lives here, so a balance
// change is one number in one place. Units: metres for distance and
// altitude, knots for speed, feet shown on the HUD are metres converted.

export const STEP = 1 / 60;
export const BEST_KEY = 'skyhawk-best-score';

/** The sortie is three zones and a landing, in one continuous flight. */
export const ZONES = [
  {
    id: 'valley',
    name: 'GREEN VALLEY',
    startZ: 0,
    endZ: 6000,
    rings: 6,
    skyTop: '#2f6fb4',
    skyMid: '#7db8e8',
    skyBot: '#cfe8f7',
    ground: '#5d9b4a',
    groundFar: '#7fb069',
    objective: 'Take off, thread 6 rings, reach the canyon gate',
  },
  {
    id: 'canyon',
    name: 'CANYON PASS',
    startZ: 6000,
    endZ: 13000,
    rings: 8,
    skyTop: '#c96a2e',
    skyMid: '#e8a35c',
    skyBot: '#f7d9a8',
    ground: '#a8623c',
    groundFar: '#c98a5a',
    objective: 'Thread 8 rings through the narrows — then the Galleon',
    corridor: 0.55,
    boss: 'galleon',
  },
  {
    id: 'storm',
    name: 'STORM PEAKS',
    startZ: 13000,
    endZ: 21000,
    rings: 8,
    skyTop: '#2b2f45',
    skyMid: '#5a5f7d',
    skyBot: '#9aa0b8',
    ground: '#4a4f63',
    groundFar: '#6b7089',
    objective: 'Ride the storm, thread 8 rings, break the Tempest Queen',
    boss: 'tempest',
    storm: true,
  },
];

/** The last stretch: the Skyhaven runway, where the sortie ends. */
export const LANDING = { startZ: 21000, endZ: 22000, runwayZ: 21200 };
export const RUNWAY = { x: 0, halfWidth: 0.09, length: 900 };

/** The two bosses, in the order the pilot meets them. */
export const BOSSES = {
  galleon: {
    name: 'SKY PIRATE GALLEON',
    title: 'BOSS — SKY PIRATE GALLEON',
    hp: 120,
    z: 12500,
    x: 0,
    alt: 320,
    size: 150,
    flakInterval: 1.15,
    flakSpeed: 260,
    drift: 0.35,
    reward: 1500,
    colour: '#7a2e1d',
    sail: '#e8c96a',
  },
  tempest: {
    name: 'TEMPEST QUEEN',
    title: 'FINAL BOSS — TEMPEST QUEEN',
    hp: 200,
    z: 20000,
    x: 0,
    alt: 420,
    size: 210,
    flakInterval: 0.8,
    flakSpeed: 330,
    drift: 0.55,
    reward: 3000,
    colour: '#3d2b63',
    sail: '#9a7ee8',
  },
};

/** Every power-up the pilot can collect, and what it does. */
export const UPGRADES = {
  fuel: { name: 'FUEL CELL', colour: '#ffb02e', blurb: '+40 fuel' },
  repair: { name: 'REPAIR KIT', colour: '#4ade80', blurb: '+35 hull' },
  shield: { name: 'SHIELD', colour: '#38bdf8', blurb: 'invulnerable 10s' },
  turbo: { name: 'TURBO BOOST', colour: '#fb7185', blurb: '+60% speed 8s' },
  twin: { name: 'TWIN CANNON', colour: '#facc15', blurb: 'dual guns 20s' },
  spread: { name: 'SPREAD CANNON', colour: '#f472b6', blurb: '3-way shot 20s' },
  missile: { name: 'MISSILE RACK', colour: '#a78bfa', blurb: 'homing missiles 15s' },
  magnet: { name: 'MAGNET', colour: '#34d399', blurb: 'pulls pickups 12s' },
  double: { name: 'DOUBLE SCORE', colour: '#fde047', blurb: '2x score 20s' },
  life: { name: 'EXTRA AIRFRAME', colour: '#f87171', blurb: '+1 life' },
  flare: { name: 'FLARES', colour: '#fdba74', blurb: 'flak burns out 12s' },
  autopilot: { name: 'AUTOPILOT', colour: '#93c5fd', blurb: 'auto-steer 10s' },
};
export const UPGRADE_KEYS = Object.keys(UPGRADES);

/** Player and flight tuning. */
export const PLAYER = {
  maxSpeed: 340, // knots at full throttle, no boost
  minSpeed: 95, // below this the wings stop flying
  accel: 42, // knots per second toward the throttle target
  climbRate: 95, // metres per second at full pitch
  turnRate: 0.55, // corridor units per second at full bank
  maxRoll: 0.85, // radians of visual bank
  fuelDrain: 0.5, // fuel units per second at full throttle
  fuelMax: 100,
  hullMax: 100,
  lives: 3,
  gunCooldown: 0.14,
  bulletSpeed: 900, // metres per second downrange
  bulletRange: 900,
  missileCooldown: 0.5,
};

/** Scoring. */
export const SCORE = {
  ring: 100,
  kill: 150,
  bossHit: 25,
  pickup: 50,
  zoneClear: 500,
  landing: 1000,
  timeBonusPerSec: 5,
};

/** How far ahead the world stays populated, in metres. */
export const SPAWN_AHEAD = 1600;
export const DESPAWN_BEHIND = 120;

/** Perspective: the focal length that turns downrange metres into scale. */
export const FOCAL = 460;
export const HORIZON_BASE = 0.42; // fraction of canvas height

/** Wind gusts in the storm zone push the plane sideways this hard. */
export const GUST_STRENGTH = 0.22;
