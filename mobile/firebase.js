import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let auth;
let firebaseInitializationError = "";
const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(
    ([key]) =>
      `EXPO_PUBLIC_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`
  );

if (missingFirebaseConfig.length === 0) {
  try {
    const firebaseApp = getApps().length
      ? getApp()
      : initializeApp(firebaseConfig);

    try {
      auth = initializeAuth(firebaseApp, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (error) {
      if (error.code !== "auth/already-initialized") {
        throw error;
      }
      auth = getAuth(firebaseApp);
    }
  } catch (error) {
    firebaseInitializationError =
      error.message || "Firebase could not be initialized.";
  }
}

export { auth };
export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  ?.trim()
  .replace(/\/+$/, "");
export const firebaseConfigError = missingFirebaseConfig.length
  ? `Missing ${missingFirebaseConfig.join(", ")}.`
  : firebaseInitializationError;
