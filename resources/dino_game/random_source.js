/**
 * Pluggable random source for the Dino engine.
 *
 * Classic mode  → Math.random()
 * Race / Daily  → independent SeededRandom streams per domain
 *   so obstacle / cloud / bg / trex / ground / night never starve each other.
 */

export class RandomSource {
  next() {
    return Math.random();
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability) {
    return this.next() < probability;
  }
}

/**
 * Deterministic LCG – same seed produces identical sequence on every client.
 */
export class SeededRandom extends RandomSource {
  constructor(seed = 1) {
    super();
    this.state = seed >>> 0;
  }

  next() {
    // Numerical Recipes LCG
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  fork(offset = 0) {
    return new SeededRandom((this.state + offset) >>> 0);
  }
}

/** Simple string hash → number seed */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const STREAMS = {};
const DEFAULT = new RandomSource();

/**
 * Legacy guard: any leftover caller of getRandomNum / randomChance / activeRandom
 * in seeded mode will land here, log once, and use Math.random so it does NOT
 * silently consume the obstacle stream.
 */
let legacyWarned = false;
const LEGACY_GUARD = {
  next() {
    if (!legacyWarned) {
      console.warn("[RNG] legacy activeRandom used – migrate caller to rng(stream)");
      legacyWarned = true;
    }
    return Math.random();
  },
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  },
  chance(probability) {
    return this.next() < probability;
  }
};

/**
 * Seed independent streams from a single room / daily seed.
 */
export function seedStreams(seed) {
  const s = String(seed);
  legacyWarned = false;
  ["obstacle", "cloud", "bg", "trex", "ground", "night"].forEach((k) => {
    STREAMS[k] = new SeededRandom(hashString(`${s}:${k}`));
  });
  // Do NOT alias activeRandom to obstacle – that is the pollution bug.
  activeRandom = LEGACY_GUARD;
}

/** Clear streams back to pure Math.random (classic mode) */
export function clearStreams() {
  Object.keys(STREAMS).forEach((k) => delete STREAMS[k]);
  activeRandom = new RandomSource();
  legacyWarned = false;
}

/**
 * Get a named stream. Falls back to classic / default source.
 * @param {'obstacle'|'cloud'|'bg'|'trex'|'ground'|'night'} key
 */
export function rng(key) {
  return STREAMS[key] || activeRandom || DEFAULT;
}

/** Global active random source – classic or legacy guard */
let activeRandom = new RandomSource();

export function setRandomSource(source) {
  if (source instanceof SeededRandom) {
    // Old single-seed path: derive full stream set from its state
    seedStreams(source.state);
  } else {
    clearStreams();
    activeRandom = source || new RandomSource();
  }
}

export function getRandomSource() {
  return activeRandom;
}

/** @deprecated – prefer rng(stream).int() */
export function getRandomNum(min, max) {
  return activeRandom.int(min, max);
}

/** @deprecated – prefer rng(stream).chance() */
export function randomChance(probability) {
  return activeRandom.chance(probability);
}
