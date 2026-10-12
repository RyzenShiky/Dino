import { authManager } from "./multiplayer/Auth.js";
import { roomManager } from "./multiplayer/RoomManager.js";
import { presenceManager } from "./multiplayer/Presence.js";
import { leaderboardManager } from "./social/Leaderboard.js";
import { RemotePlayerManager } from "./multiplayer/Interpolation.js";
import { RemoteRenderer } from "./multiplayer/RemoteRenderer.js";
import { ReplayRecorder } from "./replay/Recorder.js";
import { cosmeticManager } from "./cosmetics/CosmeticManager.js";
import { dailySeed, seedStreams, clearStreams } from "./engine/RNG.js";
import { setRandomSource, RandomSource } from "../resources/dino_game/random_source.js";
import { MenuUI } from "./ui/Menu.js";
import { Runner } from "../resources/dino_game/offline.js";

class DinoApp {
  constructor() {
    this.menuEl = document.getElementById("menu-root");
    this.gameEl = document.getElementById("game-root");
    this.menu = new MenuUI(this.menuEl);
    this.runner = null;
    this.mode = "menu";
    this.syncInterval = null;
    this.remoteManager = null;
    this.remoteRenderer = null;
    this.recorder = null;
    this.rafId = null;
    this.lastFrameTime = 0;
    this.seed = null;
    this.started = false;
    this.gameOverOnce = false;
    this._overlayResizeObs = null;
    this.cheats = { god: false, auto: false, slow: false };
    this.cheated = false;
  }

  async init() {
    this.menu.onAction = (action, el) => this.handleMenuAction(action, el);

    await authManager.init();
    presenceManager.init();
    await cosmeticManager.load();

    authManager.onAuthChange((user) => {
      if (this.mode === "menu") {
        this.menu.showMainMenu(authManager.displayName);
      }
    });

    // Secret cheat menu: type "adi" in any game mode
    let buf = "";
    window.addEventListener("keydown", (e) => {
      if (e.target.matches?.("input,textarea") || e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-3);
      const playModes = ["classic", "daily", "multiplayer", "countdown"];
      if (buf === "adi" && playModes.includes(this.mode)) this.toggleCheatMenu();
    });

    this.menu.showMainMenu(authManager.displayName || "Player");
  }

  toggleCheatMenu() {
    const old = document.getElementById("cheat-menu");
    if (old) return old.remove();
    const el = Object.assign(document.createElement("div"), { id: "cheat-menu" });
    el.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:99;background:#222;color:#fff;padding:10px;border-radius:8px;font:12px system-ui";
    el.innerHTML = Object.keys(this.cheats)
      .map(
        (k) =>
          `<label style="display:block"><input type="checkbox" data-k="${k}" ${
            this.cheats[k] ? "checked" : ""
          }> ${k}</label>`
      )
      .join("");
    el.onchange = (e) => {
      const key = e.target.dataset.k;
      if (!key) return;
      this.cheats[key] = e.target.checked;
      if (e.target.checked) this.cheated = true;
      e.target.blur(); // so Space does not toggle the checkbox
    };
    document.body.appendChild(el);
  }

  _clearCheats() {
    this.cheated = false;
    Object.keys(this.cheats).forEach((k) => (this.cheats[k] = false));
    document.getElementById("cheat-menu")?.remove();
  }

