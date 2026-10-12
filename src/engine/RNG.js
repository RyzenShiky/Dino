/**
 * Re-export + helpers for the rest of the app.
 * The actual RandomSource lives in resources/dino_game/random_source.js
 * so the Classic engine can import it without circular issues.
 */
export {
  RandomSource,
  SeededRandom,
  setRandomSource,
  getRandomSource,
  getRandomNum,
  randomChance,
  seedStreams,
  clearStreams,
  rng,
  hashString
} from "../../resources/dino_game/random_source.js";

import { hashString } from "../../resources/dino_game/random_source.js";

export function dailySeed(dateStr = new Date().toISOString().slice(0, 10)) {
  return hashString(dateStr + "_DINO_DAILY_v1");
}
