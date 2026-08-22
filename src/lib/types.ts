/* ─────────────────────────────────────────────────────────────
 * FedShield — shared domain types
 * ───────────────────────────────────────────────────────────── */

export type AuthMode = "user" | "guest";
export type Provider = "password" | "google";

export interface StoredUser {
  uid: string;
  name: string;
  email: string;
  passHash: string | null;
  provider: Provider;
  role: "analyst" | "admin";
  createdAt: number;
  lastLogin: number;
}

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  provider: Provider | "guest";
  role: "analyst" | "admin" | "guest";
}

/* ── Datasets ─────────────────────────────────────────────── */

export interface FeatureDef {
  key: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  decimals: number;
}

export interface DatasetMeta {
  id: string;
  name: string;
  sector: string;
  tag: string;
  description: string;
  nSamples: number;
  positiveRate: number;
  seed: number;
  features: FeatureDef[];
  positiveLabel: string;
  negativeLabel: string;
}

export interface GeneratedDataset {
  meta: DatasetMeta;
  /** standardized feature matrix, row-major, n × d */
  X: Float64Array;
  /** raw-scale feature matrix, row-major, n × d */
  raw: Float64Array;
  y: Uint8Array;
  mean: Float64Array;
  std: Float64Array;
}

/* ── Federated clients ────────────────────────────────────── */

export interface ClientInfo {
  id: string;
  name: string;
  org: string;
  region: string;
  nSamples: number;
  positives: number;
  positiveRate: number;
  enabled: boolean;
  /** KL-divergence from the global label distribution — higher = more heterogeneous */
  drift: number;
}

/* ── Training ─────────────────────────────────────────────── */

export type Algo = "fedavg" | "fedprox";

export interface TrainingConfig {
  datasetId: string;
  algo: Algo;
  rounds: number;
  nClients: number;
  participation: number; // 0..1
  localEpochs: number;
  learningRate: number;
  mu: number; // FedProx proximal coefficient
  alpha: number; // Dirichlet concentration (heterogeneity)
  dp: boolean;
  epsilonPerRound: number;
  clipNorm: number;
  delta: number;
  secureAgg: boolean;
  seed: number;
  speedMs: number; // animation delay per phase
  disabledClients?: string[]; // registry withdrawals honored by the engine
}

export interface Metrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  loss: number;
  auc: number;
}

export interface RoundRecord {
  round: number;
  fed: Metrics;
  centralized: Metrics | null;
  participants: number;
  epsilonCum: number;
  clientAccs: number[];
}

export interface RunResult {
  id: string;
  createdAt: number;
  datasetId: string;
  algo: Algo;
  config: TrainingConfig;
  rounds: RoundRecord[];
  final: Metrics;
  centralizedFinal: Metrics | null;
  epsilonSpent: number;
  weights: number[];
  bias: number;
  durationMs: number;
  status: "completed" | "cancelled";
  modelName: string;
  byGuest: boolean;
}

export type LogLevel = "info" | "ok" | "warn" | "priv";

export interface LogLine {
  t: number;
  round?: number;
  level: LogLevel;
  msg: string;
}

export type Phase =
  | "idle"
  | "distribute"
  | "local"
  | "mask"
  | "aggregate"
  | "eval"
  | "done";

export type FLEvent =
  | { type: "phase"; phase: Phase; round: number }
  | { type: "client"; clientId: string; acc: number }
  | { type: "round"; record: RoundRecord }
  | { type: "log"; line: LogLine }
  | { type: "done"; result: RunResult };

export interface PredictionResult {
  probability: number;
  label: string;
  contributions: { feature: string; impact: number }[];
  latencyMs: number;
}

export type PageId =
  | "overview"
  | "lab"
  | "clients"
  | "datasets"
  | "privacy"
  | "analytics"
  | "history";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info" | "warn";
  msg: string;
}
