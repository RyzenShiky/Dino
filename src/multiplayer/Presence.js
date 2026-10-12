import {
  ref,
  onValue,
  push,
  set,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./Firebase.js";
import { authManager } from "./Auth.js";

export class PresenceManager {
  constructor() {
    this.connected = false;
  }

  init() {
    if (!authManager.uid) return;

    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, async (snap) => {
      if (snap.val() !== true) {
        this.connected = false;
        return;
      }
      this.connected = true;

      const myConnectionsRef = ref(db, `presence/${authManager.uid}/connections`);
      const conRef = push(myConnectionsRef);

      await onDisconnect(conRef).remove();
      await set(conRef, true);

      // Also set lastOnline
      const lastOnlineRef = ref(db, `presence/${authManager.uid}/lastOnline`);
      await onDisconnect(lastOnlineRef).set(serverTimestamp());

      // Online status
      const statusRef = ref(db, `presence/${authManager.uid}/status`);
      await set(statusRef, "online");
      await onDisconnect(statusRef).set("offline");
    });
  }
}

export const presenceManager = new PresenceManager();
