import {
  ref,
  get,
  set,
  update,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "../multiplayer/Firebase.js";
import { authManager } from "../multiplayer/Auth.js";

export const SKINS = {
  classic: { name: "Classic", price: 0 },
  ninja: { name: "Ninja", price: 500 },
  robot: { name: "Robot", price: 1000 },
  fire: { name: "Fire", price: 1500 },
  gold: { name: "Gold", price: 3000 },
  ghost: { name: "Ghost", price: 2000 }
};

export const HATS = {
  none: { name: "None", price: 0 },
  crown: { name: "Crown", price: 800 },
  cap: { name: "Cap", price: 300 },
  helmet: { name: "Helmet", price: 600 }
};

export const TRAILS = {
  none: { name: "None", price: 0 },
  fire: { name: "Fire Trail", price: 700 },
  blue: { name: "Blue Trail", price: 500 },
  rainbow: { name: "Rainbow", price: 1200 }
};

export class CosmeticManager {
  constructor() {
    this.cosmetics = {
      skin: "classic",
      hat: null,
      trail: null
    };
    this.inventory = {
      skins: { classic: true },
      hats: { none: true },
      trails: { none: true }
    };
    this.coins = 0;
  }

  async load() {
    if (!authManager.uid) return;
    const snap = await get(ref(db, `users/${authManager.uid}`));
    if (!snap.exists()) return;
    const data = snap.val();
    if (data.cosmetics) this.cosmetics = { ...this.cosmetics, ...data.cosmetics };
    if (data.inventory) this.inventory = { ...this.inventory, ...data.inventory };
    if (data.wallet) this.coins = data.wallet.coins || 0;
  }

  async equip(type, id) {
    if (!authManager.uid) return false;
    if (type === "skin" && !this.inventory.skins?.[id] && SKINS[id]?.price > 0) return false;
    if (type === "hat" && id !== "none" && !this.inventory.hats?.[id]) return false;
    if (type === "trail" && id !== "none" && !this.inventory.trails?.[id]) return false;

    this.cosmetics[type] = id === "none" ? null : id;
    await set(ref(db, `users/${authManager.uid}/cosmetics/${type}`), this.cosmetics[type]);
    return true;
  }

  async buy(type, id) {
    // Purchases must go through a Cloud Function that validates price from a
    // server-side catalog and transactions wallet + inventory atomically.
    // Client-side coin writes are blocked by security rules (bug #16).
    console.warn("buy() requires Cloud Function – client wallet writes are disabled");
    return { ok: false, reason: "use_cloud_function" };
  }

  getCurrent() {
    return { ...this.cosmetics };
  }
}

export const cosmeticManager = new CosmeticManager();
