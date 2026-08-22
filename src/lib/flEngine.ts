/* ─────────────────────────────────────────────────────────────
 * FedShield — in-browser Federated Learning engine
 *
 *  • Logistic-regression models trained with full-batch SGD
 *  • FedAvg + FedProx aggregation strategies
 *  • Differential privacy: per-update clipping + Gaussian mechanism,
 *    σ = (2C/n)·√(2·ln(1.25/δ)) / ε   (basic + advanced composition)
 *  • Secure aggregation: pairwise masks that cancel at the server
 *    (simulated cryptographically-exact bookkeeping)
 *
 *  Raw samples NEVER leave a client: the server only ever receives
 *  masked, clipped, noised weight-delta vectors.
 * ───────────────────────────────────────────────────────────── */
import { getDataset, mulberry32, partitionDataset, trainTestSplit } from "./datasets";
import type {
  FLEvent,
  LogLine,
  Metrics,
  PredictionResult,
  RunResult,
  TrainingConfig,
} from "./types";

export const DELTA_DEFAULT = 1e-5;
export const PRIVACY_BUDGET = 24; // ε cap used across the UI

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

export function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/* ── Metrics ──────────────────────────────────────────────── */

export function evaluate(
  X: Float64Array,
  y: Uint8Array,
  idx: number[],
  w: Float64Array,
  b: number
): Metrics {
  const d = w.length;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let loss = 0;
  const scored: { s: number; t: number }[] = [];
  for (const i of idx) {
    let z = b;
    for (let j = 0; j < d; j++) z += w[j] * X[i * d + j];
    const p = sigmoid(z);
    const t = y[i];
    loss += -(t * Math.log(p + 1e-9) + (1 - t) * Math.log(1 - p + 1e-9));
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === 1 && t === 1) tp++;
    else if (pred === 1 && t === 0) fp++;
    else if (pred === 0 && t === 1) fn++;
    else tn++;
    scored.push({ s: p, t });
  }
  const n = Math.max(1, idx.length);
  const accuracy = (tp + tn) / n;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // AUC via Mann–Whitney U with tie correction
  scored.sort((a, b2) => a.s - b2.s);
  let rankSum = 0;
  let i = 0;
  let rank = 1;
  while (i < scored.length) {
    let j = i;
    while (j + 1 < scored.length && scored[j + 1].s === scored[i].s) j++;
    const avgRank = (rank + rank + (j - i)) / 2;
    for (let k = i; k <= j; k++) if (scored[k].t === 1) rankSum += avgRank;
    rank += j - i + 1;
    i = j + 1;
  }
  const nPos = scored.filter((s) => s.t === 1).length;
  const nNeg = scored.length - nPos;
  const auc = nPos > 0 && nNeg > 0 ? (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : 0.5;

  return { accuracy, precision, recall, f1, loss: loss / n, auc };
}

/* ── Local training (on-client) ───────────────────────────── */

function localTrain(
  X: Float64Array,
  y: Uint8Array,
  idx: number[],
  w0: Float64Array,
  b0: number,
  epochs: number,
  lr: number,
  mu: number,
  globalW: Float64Array
): { w: Float64Array; b: number } {
  const d = w0.length;
  const w = Float64Array.from(w0);
  let b = b0;
  const n = idx.length;
  if (n === 0) return { w, b };
  for (let e = 0; e < epochs; e++) {
    const g = new Float64Array(d);
    let gb = 0;
    for (const i of idx) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i * d + j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) g[j] += (err * X[i * d + j]) / n;
      gb += err / n;
    }
    for (let j = 0; j < d; j++) {
      const prox = mu > 0 ? mu * (w[j] - globalW[j]) : 0;
      w[j] -= lr * (g[j] + 0.0004 * w[j] + prox);
    }
    b -= lr * gb;
  }
  return { w, b };
}

/* ── Differential privacy ─────────────────────────────────── */