  async handleMenuAction(action, el) {
    switch (action) {
      case "classic":
        this.startClassic();
        break;
      case "create":
        try {
          await roomManager.createRoom("race", 8);
          this.enterLobby();
        } catch (e) {
          alert("Failed to create room: " + e.message);
        }
        break;
      case "join":
        el.querySelector("#join-form")?.classList.toggle("hidden");
        break;
      case "join-confirm": {
        const code = el.querySelector("#room-code")?.value?.trim().toUpperCase();
        if (!code) return;
        try {
          await roomManager.joinRoom(code);
          this.enterLobby();
        } catch (e) {
          alert(e.message);
        }
        break;
      }
      case "leaderboard": {
        const top = await leaderboardManager.getTopAllTime(20);
        this.menu.showLeaderboard(top);
        break;
      }
      case "back":
        this.menu.showMainMenu(authManager.displayName);
        break;
      case "rename":
        el.querySelector("#name-form")?.classList.toggle("hidden");
        break;
      case "name-confirm": {
        const name = el.querySelector("#new-name")?.value?.trim();
        if (name) {
          await authManager.setDisplayName(name);
          this.menu.showMainMenu(authManager.displayName);
        }
        break;
      }
      case "ready": {
        const me = roomManager.players[authManager.uid];
        await roomManager.setReady(!(me && me.ready));
        break;
      }
      case "start":
        if (roomManager.isHost) await roomManager.startRace();
        break;
      case "leave":
        this.mode = "menu"; // prevent Room closed handler from firing
        await roomManager.leaveRoom();
        this.menu.showMainMenu(authManager.displayName);
        break;
      case "shop":
        this.showShop();
        break;
      case "daily":
        this.startDailyChallenge();
        break;
    }
  }

  showShop() {
    alert(
      `Shop coming soon!\nCurrent skin: ${cosmeticManager.cosmetics.skin}\nCoins: ${cosmeticManager.coins}`
    );
  }

  enterLobby() {
    this.mode = "lobby";
    this.started = false;

    // Seed local mirror with cosmetics so rejoin keeps skin
    const cos = cosmeticManager.getCurrent();
    roomManager.updatePlayer({
      skin: cos.skin || "classic",
      hat: cos.hat || null,
      trail: cos.trail || null
    }).catch(() => {});

    roomManager.onPlayers((players) => {
      if (this.mode === "lobby") {
        this.menu.showLobby(
          roomManager.roomId,
          players,
          roomManager.isHost,
          roomManager.metadata
        );
      }
    });

    roomManager.onState((state) => {
      if (!state) return;
      if (state.phase === "playing" && !this.started) {
        this.started = true;
        // Prepare runner immediately (input blocked), begin exactly at startAt
        this.prepareRace();
        const delay = Math.max(0, (state.startAt || 0) - roomManager.now());
        if (delay > 50) {
          this.mode = "countdown";
          let left = Math.ceil(delay / 1000);
          this.menu.showCountdown(left);
          const t = setInterval(() => {
            left--;
            if (left > 0) this.menu.showCountdown(left);
            else clearInterval(t);
          }, 1000);
        }
        setTimeout(() => {
          if (this.runner) this.runner.begin();
          this.mode = "multiplayer";
        }, delay);
      }
    });

    // Host left lobby → room deleted; bounce everyone back to menu
    roomManager.onMetadata((metadata) => {
      if (metadata === null && (this.mode === "lobby" || this.mode === "countdown")) {
        alert("Room closed");
        this.backToMenu();
      }
    });

    this.menu.showLobby(
      roomManager.roomId,
      roomManager.players,
      roomManager.isHost,
      roomManager.metadata
    );
  }

  _createGameContainer() {
    this.menu.hide();
    this.gameEl.style.display = "block";
    this.gameEl.innerHTML = "";
    const container = document.createElement("div");
    container.className = "trex-game";
    this.gameEl.appendChild(container);
    return container;
  }

