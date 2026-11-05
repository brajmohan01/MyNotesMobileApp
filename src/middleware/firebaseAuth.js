import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";
import path from "node:path";

const APP_NAME = "mynotesmobileapp";
let firebaseAuth;

function getFirebaseAuth() {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson && serviceAccountPath) {
    try {
      serviceAccountJson = readFileSync(
        path.resolve(process.cwd(), serviceAccountPath),
        "utf8"
      );
    } catch (error) {
      throw new Error(
        `Could not read Firebase service account file at ${serviceAccountPath}`,
        { cause: error }
      );
    }
  }

  if (!serviceAccountJson) {
    throw new Error(
      "Set FIREBASE_SERVICE_ACCOUNT_PATH to a Firebase service-account JSON file, or FIREBASE_SERVICE_ACCOUNT_JSON to its contents."
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON");
  }

  if (
    !serviceAccount ||
    typeof serviceAccount !== "object" ||
    serviceAccount.project_id !== "mynotes-13c34"
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON must belong to project mynotes-13c34"
    );
  }

  const app =
    getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp(
      {
        credential: cert(serviceAccount),
        projectId: "mynotes-13c34",
      },
      APP_NAME
    );

  firebaseAuth = getAuth(app);
  return firebaseAuth;
}

export async function requireFirebaseUser(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      code: "authentication_required",
      message: "Sign in to continue.",
    });
  }

  let auth;
  try {
    auth = getFirebaseAuth();
  } catch (error) {
    console.error("Firebase authentication configuration error:", error);
    return res.status(503).json({
      success: false,
      code: "authentication_unavailable",
      message:
        "Firebase Admin credentials are missing or invalid. For local setup, copy .env.example to .env and set FIREBASE_SERVICE_ACCOUNT_PATH to your Firebase service-account JSON file.",
    });
  }

  try {
    req.firebaseUser = await auth.verifyIdToken(match[1]);
    return next();
  } catch (error) {
    console.error("Firebase ID token verification failed:", error);
    return res.status(401).json({
      success: false,
      code: "invalid_authentication",
      message: "Your session is invalid or expired. Sign in again.",
    });
  }
}
