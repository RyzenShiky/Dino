import {
  ref,
  get,
  query,
  orderByChild,
  limitToLast,
  onValue,
  runTransaction,
  serverTimestamp,
  update
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "../multiplayer/Firebase.js";
import { authManager } from "../multiplayer/Auth.js";

export class LeaderboardManager {
  constructor() {
    this.allTime = [];
  }

  async submitScore(score, name) {
    if (!authManager.uid || score <= 0) return false;
    if (score > 300000) {
      console.warn("Score rejected: too high");
      return false;
    }

    const entry = {
      name: name || authManager.displayName,
      score: Math.floor(score),
      timestamp: serverTimestamp(), // server time (bug #19)
      uid: authManager.uid
    };

    // All-time – atomic compare-and-set (bug #15)
    const allTimeRef = ref(db, `leaderboards/allTime/${authManager.uid}`);
    await runTransaction(allTimeRef, (cur) => {
      if (!cur || cur.score < entry.score) return entry;
      return; // abort
    });

    // Daily
    const today = new Date().toISOString().slice(0, 10);
    const dailyRef = ref(db, `leaderboards/daily/${today}/${authManager.uid}`);
    await runTransaction(dailyRef, (cur) => {
      if (!cur || cur.score < entry.score) return entry;
      return;
    });

    // Stats / wallet updates must go through Cloud Functions (rules block client writes)
    return true;
  }

  async getTopAllTime(limit = 20) {
    const q = query(
      ref(db, "leaderboards/allTime"),
      orderByChild("score"),
      limitToLast(limit)
    );
    const snap = await get(q);
    if (!snap.exists()) return [];
    const list = [];
    snap.forEach((child) => {
      list.push(child.val());
    });
    return list.sort((a, b) => b.score - a.score);
  }

  listenTopAllTime(limit = 20, cb) {
    const q = query(
      ref(db, "leaderboards/allTime"),
      orderByChild("score"),
      limitToLast(limit)
    );
    return onValue(q, (snap) => {
      const list = [];
      if (snap.exists()) {
        snap.forEach((child) => list.push(child.val()));
      }
      cb(list.sort((a, b) => b.score - a.score));
    });
  }
}

export const leaderboardManager = new LeaderboardManager();
