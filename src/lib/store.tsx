/* ─────────────────────────────────────────────────────────────
 * FedShield — application store
 * Run history, client registry overrides, navigation, toasts.
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

const K_RUNS = "fedshield.runs";
const K_DISABLED = "fedshield.clients.disabled";
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

interface AppCtx {
  page: PageId;
  setPage: (p: PageId) => void;
  runs: RunResult[];
  addRun: (r: RunResult) => void;
  deleteRun: (id: string) => void;
  disabledClients: Record<string, string[]>;
  toggleClient: (datasetId: string, clientId: string) => void;
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
  const [page, setPage] = useState<PageId>("overview");
  const [runs, setRuns] = useState<RunResult[]>(() => readJson<RunResult[]>(K_RUNS, []));
  const [disabledClients, setDisabled] = useState<Record<string, string[]>>(() =>
    readJson(K_DISABLED, {})
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [predictions, setPredictions] = useState<PredictionRecord[]>(() =>
    readJson<PredictionRecord[]>(K_PREDS, [])
  );
  const [customCount, setCustomCount] = useState(0);
  const toastId = useRef(1);
  const seededRef = useRef(false);

  useEffect(() => {
    writeJson(K_RUNS, runs.slice(0, 24));
  }, [runs]);

  useEffect(() => {
    writeJson(K_PREDS, predictions.slice(0, 60));
  }, [predictions]);

  useEffect(() => {
    writeJson(K_DISABLED, disabledClients);
  }, [disabledClients]);

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
    setRuns((prev) => [r, ...prev].slice(0, 24));
  }, []);

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

  const addPrediction = useCallback((p: PredictionRecord) => {
    setPredictions((prev) => [p, ...prev].slice(0, 60));
  }, []);

  const clearPredictions = useCallback(() => setPredictions([]), []);

  const bumpCustom = useCallback(() => setCustomCount((c) => c + 1), []);

  /* Seed two completed runs on first visit so every dashboard
     screen is populated before the user trains anything. */
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
        r2.modelName = "credit-consortium · fedprox";
        setRuns((prev) => [r2, ...prev]);
      } catch {
        /* seeding is best-effort */
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

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}
