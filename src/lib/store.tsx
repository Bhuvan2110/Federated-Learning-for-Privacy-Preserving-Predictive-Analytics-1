/* ─────────────────────────────────────────────────────────────
 * FedShield — application store
 * Run history, client registry overrides & custom clients, navigation, toasts.
 * ───────────────────────────────────────────────────────────── */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { defaultConfig, trainFederated } from "./flEngine";
import type { PageId, PredictionRecord, RunResult, Toast } from "./types";
import {
  fetchPredictionsFromAppwrite,
  fetchRunsFromAppwrite,
  savePredictionToAppwrite,
  saveRunToAppwrite,
} from "./appwrite";

import { useAuth } from "./auth";

const K_RUNS = "fedshield.runs";
const K_DISABLED = "fedshield.clients.disabled";
const K_CUSTOM_CLIENTS = "fedshield.clients.custom";
const K_DELETED_CLIENTS = "fedshield.clients.deleted";
const K_PREDS = "fedshield.predictions";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — keep in memory */
  }
}

export interface CustomClientDef {
  id: string;
  datasetId: string;
  name: string;
  org: string;
  region: string;
  nSamples: number;
  positiveRate: number;
}

interface AppCtx {
  page: PageId;
  setPage: (p: PageId) => void;
  runs: RunResult[];
  addRun: (r: RunResult) => void;
  deleteRun: (id: string) => void;
  disabledClients: Record<string, string[]>;
  toggleClient: (datasetId: string, clientId: string) => void;
  customClients: Record<string, CustomClientDef[]>;
  deletedClients: Record<string, string[]>;
  addCustomClient: (c: Omit<CustomClientDef, "id">) => void;
  deleteClient: (datasetId: string, clientId: string) => void;
  resetClients: (datasetId: string) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], msg: string) => void;
  dismissToast: (id: number) => void;
  seeding: boolean;
  predictions: PredictionRecord[];
  addPrediction: (p: PredictionRecord) => void;
  clearPredictions: () => void;
  customCount: number;
  bumpCustom: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const currentEmail = auth?.user?.email?.toLowerCase() || "guest@fedshield.demo";
  const userRunKey = `${K_RUNS}.${currentEmail}`;
  const userPredKey = `${K_PREDS}.${currentEmail}`;
  const userDisabledKey = `${K_DISABLED}.${currentEmail}`;
  const userCustomClientsKey = `${K_CUSTOM_CLIENTS}.${currentEmail}`;
  const userDeletedClientsKey = `${K_DELETED_CLIENTS}.${currentEmail}`;

  const [page, setPage] = useState<PageId>("overview");
  const [runs, setRuns] = useState<RunResult[]>(() => readJson<RunResult[]>(userRunKey, readJson<RunResult[]>(K_RUNS, [])));
  const [disabledClients, setDisabled] = useState<Record<string, string[]>>(() =>
    readJson(userDisabledKey, readJson(K_DISABLED, {}))
  );
  const [customClients, setCustomClients] = useState<Record<string, CustomClientDef[]>>(() =>
    readJson(userCustomClientsKey, readJson(K_CUSTOM_CLIENTS, {}))
  );
  const [deletedClients, setDeletedClients] = useState<Record<string, string[]>>(() =>
    readJson(userDeletedClientsKey, readJson(K_DELETED_CLIENTS, {}))
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [predictions, setPredictions] = useState<PredictionRecord[]>(() =>
    readJson<PredictionRecord[]>(userPredKey, readJson<PredictionRecord[]>(K_PREDS, []))
  );
  const [customCount, setCustomCount] = useState(0);
  const toastId = useRef(1);
  const seededRef = useRef(false);

  // Reload user-scoped data when active user email changes
  useEffect(() => {
    setRuns(readJson<RunResult[]>(userRunKey, []));
    setPredictions(readJson<PredictionRecord[]>(userPredKey, []));
    setDisabled(readJson(userDisabledKey, {}));
    setCustomClients(readJson(userCustomClientsKey, {}));
    setDeletedClients(readJson(userDeletedClientsKey, {}));
  }, [currentEmail, userRunKey, userPredKey, userDisabledKey, userCustomClientsKey, userDeletedClientsKey]);

  useEffect(() => {
    writeJson(userRunKey, runs.slice(0, 24));
  }, [runs, userRunKey]);

  useEffect(() => {
    writeJson(userPredKey, predictions.slice(0, 60));
  }, [predictions, userPredKey]);

  useEffect(() => {
    writeJson(userDisabledKey, disabledClients);
  }, [disabledClients, userDisabledKey]);

  useEffect(() => {
    writeJson(userCustomClientsKey, customClients);
  }, [customClients, userCustomClientsKey]);

  useEffect(() => {
    writeJson(userDeletedClientsKey, deletedClients);
  }, [deletedClients, userDeletedClientsKey]);

  const toast = useCallback((kind: Toast["kind"], msg: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4600);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const addRun = useCallback((r: RunResult) => {
    const scopedRun: RunResult = { ...r, userEmail: currentEmail };
    setRuns((prev) => [scopedRun, ...prev].slice(0, 24));
    saveRunToAppwrite(scopedRun, currentEmail);
  }, [currentEmail]);

  const deleteRun = useCallback((id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleClient = useCallback((datasetId: string, clientId: string) => {
    setDisabled((prev) => {
      const cur = prev[datasetId] ?? [];
      const next = cur.includes(clientId)
        ? cur.filter((c) => c !== clientId)
        : [...cur, clientId];
      return { ...prev, [datasetId]: next };
    });
  }, []);

  const addCustomClient = useCallback((c: Omit<CustomClientDef, "id">) => {
    const id = `custom-client-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    const fullClient: CustomClientDef = { ...c, id };
    setCustomClients((prev) => {
      const cur = prev[c.datasetId] ?? [];
      return { ...prev, [c.datasetId]: [...cur, fullClient] };
    });
    setCustomCount((c) => c + 1);
  }, []);

  const deleteClient = useCallback((datasetId: string, clientId: string) => {
    setDeletedClients((prev) => {
      const cur = prev[datasetId] ?? [];
      if (cur.includes(clientId)) return prev;
      return { ...prev, [datasetId]: [...cur, clientId] };
    });
    // Remove if it was a custom client
    setCustomClients((prev) => {
      const cur = prev[datasetId] ?? [];
      return { ...prev, [datasetId]: cur.filter((c) => c.id !== clientId) };
    });
    setCustomCount((c) => c + 1);
  }, []);

  const resetClients = useCallback((datasetId: string) => {
    setDeletedClients((prev) => ({ ...prev, [datasetId]: [] }));
    setCustomClients((prev) => ({ ...prev, [datasetId]: [] }));
    setDisabled((prev) => ({ ...prev, [datasetId]: [] }));
    setCustomCount((c) => c + 1);
  }, []);

  const addPrediction = useCallback((p: PredictionRecord) => {
    const scopedPred: PredictionRecord = { ...p, userEmail: currentEmail };
    setPredictions((prev) => [scopedPred, ...prev].slice(0, 60));
    savePredictionToAppwrite(scopedPred, currentEmail);
  }, [currentEmail]);

  const clearPredictions = useCallback(() => setPredictions([]), []);

  const bumpCustom = useCallback(() => setCustomCount((c) => c + 1), []);

  /* Sync data from Appwrite Cloud filtered for active userEmail */
  useEffect(() => {
    (async () => {
      const apRuns = await fetchRunsFromAppwrite(currentEmail);
      if (apRuns && apRuns.length > 0) {
        setRuns(apRuns);
      }
      const apPreds = await fetchPredictionsFromAppwrite(currentEmail);
      if (apPreds && apPreds.length > 0) {
        setPredictions(apPreds);
      }
    })();
  }, [currentEmail]);



  /* Seed initial runs */
  useEffect(() => {
    if (seededRef.current) return;
    const existing = readJson<RunResult[]>(K_RUNS, []);
    if (existing.length > 0) return;
    seededRef.current = true;
    setSeeding(true);
    const token = { cancelled: false };
    (async () => {
      try {
        const c1 = { ...defaultConfig("cardio"), rounds: 10, epsilonPerRound: 2.5, speedMs: 0 };
        const r1 = await trainFederated(c1, () => undefined, token, true);
        r1.modelName = "cardio-federation · baseline";
        setRuns((prev) => [r1, ...prev]);
        const c2 = {
          ...defaultConfig("credit"),
          algo: "fedprox" as const,
          rounds: 8,
          nClients: 4,
          alpha: 0.7,
          epsilonPerRound: 1.4,
          mu: 0.2,
          speedMs: 0,
        };
        const r2 = await trainFederated(c2, () => undefined, token, true);
        r2.modelName = "credit-federation · fedprox";
        setRuns((prev) => [r2, ...prev]);
      } catch {
        /* ignore seeding errors */
      } finally {
        setSeeding(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({
      page,
      setPage,
      runs,
      addRun,
      deleteRun,
      disabledClients,
      toggleClient,
      customClients,
      deletedClients,
      addCustomClient,
      deleteClient,
      resetClients,
      toasts,
      toast,
      dismissToast,
      seeding,
      predictions,
      addPrediction,
      clearPredictions,
      customCount,
      bumpCustom,
    }),
    [
      page,
      runs,
      addRun,
      deleteRun,
      disabledClients,
      toggleClient,
      customClients,
      deletedClients,
      addCustomClient,
      deleteClient,
      resetClients,
      toasts,
      toast,
      dismissToast,
      seeding,
      predictions,
      addPrediction,
      clearPredictions,
      customCount,
      bumpCustom,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}
