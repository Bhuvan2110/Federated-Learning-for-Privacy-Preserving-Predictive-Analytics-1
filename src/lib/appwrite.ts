/* ─────────────────────────────────────────────────────────────
 * FedShield — Appwrite Cloud Backend Integration
 * Project ID: project-sgp-6a8d39cc003c737ffa46
 * Console: https://cloud.appwrite.io/console/project-sgp-6a8d39cc003c737ffa46
 * ───────────────────────────────────────────────────────────── */
import { Client, Account, Databases, ID, Query, OAuthProvider } from "appwrite";
import type { RunResult, PredictionRecord } from "./types";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

export const APPWRITE_ENDPOINT = env.VITE_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
export const APPWRITE_PROJECT_ID = env.VITE_APPWRITE_PROJECT_ID || "6a8d39cc003c737ffa46";
export const APPWRITE_DATABASE_ID = env.VITE_APPWRITE_DATABASE_ID || "fedshield_db";
export const APPWRITE_RUNS_COLLECTION_ID = env.VITE_APPWRITE_RUNS_COLLECTION_ID || "runs";
export const APPWRITE_PREDICTIONS_COLLECTION_ID = env.VITE_APPWRITE_PREDICTIONS_COLLECTION_ID || "predictions";


// Initialize Appwrite Client
export const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

export const account = new Account(client);
export const databases = new Databases(client);

export { ID, Query, OAuthProvider };

export interface AppwriteHealthStatus {
  online: boolean;
  endpoint: string;
  projectId: string;
  authenticated: boolean;
  userEmail?: string;
  userName?: string;
  dbReady: boolean;
  error?: string;
}

/** Check Appwrite Cloud connectivity, auth session, and database access */
export async function checkAppwriteHealth(): Promise<AppwriteHealthStatus> {
  const status: AppwriteHealthStatus = {
    online: false,
    endpoint: APPWRITE_ENDPOINT,
    projectId: APPWRITE_PROJECT_ID,
    authenticated: false,
    dbReady: false,
  };

  try {
    const u = await account.get();
    status.online = true;
    status.authenticated = true;
    status.userEmail = u.email;
    status.userName = u.name;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("401") ||
      msg.includes("unauthorized") ||
      msg.includes("User (role: guests) missing scope") ||
      msg.includes("general_unauthorized_scope")
    ) {
      status.online = true;
    } else {
      status.online = false;
      status.error = msg;
    }
  }

  try {
    if (status.online) {
      await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_RUNS_COLLECTION_ID, [Query.limit(1)]);
      status.dbReady = true;
    }
  } catch {
    status.dbReady = false;
  }

  return status;
}

/** Save a training run document to Appwrite Database (scoped to userEmail) */
export async function saveRunToAppwrite(run: RunResult, userEmail?: string): Promise<boolean> {
  try {
    const docId = run.id && /^[a-zA-Z0-9_.-]{1,36}$/.test(run.id) ? run.id : ID.unique();
    const payload = { ...run, userEmail: userEmail || run.userEmail };
    await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RUNS_COLLECTION_ID,
      docId,
      {
        datasetId: run.datasetId,
        modelName: run.modelName,
        algo: run.algo,
        roundsCount: run.rounds ? run.rounds.length : 0,
        finalAccuracy: run.final ? run.final.accuracy : 0,
        privacyEpsilon: run.epsilonSpent || 0,
        payloadJson: JSON.stringify(payload),
        createdAt: new Date(run.createdAt || Date.now()).toISOString(),
      }
    );
    return true;
  } catch (err) {
    console.warn("Appwrite saveRun fallback to local storage:", err);
    return false;
  }
}

/** Fetch historical training runs from Appwrite Database (isolated per userEmail) */
export async function fetchRunsFromAppwrite(userEmail?: string): Promise<RunResult[] | null> {
  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RUNS_COLLECTION_ID,
      [Query.orderDesc("$createdAt"), Query.limit(40)]
    );
    if (!res.documents.length) return null;
    const runs: RunResult[] = [];
    for (const doc of res.documents) {
      if (doc.payloadJson) {
        try {
          const parsed = JSON.parse(doc.payloadJson) as RunResult;
          if (parsed && parsed.id) {
            if (!userEmail || !parsed.userEmail || parsed.userEmail.toLowerCase() === userEmail.toLowerCase()) {
              runs.push(parsed);
            }
          }
        } catch {
          /* ignore parse error */
        }
      }
    }
    return runs.length ? runs : null;
  } catch (err) {
    console.warn("Appwrite fetchRuns fallback to local storage:", err);
    return null;
  }
}

/** Save a prediction record to Appwrite Database (scoped to userEmail) */
export async function savePredictionToAppwrite(pred: PredictionRecord, userEmail?: string): Promise<boolean> {
  try {
    const docId = pred.id && /^[a-zA-Z0-9_.-]{1,36}$/.test(pred.id) ? pred.id : ID.unique();
    const payload = { ...pred, userEmail: userEmail || pred.userEmail };
    await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_PREDICTIONS_COLLECTION_ID,
      docId,
      {
        datasetId: pred.datasetId,
        modelName: pred.modelName,
        label: pred.label,
        probability: pred.probability,
        domain: pred.domain,
        payloadJson: JSON.stringify(payload),
        createdAt: new Date(pred.ts || Date.now()).toISOString(),
      }
    );
    return true;
  } catch (err) {
    console.warn("Appwrite savePrediction fallback to local storage:", err);
    return false;
  }
}

/** Fetch predictions from Appwrite Database (isolated per userEmail) */
export async function fetchPredictionsFromAppwrite(userEmail?: string): Promise<PredictionRecord[] | null> {
  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_PREDICTIONS_COLLECTION_ID,
      [Query.orderDesc("$createdAt"), Query.limit(60)]
    );
    if (!res.documents.length) return null;
    const preds: PredictionRecord[] = [];
    for (const doc of res.documents) {
      if (doc.payloadJson) {
        try {
          const parsed = JSON.parse(doc.payloadJson) as PredictionRecord;
          if (parsed && parsed.id) {
            if (!userEmail || !parsed.userEmail || parsed.userEmail.toLowerCase() === userEmail.toLowerCase()) {
              preds.push(parsed);
            }
          }
        } catch {
          /* ignore parse error */
        }
      }
    }
    return preds.length ? preds : null;
  } catch (err) {
    console.warn("Appwrite fetchPredictions fallback to local storage:", err);
    return null;
  }
}

