/**
 * Remote player with smooth interpolation
 */
export class RemotePlayer {
  constructor(uid, data = {}) {
    this.uid = uid;
    this.name = data.name || "Player";
    this.skin = data.skin || "classic";
    this.hat = data.hat || null;
    this.trail = data.trail || null;

    // Rendered (smoothed) position
    this.renderX = data.x || 50;
    this.renderY = data.y || 0;

    // Latest network target
    this.targetX = this.renderX;
    this.targetY = this.renderY;

    this.state = data.state || "running"; // idle | running | jumping | ducking | crashed
    this.alive = data.alive !== false;
    this.score = data.score || 0;
    this.ready = !!data.ready;

    // For animation
    this.animFrame = 0;
    this.animTimer = 0;
  }

  applySnapshot(data) {
    if (data.x !== undefined) this.targetX = data.x;
    if (data.y !== undefined) this.targetY = data.y;
    if (data.state) this.state = data.state;
    if (data.alive !== undefined) this.alive = data.alive;
    if (data.score !== undefined) this.score = data.score;
    if (data.name) this.name = data.name;
    if (data.skin) this.skin = data.skin;
    if (data.hat !== undefined) this.hat = data.hat;
    if (data.trail !== undefined) this.trail = data.trail;
  }

  /**
   * Call every frame with deltaTime in seconds
   */
  update(dt) {
    const smoothing = 14; // higher = snappier
    const t = Math.min(1, smoothing * dt);

    this.renderX += (this.targetX - this.renderX) * t;
    this.renderY += (this.targetY - this.renderY) * t;

    // Simple run animation timer
    this.animTimer += dt;
    if (this.animTimer > 0.1) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 2;
    }
  }
}

/**
 * Manages all remote players for a room
 */
export class RemotePlayerManager {
  constructor(myUid) {
    this.myUid = myUid;
    this.players = new Map(); // uid → RemotePlayer
  }

  syncFromSnapshot(playersData) {
    if (!playersData) return;

    const seen = new Set();

    for (const [uid, data] of Object.entries(playersData)) {
      if (uid === this.myUid) continue;
      seen.add(uid);

      if (this.players.has(uid)) {
        this.players.get(uid).applySnapshot(data);
      } else {
        this.players.set(uid, new RemotePlayer(uid, data));
      }
    }

    // Remove players who left
    for (const uid of this.players.keys()) {
      if (!seen.has(uid)) {
        this.players.delete(uid);
      }
    }
  }

  update(dt) {
    for (const p of this.players.values()) {
      p.update(dt);
    }
  }

  getAll() {
    return Array.from(this.players.values());
  }

  clear() {
    this.players.clear();
  }
}
