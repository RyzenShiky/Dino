// Firebase initialization module
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2-_8rvA7QEyVAObbYY5-vsRd8eLojoRs",
  authDomain: "mlauncher-auth.firebaseapp.com",
  databaseURL: "https://mlauncher-auth-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mlauncher-auth",
  storageBucket: "mlauncher-auth.firebasestorage.app",
  messagingSenderId: "652068898522",
  appId: "1:652068898522:web:7fbdf55afb2940fbbf87e3",
  measurementId: "G-NSE6FE8B8D"
};

const app = initializeApp(firebaseConfig);
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics not available", e);
}

export const auth = getAuth(app);
export const db = getDatabase(app);
export { app };