  _hookGameOver(scoreSubmit = true) {
    this.gameOverOnce = false;
    const origGameOver = this.runner.gameOver.bind(this.runner);
    this.runner.gameOver = () => {
      if (this.gameOverOnce) return;
      this.gameOverOnce = true;

      origGameOver();
      clearInterval(this.syncInterval);
      this.syncInterval = null;

      const score = Math.ceil((this.runner.distanceRan || 0) * 0.025);
      if (this.mode === "multiplayer") {
        roomManager
          .updatePlayer({ alive: false, score, state: "CRASHED" })
          .catch(console.warn);
      }
      // Cheated runs never submit to leaderboard
      if (scoreSubmit && score > 0 && !this.cheated) {
        leaderboardManager
          .submitScore(score, authManager.displayName)
          .catch(console.warn);
      }
      if (this.recorder) {
        const replay = this.recorder.stop();
        console.log("Replay recorded:", replay);
      }

      setTimeout(() => {
        if (this.gameEl.querySelector(".back-btn")) return;
        const back = document.createElement("button");
        back.className = "btn back-btn";
        back.textContent = "Back to Menu";
        back.onclick = () => this.backToMenu();
        this.gameEl.appendChild(back);
      }, 1200);
    };

    const origRestart = this.runner.restart.bind(this.runner);
    this.runner.restart = () => {
      if (this.mode === "multiplayer") return;
      if (this.seed) seedStreams(this.seed);
      this.gameOverOnce = false;
      origRestart();
    };
  }

  startClassic() {
    this.mode = "classic";
    this.seed = null;
    this._clearCheats();
    this._resetRng();
    const container = this._createGameContainer();
    this.runner = new Runner(container);
    this.runner.cheats = this.cheats;
    this.recorder = new ReplayRecorder(0);
    this.recorder.start();
    window.addEventListener("keydown", this._onKeyForReplay);
    this._hookGameOver(true);
  }

  _onKeyForReplay = (e) => {
    if (!this.recorder || !this.recorder.recording) return;
    if (e.code === "Space" || e.code === "ArrowUp") this.recorder.record("jump");
    if (e.code === "ArrowDown") this.recorder.record("duck");
  };

  startDailyChallenge() {
    this.mode = "daily";
    this._clearCheats();
    const seed = dailySeed();
    this.seed = seed;
    console.log("Daily seed:", seed);
    this._activateSeed(seed);
    const container = this._createGameContainer();
    this.runner = new Runner(container);
    this.runner.cheats = this.cheats;
    this.recorder = new ReplayRecorder(seed);
    this.recorder.start();
    window.addEventListener("keydown", this._onKeyForReplay);
    this._hookGameOver(true);
  }

  /**
   * Build runner + overlay while inputBlocked; begin() is called later at startAt.
   */
  prepareRace() {
    if (this.runner) return;
    this.mode = "multiplayer";
    this._clearCheats();
    const container = this._createGameContainer();

    const seed = roomManager.getSeed();
    this.seed = seed;
    console.log("Race seed:", seed);
    this._activateSeed(seed);

    this.runner = new Runner(container);
    this.runner.cheats = this.cheats;
    this.runner.inputBlocked = true; // Space does nothing until begin()

    this.remoteManager = new RemotePlayerManager(authManager.uid);
    this.remoteRenderer = new RemoteRenderer(null);
    this.recorder = new ReplayRecorder(seed);
    this.recorder.start();
    window.addEventListener("keydown", this._onKeyForReplay);

    const cosmetics = cosmeticManager.getCurrent();
    roomManager
      .updatePlayer({
        skin: cosmetics.skin || "classic",
        hat: cosmetics.hat || null,
        trail: cosmetics.trail || null,
        alive: true,
        score: 0,
        state: "WAITING"
      })
      .catch(console.warn);

    this.syncInterval = setInterval(() => {
      if (!this.runner || !this.runner.playing) return;
      const tRex = this.runner.tRex;
      if (!tRex) return;
      const myScore = Math.ceil((this.runner.distanceRan || 0) * 0.025);
      roomManager
        .updatePlayer({
          score: myScore,
          alive: !this.runner.crashed,
          state: tRex.status || "RUNNING"
        })
        .catch(console.warn);
    }, 80);

    roomManager.onPlayers((players) => {
      if (this.remoteManager) this.remoteManager.syncFromSnapshot(players);
    });

    this._createOverlayCanvas(container);
    this._hookGameOver(true);
  }

