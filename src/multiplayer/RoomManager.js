import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
  off
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./Firebase.js";
import { authManager } from "./Auth.js";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class RoomManager {
  constructor() {
    this.roomId = null;
    this.roomRef = null;
    this.isHost = false;
    this.players = {};
    this.metadata = null;
    this.state = null;
    this.listeners = {
      players: [],
      state: [],
      metadata: []
    };
    this._unsubs = [];
    this.offset = 0; // server time offset (ms)
    this._hostDisconnectCancel = null;
    this._connUnsub = null;
    this._localPlayer = null; // last known ready/skin/etc for rejoin
  }

  /** Server-corrected wall clock */
  now() {
    return Date.now() + this.offset;
  }

  async _syncServerTime() {
    return new Promise((resolve) => {
      const offsetRef = ref(db, ".info/serverTimeOffset");
      onValue(
        offsetRef,
        (snap) => {
          this.offset = snap.val() || 0;
          resolve(this.offset);
        },
        { onlyOnce: true }
      );
    });
  }

  async createRoom(mode = "race", maxPlayers = 8) {
    if (!authManager.isReady) throw new Error("Not authenticated");
    await this._syncServerTime();

    const roomId = generateRoomCode();
    const roomRef = ref(db, `rooms/${roomId}`);

    const metadata = {
      host: authManager.uid,
      mode,
      maxPlayers,
      status: "lobby",
      seed: Math.floor(Math.random() * 1000000000),
      createdAt: serverTimestamp(),
      biome: "desert"
    };

    await set(roomRef, {
      metadata,
      players: {},
      state: {
        phase: "lobby",
        startAt: null
      },
      events: {}
    });

    this.roomId = roomId;
    this.roomRef = roomRef;
    this.isHost = true;
    this.metadata = metadata;

    // Room cleanup if host disconnects while still in lobby (bug #12)
    const disc = onDisconnect(ref(db, `rooms/${roomId}`));
    await disc.remove();
    this._hostDisconnectCancel = () => disc.cancel();

    await this.joinRoom(roomId);
    this._listenRoom();
    return roomId;
  }

  async joinRoom(roomId) {
    if (!authManager.isReady) throw new Error("Not authenticated");
    await this._syncServerTime();

    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);
    if (!snap.exists()) throw new Error("Room not found");

    const data = snap.val();
    if (data.metadata.status !== "lobby") {
      throw new Error("Game already started");
    }

    const playerCount = data.players ? Object.keys(data.players).length : 0;
    if (playerCount >= data.metadata.maxPlayers) {
      throw new Error("Room is full");
    }

    this.roomId = roomId;
    this.roomRef = roomRef;
    this.isHost = data.metadata.host === authManager.uid;
    this.metadata = data.metadata;

    const playerData = {
      uid: authManager.uid,
      name: authManager.displayName,
      score: 0,
      alive: true,
      ready: false,
      state: "idle",
      skin: "classic",
      lastUpdate: serverTimestamp()
    };
    this._localPlayer = { ready: false, skin: "classic", name: authManager.displayName };

    const playerRef = ref(db, `rooms/${roomId}/players/${authManager.uid}`);
    await set(playerRef, playerData);
    onDisconnect(playerRef).remove();

    this._listenRoom();
    this._watchConnection();
    return true;
  }

  async setReady(ready = true) {
    if (!this.roomId) return;
    this._localPlayer = { ...(this._localPlayer || {}), ready };
    await update(ref(db, `rooms/${this.roomId}/players/${authManager.uid}`), {
      ready,
      lastUpdate: serverTimestamp()
    });
  }

  /**
   * Single atomic write that both starts the race and publishes startAt
   * based on server time (bug #11). Cancels host onDisconnect so the
   * room is not deleted mid-race (bug #12).
   */
  async startRace() {
    if (!this.isHost || !this.roomId) return;
    await this._syncServerTime();

    // Cancel room deletion once the race is live
    if (this._hostDisconnectCancel) {
      try { await this._hostDisconnectCancel(); } catch (_) {}
      this._hostDisconnectCancel = null;
    }

    const startAt = this.now() + 3000;
    await update(ref(db), {
      [`rooms/${this.roomId}/metadata/status`]: "playing",
      [`rooms/${this.roomId}/state`]: {
        phase: "playing",
        startAt
      }
    });
  }

  /** @deprecated – use startRace */
  async startCountdown() {
    return this.startRace();
  }

  /** @deprecated – use startRace */
  async startGame() {
    return this.startRace();
  }

  async updatePlayer(data) {
    if (!this.roomId || !authManager.uid) return;
    // Keep a client-side mirror so lobby rejoin can restore ready/skin
    if (data.ready !== undefined || data.skin !== undefined || data.name !== undefined) {
      this._localPlayer = {
        ...(this._localPlayer || {}),
        ...(data.ready !== undefined ? { ready: data.ready } : {}),
        ...(data.skin !== undefined ? { skin: data.skin } : {}),
        ...(data.name !== undefined ? { name: data.name } : {})
      };
    }
    try {
      await update(ref(db, `rooms/${this.roomId}/players/${authManager.uid}`), {
        ...data,
        lastUpdate: serverTimestamp()
      });
    } catch (e) {
      console.warn("updatePlayer failed", e);
    }
  }

  async leaveRoom() {
    if (!this.roomId || !authManager.uid) return;
    const roomId = this.roomId;
    const wasHost = this.isHost;
    const wasLobby = this.metadata?.status === "lobby";

    try {
      // Host leaving lobby → delete whole room (no orphans)
      if (wasHost && wasLobby) {
        if (this._hostDisconnectCancel) {
          try { await this._hostDisconnectCancel(); } catch (_) {}
          this._hostDisconnectCancel = null;
        }
        await remove(ref(db, `rooms/${roomId}`));
      } else {
        await remove(ref(db, `rooms/${roomId}/players/${authManager.uid}`));
      }
    } catch (_) {}

    this._cleanup(); // also unsubs connection watcher
    this.roomId = null;
    this.roomRef = null;
    this.isHost = false;
    this._hostDisconnectCancel = null;
    this._localPlayer = null;
  }


  /**
   * Re-arm onDisconnect and rejoin lobby player node when the websocket
   * reconnects. Firebase clears onDisconnect handlers after a disconnect,
   * so without this a brief blip permanently removes the player (and the
   * room if host). Race-time rejoin is intentionally blocked by rules.
   */
  _watchConnection() {
    if (this._connUnsub) return;
    const connRef = ref(db, ".info/connected");
    this._connUnsub = onValue(connRef, async (snap) => {
      if (snap.val() !== true || !this.roomId) return;
      const lobby = this.metadata?.status === "lobby";
      const pRef = ref(db, `rooms/${this.roomId}/players/${authManager.uid}`);
      try {
        if (lobby && !(await get(pRef)).exists()) {
          const lp = this._localPlayer || {};
          await set(pRef, {
            uid: authManager.uid,
            name: lp.name || authManager.displayName,
            score: 0,
            alive: true,
            ready: !!lp.ready,
            state: "idle",
            skin: lp.skin || "classic",
            lastUpdate: serverTimestamp()
          });
        }
        // Always re-arm player cleanup
        onDisconnect(pRef).remove();
        // Host: re-arm room deletion while still in lobby
        if (this.isHost && lobby) {
          const d = onDisconnect(ref(db, `rooms/${this.roomId}`));
          await d.remove();
          this._hostDisconnectCancel = () => d.cancel();
        }
      } catch (e) {
        console.warn("rejoin failed", e);
      }
    });
  }

  _listenRoom() {
    this._cleanupListeners();

    const playersRef = ref(db, `rooms/${this.roomId}/players`);
    onValue(playersRef, (snap) => {
      this.players = snap.val() || {};
      this.listeners.players.forEach((cb) => cb(this.players));
    });
    this._unsubs.push(() => off(playersRef));

    const metaRef = ref(db, `rooms/${this.roomId}/metadata`);
    onValue(metaRef, (snap) => {
      this.metadata = snap.val();
      this.listeners.metadata.forEach((cb) => cb(this.metadata));
    });
    this._unsubs.push(() => off(metaRef));

    const stateRef = ref(db, `rooms/${this.roomId}/state`);
    onValue(stateRef, (snap) => {
      this.state = snap.val();
      this.listeners.state.forEach((cb) => cb(this.state));
    });
    this._unsubs.push(() => off(stateRef));
  }

  onPlayers(cb) {
    // Avoid stacking identical listeners across re-enters
    if (!this.listeners.players.includes(cb)) {
      this.listeners.players.push(cb);
    }
  }
  onState(cb) {
    if (!this.listeners.state.includes(cb)) {
      this.listeners.state.push(cb);
    }
  }
  onMetadata(cb) {
    if (!this.listeners.metadata.includes(cb)) {
      this.listeners.metadata.push(cb);
    }
  }

  _cleanupListeners() {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
  }

  _cleanup() {
    this._cleanupListeners();
    this.listeners = { players: [], state: [], metadata: [] };
    if (this._connUnsub) {
      this._connUnsub();
      this._connUnsub = null;
    }
  }

  getSeed() {
    return this.metadata?.seed || 0;
  }
}

export const roomManager = new RoomManager();
