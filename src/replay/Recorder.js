/**
 * Records player inputs for deterministic replay / ghost
 */
export class ReplayRecorder {
  constructor(seed) {
    this.seed = seed;
    this.events = [];
    this.startTime = 0;
    this.recording = false;
  }

  start() {
    this.events = [];
    this.startTime = performance.now();
    this.recording = true;
  }

  record(action) {
    if (!this.recording) return;
    const t = Math.round(performance.now() - this.startTime);
    this.events.push([t, action]);
  }

  stop() {
    this.recording = false;
    return this.getReplay();
  }

  getReplay() {
    return {
      version: 1,
      seed: this.seed,
      events: this.events.slice(),
      duration: this.events.length
        ? this.events[this.events.length - 1][0]
        : 0
    };
  }
}

/**
 * Plays back a replay as a ghost
 */
export class GhostPlayer {
  constructor(replay) {
    this.replay = replay;
    this.index = 0;
    this.time = 0;
    this.finished = false;
  }

  reset() {
    this.index = 0;
    this.time = 0;
    this.finished = false;
  }

  /**
   * Advance ghost time and return actions that should fire this frame
   * @param {number} dt seconds
   * @returns {string[]} list of actions
   */
  update(dt) {
    if (this.finished) return [];

    this.time += dt * 1000; // ms
    const actions = [];

    while (
      this.index < this.replay.events.length &&
      this.replay.events[this.index][0] <= this.time
    ) {
      actions.push(this.replay.events[this.index][1]);
      this.index++;
    }

    if (this.index >= this.replay.events.length) {
      this.finished = true;
    }

    return actions;
  }
}
