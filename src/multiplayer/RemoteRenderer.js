/**
 * Draws remote players as ghosts relative to local score (distance).
 * Handles HiDPI by applying the same devicePixelRatio scale as the main canvas.
 */

const PX_PER_POINT = 0.6;

export class RemoteRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.footY = 130; // updated from local Trex when available
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
  }

  /**
   * @param {Array} remotePlayers
   * @param {number} myScore
   */
  draw(remotePlayers, myScore = 0) {
    if (!this.ctx || !remotePlayers) return;

    const ctx = this.ctx;
    const y = this.footY;

    for (const p of remotePlayers) {
      const dead = !p.alive || (p.state || "").toUpperCase() === "CRASHED";
      if (dead) ctx.globalAlpha = 0.35;

      const dx = Math.max(-150, Math.min(150, (p.score - myScore) * PX_PER_POINT));
      const x = 50 + dx;

      const color = this._skinColor(p.skin);
      ctx.fillStyle = color;

      const st = (p.state || "").toUpperCase();

      if (st === "DUCKING") {
        ctx.fillRect(x, y - 24, 48, 24);
      } else if (st === "JUMPING") {
        const jy = y - 30;
        ctx.fillRect(x, jy - 40, 36, 40);
        ctx.fillRect(x + 22, jy - 52, 22, 18);
        ctx.fillRect(x + 8, jy, 8, 10);
        ctx.fillRect(x + 22, jy, 8, 10);
      } else {
        ctx.fillRect(x, y - 40, 36, 40);
        ctx.fillRect(x + 22, y - 52, 22, 18);
        if (st === "RUNNING" || st === "IDLE" || st === "WAITING") {
          const legOffset = p.animFrame === 0 ? 0 : 4;
          ctx.fillRect(x + 6, y, 8, 12 + legOffset);
          ctx.fillRect(x + 22, y, 8, 12 - legOffset);
        }
      }

      if (p.hat === "crown") {
        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(x + 24, y - 62, 18, 10);
        ctx.fillRect(x + 26, y - 68, 4, 6);
        ctx.fillRect(x + 32, y - 70, 4, 8);
        ctx.fillRect(x + 38, y - 68, 4, 6);
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = "#333";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.name, x + 20, y - 70);

      ctx.fillStyle = "#888";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(String(Math.floor(p.score)), x + 20, y - 58);

      ctx.globalAlpha = 1;
    }
  }

  _skinColor(skin) {
    const colors = {
      classic: "#535353",
      ninja: "#2c3e50",
      robot: "#3498db",
      fire: "#e74c3c",
      gold: "#f1c40f",
      ghost: "#9b59b6"
    };
    return colors[skin] || colors.classic;
  }
}
