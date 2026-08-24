/* ─────────────────────────────────────────────────────────────
 * FedShield — Firebase Initialization & Auth Integration
 * Project: fedshield-25be4
 * ───────────────────────────────────────────────────────────── */
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyDemoKeyForFedShieldFirebase25be4",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "fedshield-25be4.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "fedshield-25be4",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "fedshield-25be4.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "102938475612",
  appId: env.VITE_FIREBASE_APP_ID || "1:102938475612:web:a1b2c3d4e5f6g7h8",
};

// Initialize Firebase App safely
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleAuthProvider = new GoogleAuthProvider();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
};
