// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { IS_IOS } from './constants.js';
import { getRandomNum as seededGetRandomNum } from './random_source.js';

/**
 * Get random number.
 * Now routes through the active RandomSource (Classic = Math.random, Race = Seeded).
 * @param {number} min
 * @param {number} max
 */
export function getRandomNum(min, max) {
  return seededGetRandomNum(min, max);
}

/**
 * Return the current timestamp.
 * @return {number}
 */
export function getTimeStamp() {
  return IS_IOS ? new Date().getTime() : performance.now();
}
