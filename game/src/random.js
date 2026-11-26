// A small deterministic RNG (mulberry32) so a seed always builds the same
// valley, the same canyon and the same storm — the screenshot scenes and the
// autopilot both rely on it.

export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hash of one integer, for per-feature decisions that must not depend on draw order. */
export function hash1(n) {
  let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  t ^= t >>> 13;
  t = Math.imul(t, 0xc2b2ae35);
  t ^= t >>> 16;
  return (t >>> 0) / 4294967296;
}

/** Pick one entry of `list` from a 0..1 roll. */
export function pick(list, roll) {
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))];
}
