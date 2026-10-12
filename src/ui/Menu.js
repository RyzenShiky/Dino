function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class MenuUI {
  constructor(container) {
    this.container = container;
    this.onAction = null;
  }

  showMainMenu(userName = "Player") {
    const safeName = escapeHtml(userName);
    this.container.innerHTML = `
      <div class="menu-screen">
        <h1 class="game-title">DINO RUNNER</h1>
        <p class="subtitle">Multiplayer Edition</p>
        <p class="welcome">Hello, <strong id="player-name">${safeName}</strong></p>

        <div class="menu-buttons">
          <button class="btn primary" data-action="classic">Play Classic</button>
          <button class="btn primary" data-action="create">Create Room (Race)</button>
          <button class="btn" data-action="join">Join Room</button>
          <button class="btn" data-action="daily">Daily Challenge</button>
          <button class="btn" data-action="leaderboard">Leaderboard</button>
          <button class="btn" data-action="shop">Shop / Cosmetics</button>
          <button class="btn secondary" data-action="rename">Change Name</button>
        </div>

        <div id="join-form" class="join-form hidden">
          <input type="text" id="room-code" placeholder="Room Code" maxlength="6" autocomplete="off" />
          <button class="btn primary" data-action="join-confirm">Join</button>
        </div>

        <div id="name-form" class="join-form hidden">
          <input type="text" id="new-name" placeholder="Your name" maxlength="20" autocomplete="off" />
          <button class="btn primary" data-action="name-confirm">Save</button>
        </div>
      </div>
    `;
    this._bind();
  }

  showLobby(roomId, players, isHost, metadata) {
    const playerList = Object.values(players || {}).map(p => {
      const name = escapeHtml(p.name || "Player");
      const skin = p.skin && p.skin !== "classic" ? ` [${escapeHtml(p.skin)}]` : "";
      const ready = !!p.ready;
      return `
        <div class="player-item ${ready ? "ready" : ""}">
          <span>${name}${skin}</span>
          <span class="badge">${ready ? "READY" : "..."}</span>
        </div>`;
    }).join("");

    this.container.innerHTML = `
      <div class="menu-screen lobby">
        <h2>Room: <span class="room-code">${escapeHtml(roomId)}</span></h2>
        <p>Mode: ${escapeHtml(metadata?.mode || "race")} · Seed: ${escapeHtml(String(metadata?.seed ?? "-"))}</p>
        <div class="player-list">${playerList || "<p>Waiting for players...</p>"}</div>
        <div class="menu-buttons">
          <button class="btn primary" data-action="ready">Toggle Ready</button>
          ${isHost ? '<button class="btn primary" data-action="start">Start Game</button>' : '<p style="font-size:13px;color:#888">Waiting for host...</p>'}
          <button class="btn secondary" data-action="leave">Leave Room</button>
        </div>
      </div>
    `;
    this._bind();
  }

  showLeaderboard(entries) {
    const rows = (entries || []).map((e, i) => `
      <div class="lb-row">
        <span class="rank">#${i + 1}</span>
        <span class="name">${escapeHtml(e.name)}</span>
        <span class="score">${Number(e.score) || 0}</span>
      </div>
    `).join("") || "<p>No scores yet</p>";

    this.container.innerHTML = `
      <div class="menu-screen">
        <h2>Global Leaderboard</h2>
        <div class="leaderboard-list">${rows}</div>
        <button class="btn" data-action="back">Back</button>
      </div>
    `;
    this._bind();
  }

  showCountdown(seconds) {
    this.container.innerHTML = `
      <div class="menu-screen countdown">
        <h1 class="big-number">${Number(seconds) || 0}</h1>
        <p>Get Ready!</p>
      </div>
    `;
  }

  hide() {
    this.container.innerHTML = "";
  }

  _bind() {
    this.container.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (this.onAction) this.onAction(action, this.container);
      });
    });
  }
}