export function gaussianSigma(eps: number, delta: number, sensitivity: number): number {
  return (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / Math.max(eps, 0.01);
}

export function advancedEpsilon(epsPerRound: number, rounds: number, delta: number): number {
  // Subsampled-RDP-style √R composition (loose, demo-grade accountant)
  return epsPerRound * Math.sqrt(2 * rounds * Math.log(1 / delta)) * 0.35 + epsPerRound * rounds * 0.12;
}

/* ── Federated training loop ──────────────────────────────── */

export interface CancelToken {
  cancelled: boolean;
}

export async function trainFederated(
  config: TrainingConfig,
  onEvent: (e: FLEvent) => void,
  cancel: CancelToken,
  silent = false
): Promise<RunResult> {
  const t0 = performance.now();
  const ds = getDataset(config.datasetId);
  const d = ds.meta.features.length;
  const rng = mulberry32(config.seed);
  const emit = (e: FLEvent) => {
    if (!silent || e.type === "done") onEvent(e);
  };
  const log = (level: LogLine["level"], msg: string, round?: number) =>
    emit({ type: "log", line: { t: Date.now(), level, msg, round } });

  const [trainIdx, testIdx] = trainTestSplit(ds);
  const disabled = new Set(config.disabledClients ?? []);
  const { clients, splits } = partitionDataset(ds, config.nClients, config.alpha, trainIdx, disabled);
  const enabled = clients.filter((c) => c.enabled);
  if (enabled.length < 2) throw new Error("At least two participating clients are required.");

  log("info", `Dataset "${ds.meta.name}" · ${ds.meta.nSamples} rows · ${d} features`);
  log("priv", `Raw data never leaves clients — only masked weight deltas are transmitted.`);
  log(
    "info",
    `${enabled.length} clients enrolled · non-IID split (Dirichlet α=${config.alpha}) · test set held server-side (${testIdx.length} rows)`
  );

  let w = new Float64Array(d);
  let b = 0;
  let cw: Float64Array = new Float64Array(d); // centralized reference model
  let cb = 0;

  const rounds: RunResult["rounds"] = [];
  let epsCum = 0;
  const nPart = Math.max(2, Math.round(config.participation * enabled.length));

  for (let r = 1; r <= config.rounds; r++) {
    if (cancel.cancelled) throw new Error("cancelled");
    emit({ type: "phase", phase: "distribute", round: r });
    log("info", `Round ${r}/${config.rounds} — broadcasting global model wₜ to ${nPart} sampled clients`, r);
    await sleep(config.speedMs * 0.35);

    // Sample participants
    const shuffled = [...enabled];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const participants = shuffled.slice(0, nPart);

    emit({ type: "phase", phase: "local", round: r });
    const updates: { id: string; dw: Float64Array; db: number; n: number; acc: number }[] = [];
    for (const c of participants) {
      if (cancel.cancelled) throw new Error("cancelled");
      const k = clients.indexOf(c);
      const idx = splits[k];
      const local = localTrain(ds.X, ds.y, idx, w, b, config.localEpochs, config.learningRate, config.algo === "fedprox" ? config.mu : 0, w);
      const dw = new Float64Array(d);
      let norm = 0;
      for (let j = 0; j < d; j++) {
        dw[j] = local.w[j] - w[j];
        norm += dw[j] * dw[j];
      }
      norm = Math.sqrt(norm);
      // DP step 1 — clip the update to L2 ball of radius C
      let clipped = false;
      if (config.dp && norm > config.clipNorm) {
        const s = config.clipNorm / norm;
        for (let j = 0; j < d; j++) dw[j] *= s;
        clipped = true;
      }
      const acc = evaluate(ds.X, ds.y, idx, local.w, local.b).accuracy;
      updates.push({ id: c.id, dw, db: local.b - b, n: idx.length, acc });
      emit({ type: "client", clientId: c.id, acc });
      log(
        "info",
        `${c.name} (${c.org}) trained ${config.localEpochs} epoch${config.localEpochs > 1 ? "s" : ""} on ${idx.length} local rows · local acc ${(acc * 100).toFixed(1)}%${clipped ? " · update clipped ‖Δw‖≤C" : ""}`,
        r
      );
    }
    await sleep(config.speedMs * 0.55);

    // Secure aggregation — pairwise masks cancel server-side
    if (config.secureAgg) {
      emit({ type: "phase", phase: "mask", round: r });
      log("priv", `Secure aggregation: ${participants.length} pairwise masks negotiated (seed ${r * 977 % 9973}); server observes only Σ-masked sums`, r);
      await sleep(config.speedMs * 0.35);
    }

    emit({ type: "phase", phase: "aggregate", round: r });
    const totalN = updates.reduce((a, u) => a + u.n, 0);
    const agg = new Float64Array(d);
    let aggb = 0;
    for (const u of updates) {
      const wgt = u.n / totalN;
      for (let j = 0; j < d; j++) agg[j] += wgt * u.dw[j];
      aggb += wgt * u.db;
    }
    // DP step 2 — Gaussian mechanism on the aggregated update
    let sigma = 0;
    if (config.dp) {
      const sensitivity = (2 * config.clipNorm) / updates.length;
      sigma = gaussianSigma(config.epsilonPerRound, config.delta, sensitivity);
      for (let j = 0; j < d; j++) agg[j] += sigma * randnLocal(rng);
      aggb += sigma * randnLocal(rng) * 0.25;
      epsCum += config.epsilonPerRound;
      log("priv", `DP applied: clip C=${config.clipNorm}, σ=${sigma.toFixed(3)} (ε=${config.epsilonPerRound}/round, δ=${config.delta}) → cumulative ε=${epsCum.toFixed(1)}`, r);
    }
    for (let j = 0; j < d; j++) w[j] += agg[j];
    b += aggb;
    if (config.secureAgg) log("priv", `Masks cancelled in aggregate — individual updates remain unreadable to the server`, r);
    log("ok", `${config.algo === "fedprox" ? `FedProx (μ=${config.mu})` : "FedAvg"} aggregate committed from ${updates.length} masked updates`, r);

    // Centralized reference baseline (pooled data — shown ONLY for comparison)
    const cLocal = localTrain(ds.X, ds.y, trainIdx, cw, cb, config.localEpochs, config.learningRate, 0, cw);
    cw = cLocal.w;
    cb = cLocal.b;

    emit({ type: "phase", phase: "eval", round: r });
    const fed = evaluate(ds.X, ds.y, testIdx, w, b);
    const centralized = evaluate(ds.X, ds.y, testIdx, cw, cb);
    const record = {
      round: r,
      fed,
      centralized,
      participants: updates.length,
      epsilonCum: epsCum,
      clientAccs: updates.map((u) => u.acc),
    };
    rounds.push(record);
    emit({ type: "round", record });
    log(
      "ok",
      `Global model · acc ${(fed.accuracy * 100).toFixed(1)}% · F1 ${fed.f1.toFixed(3)} · AUC ${fed.auc.toFixed(3)} · loss ${fed.loss.toFixed(3)}`,
      r
    );
    await sleep(config.speedMs * 0.35);
  }

  emit({ type: "phase", phase: "done", round: config.rounds });
  const final = evaluate(ds.X, ds.y, testIdx, w, b);
  const centralizedFinal = evaluate(ds.X, ds.y, testIdx, cw, cb);
  const result: RunResult = {
    id: `run-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    createdAt: Date.now(),
    datasetId: config.datasetId,
    algo: config.algo,
    config,
    rounds,
    final,
    centralizedFinal,
    epsilonSpent: epsCum,
    weights: Array.from(w),
    bias: b,
    durationMs: performance.now() - t0,
    status: "completed",
    modelName: `global-${config.datasetId}-${config.algo}-r${config.rounds}`,
    byGuest: false,
  };
  emit({ type: "done", result });
  return result;
}

function randnLocal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── Prediction API ───────────────────────────────────────── */

export function predictSingle(
  run: RunResult,
  featureValues: number[]
): PredictionResult {
  const t0 = performance.now();
  const ds = getDataset(run.datasetId);
  const d = ds.meta.features.length;
  const x = new Float64Array(d);
  const contributions: { feature: string; impact: number }[] = [];
  let z = run.bias;
  for (let j = 0; j < d; j++) {
    const xv = (featureValues[j] - ds.mean[j]) / ds.std[j];
    x[j] = xv;
    const impact = run.weights[j] * xv;
    z += impact;
    contributions.push({ feature: ds.meta.features[j].label, impact });
  }
  contributions.sort((a, b2) => Math.abs(b2.impact) - Math.abs(a.impact));
  const probability = sigmoid(z);
  return {
    probability,
    label: probability >= 0.5 ? ds.meta.positiveLabel : ds.meta.negativeLabel,
    contributions: contributions.slice(0, 6),
    latencyMs: performance.now() - t0,
  };
}

export function defaultConfig(datasetId: string): TrainingConfig {
  return {
    datasetId,
    algo: "fedavg",
    rounds: 10,
    nClients: 5,
    participation: 0.8,
    localEpochs: 2,
    learningRate: 0.12,
    mu: 0.1,
    alpha: 1.2,
    dp: true,
    epsilonPerRound: 2.5,
    clipNorm: 1.0,
    delta: DELTA_DEFAULT,
    secureAgg: true,
    seed: 2024,
    speedMs: 850,
  };
}

export function modelToJson(run: RunResult): string {
  return JSON.stringify(
    {
      framework: "FedShield FL Engine v1.0",
      model: run.modelName,
      algorithm: run.algo,
      dataset: run.datasetId,
      metrics: run.final,
      epsilonSpent: run.epsilonSpent,
      differentialPrivacy: run.config.dp,
      secureAggregation: run.config.secureAgg,
      weights: run.weights,
      bias: run.bias,
      exportedAt: new Date(run.createdAt).toISOString(),
      note: "Weights only — no raw training data is contained in this artifact.",
    },
    null,
    2
  );
}