  /** @deprecated – prefer prepareRace + begin at startAt */
  startMultiplayer() {
    this.prepareRace();
    if (this.runner) this.runner.begin();
  }

  _createOverlayCanvas(container) {
    const overlay = document.createElement("canvas");
    overlay.id = "remote-overlay";
    overlay.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;z-index:10;";
    container.style.position = "relative";
    container.appendChild(overlay);

    this.remoteRenderer = new RemoteRenderer(overlay);

    const syncSize = () => {
      const mainCanvas = container.querySelector("canvas:not(#remote-overlay)");
      if (!mainCanvas) return;
      overlay.width = mainCanvas.width;
      overlay.height = mainCanvas.height;
      overlay.style.width = mainCanvas.style.width || mainCanvas.offsetWidth + "px";
      overlay.style.height =
        mainCanvas.style.height || mainCanvas.offsetHeight + "px";
      // HiDPI: scale CSS pixels to backing-store pixels
      const r = mainCanvas.offsetWidth
        ? mainCanvas.width / mainCanvas.offsetWidth
        : 1;
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.setTransform(r, 0, 0, r, 0, 0);
      // Use real Trex foot line when available
      if (this.runner?.tRex) {
        this.remoteRenderer.footY =
          this.runner.tRex.groundYPos + (this.runner.tRex.config?.HEIGHT || 47);
      }
    };

    if (this._overlayResizeObs) this._overlayResizeObs.disconnect();
    this._overlayResizeObs = new ResizeObserver(syncSize);
    const tryObserve = () => {
      const c = container.querySelector("canvas:not(#remote-overlay)");
      if (c) {
        this._overlayResizeObs.observe(c);
        syncSize();
      } else {
        setTimeout(tryObserve, 50);
      }
    };
    tryObserve();

    this.lastFrameTime = performance.now();
    const loop = (now) => {
      if (this.mode !== "multiplayer" && this.mode !== "countdown") return;
      const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      if (this.remoteManager) this.remoteManager.update(dt);

      const ctx = overlay.getContext("2d");
      if (ctx) {
        // clear in CSS-pixel space (transform already applied)
        const w = overlay.width / (ctx.getTransform().a || 1);
        const h = overlay.height / (ctx.getTransform().d || 1);
        ctx.clearRect(0, 0, w, h);
        const myScore = this.runner
          ? Math.ceil((this.runner.distanceRan || 0) * 0.025)
          : 0;
        this.remoteRenderer.draw(this.remoteManager?.getAll() || [], myScore);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _activateSeed(seed) {
    if (seed && seed > 0) {
      seedStreams(seed);
      console.log("[RNG] Seeded streams active, seed =", seed);
    } else {
      clearStreams();
      setRandomSource(new RandomSource());
      console.log("[RNG] Classic Math.random mode");
    }
  }

  _resetRng() {
    clearStreams();
    setRandomSource(new RandomSource());
  }

  backToMenu() {
    if (this.runner) {
      try {
        this.runner.destroy();
      } catch (e) {}
      this.runner = null;
    }
    clearInterval(this.syncInterval);
    this.syncInterval = null;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this._overlayResizeObs) {
      this._overlayResizeObs.disconnect();
      this._overlayResizeObs = null;
    }
    window.removeEventListener("keydown", this._onKeyForReplay);
    if (this.remoteManager) this.remoteManager.clear();
    this.remoteManager = null;
    this.remoteRenderer = null;
    this.started = false;
    this.gameOverOnce = false;
    this.seed = null;
    this._clearCheats();

    this.gameEl.style.display = "none";
    this.gameEl.innerHTML = "";
    this.mode = "menu"; // before leaveRoom so Room closed handler stays quiet
    this._resetRng();
    roomManager.leaveRoom().catch(() => {});
    this.menu.showMainMenu(authManager.displayName);
  }
}

window.addEventListener("load", () => {
  const app = new DinoApp();
  app.init();
  window.dinoApp = app;
});
