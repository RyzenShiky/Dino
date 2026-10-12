import {
  signInAnonymously,
  onAuthStateChanged,
  linkWithPopup,
  GoogleAuthProvider,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { auth } from "./Firebase.js";
import {
  ref,
  set,
  get,
  update,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./Firebase.js";

export class AuthManager {
  constructor() {
    this.user = null;
    this.uid = null;
    this.displayName = null;
    this.listeners = [];
  }

  async init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          this.user = user;
          this.uid = user.uid;
          this.displayName = this._sanitizeName(user.displayName) || `Dino_${user.uid.slice(0, 6)}`;
          await this.ensureUserProfile();
          this._notify();
          resolve(user);
        } else {
          // Auto anonymous sign-in
          try {
            const cred = await signInAnonymously(auth);
            this.user = cred.user;
            this.uid = cred.user.uid;
            this.displayName = `Dino_${cred.user.uid.slice(0, 6)}`;
            await this.ensureUserProfile();
            this._notify();
            resolve(cred.user);
          } catch (err) {
            console.error("Anonymous sign-in failed", err);
            resolve(null);
          }
        }
      });
    });
  }

  async ensureUserProfile() {
    if (!this.uid) return;
    const userRef = ref(db, `users/${this.uid}/profile`);
    const snap = await get(userRef);
    if (!snap.exists()) {
      // Single multi-path update so a tab close mid-write cannot leave a half profile (bug #14)
      await update(ref(db), {
        [`users/${this.uid}/profile`]: {
          name: this.displayName,
          createdAt: serverTimestamp(),
          isAnonymous: this.user.isAnonymous
        },
        [`users/${this.uid}/stats`]: {
          totalRuns: 0,
          totalDistance: 0,
          bestScore: 0,
          totalJumps: 0
        },
        [`users/${this.uid}/cosmetics`]: {
          skin: "classic",
          hat: null,
          trail: null
        },
        [`users/${this.uid}/wallet`]: {
          coins: 100
        }
        // inventory is Cloud-Function only (rules .write: false)
      });
    } else {
      const data = snap.val();
      this.displayName = this._sanitizeName(data.name) || this.displayName;
    }
  }

  /** Sanitize display name to satisfy rules (max 20, no HTML-ish chars) */
  _sanitizeName(name) {
    return String(name || "").replace(/[<>&"'`]/g, "").trim().slice(0, 20);
  }

  async setDisplayName(name) {
    if (!this.uid || !name) return;
    const clean = this._sanitizeName(name);
    if (!clean) return;
    this.displayName = clean;
    await set(ref(db, `users/${this.uid}/profile/name`), this.displayName);
    if (this.user) {
      try {
        await updateProfile(this.user, { displayName: this.displayName });
      } catch (e) {}
    }
    this._notify();
  }

  async linkGoogle() {
    if (!this.user || !this.user.isAnonymous) return;
    const provider = new GoogleAuthProvider();
    try {
      const result = await linkWithPopup(this.user, provider);
      this.user = result.user;
      this.displayName = this._sanitizeName(result.user.displayName) || this.displayName;
      await set(ref(db, `users/${this.uid}/profile/isAnonymous`), false);
      await set(ref(db, `users/${this.uid}/profile/name`), this.displayName);
      this._notify();
      return true;
    } catch (err) {
      console.error("Link Google failed", err);
      return false;
    }
  }

  onAuthChange(cb) {
    this.listeners.push(cb);
    if (this.user) cb(this.user);
  }

  _notify() {
    this.listeners.forEach(cb => cb(this.user));
  }

  get isReady() {
    return !!this.uid;
  }
}

export const authManager = new AuthManager();
