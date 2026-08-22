/* ─────────────────────────────────────────────────────────────
 * FedShield — synthetic dataset generation & non-IID partitioning
 * Data is generated deterministically (seeded) inside the browser.
 * ───────────────────────────────────────────────────────────── */
import type {
  ClientInfo,
  DatasetMeta,
  FeatureDef,
  GeneratedDataset,
} from "./types";

/* ── Seeded PRNG ──────────────────────────────────────────── */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRandn(rng: () => number) {
  let spare: number | null = null;
  return function randn() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    spare = mag * Math.sin(2.0 * Math.PI * v);
    return mag * Math.cos(2.0 * Math.PI * v);
  };
}

/** Marsaglia–Tsang gamma sampler (shape k > 0, scale 1) */
function gamma(rng: () => number, randn: () => number, k: number): number {
  if (k < 1) {
    const u = Math.max(rng(), 1e-12);
    return gamma(rng, randn, k + 1) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function dirichlet(rng: () => number, alpha: number, n: number): number[] {
  const randn = makeRandn(rng);
  const g = Array.from({ length: n }, () => gamma(rng, randn, alpha));
  const s = g.reduce((a, b) => a + b, 0) || 1;
  return g.map((v) => v / s);
}

/* ── Dataset catalogue ────────────────────────────────────── */

const f = (
  key: string,
  label: string,
  min: number,
  max: number,
  decimals = 0,
  unit?: string
): FeatureDef => ({ key, label, min, max, decimals, unit });

export const DATASETS: DatasetMeta[] = [
  {
    id: "cardio",
    name: "CardioVascular Risk",
    sector: "Healthcare",
    tag: "Binary classification",
    description:
      "10-year cardiovascular event risk assembled from 4 hospital EHR silos. Labels stay on-premise at each site; only differentially-private model updates are shared.",
    nSamples: 6000,
    positiveRate: 0.34,
    seed: 1337,
    positiveLabel: "High risk",
    negativeLabel: "Low risk",
    features: [
      f("age", "Age", 28, 82, 0, "yrs"),
      f("bmi", "Body mass index", 16, 44, 1),
      f("sbp", "Systolic BP", 92, 198, 0, "mmHg"),
      f("dbp", "Diastolic BP", 58, 124, 0, "mmHg"),
      f("chol", "Total cholesterol", 120, 330, 0, "mg/dL"),
      f("glu", "Fasting glucose", 68, 210, 0, "mg/dL"),
      f("hr", "Resting heart rate", 46, 118, 0, "bpm"),
      f("crp", "C-reactive protein", 0.2, 14, 1, "mg/L"),
      f("smk", "Pack-years smoked", 0, 52, 1),
      f("fam", "Family history score", 0, 10, 1),
      f("act", "Weekly activity", 0, 14, 1, "h"),
      f("egfr", "Kidney fn (eGFR)", 24, 120, 0),
    ],
  },
  {
    id: "credit",
    name: "Credit Default Prediction",
    sector: "Finance",
    tag: "Binary classification",
    description:
      "Loan default risk pooled across 3 regional banks that cannot share customer records due to GDPR / bank-secrecy constraints. Federated training builds one shared risk model.",
    nSamples: 5000,
    positiveRate: 0.22,
    seed: 8086,
    positiveLabel: "Default",
    negativeLabel: "Repaid",
    features: [
      f("income", "Annual income", 14, 220, 1, "k$"),
      f("dti", "Debt-to-income", 0.04, 0.72, 2),
      f("score", "Credit score", 300, 850, 0),
      f("hist", "Credit history", 0, 38, 0, "yrs"),
      f("util", "Card utilization", 0, 1, 2),
      f("inq", "Recent inquiries", 0, 14, 0),
      f("bal", "Avg balance", 0, 60, 1, "k$"),
      f("emp", "Employment tenure", 0, 30, 0, "yrs"),
      f("dep", "Dependents", 0, 8, 0),
      f("delq", "Past delinquencies", 0, 9, 0),
    ],
  },
  {
    id: "intrusion",
    name: "Network Intrusion Detection",
    sector: "Cybersecurity",
    tag: "Binary classification",
    description:
      "Malicious-flow detection across 4 ISP edge nodes. Packet-level telemetry is too sensitive to centralize — nodes exchange only noisy gradient updates.",
    nSamples: 8000,
    positiveRate: 0.27,
    seed: 4242,
    positiveLabel: "Intrusion",
    negativeLabel: "Benign",
    features: [
      f("dur", "Flow duration", 0, 120, 1, "s"),
      f("psrc", "Src packets", 1, 4200, 0),
      f("pdst", "Dst packets", 1, 3900, 0),
      f("bsrc", "Src bytes", 40, 900000, 0),
      f("bdst", "Dst bytes", 40, 780000, 0),
      f("proto", "Protocol code", 0, 24, 0),
      f("sport", "Src port", 1024, 65535, 0),
      f("dport", "Dst port", 0, 65535, 0),
      f("syn", "SYN rate", 0, 1, 2),
      f("err", "Error rate", 0, 0.6, 2),
      f("icmp", "ICMP ratio", 0, 0.9, 2),
      f("burst", "Burst score", 0, 10, 1),
      f("geo", "Geo-distance", 0, 18000, 0, "km"),
      f("ttl", "TTL anomaly", 0, 1, 2),
    ],
  },
];

export function getDatasetMeta(id: string): DatasetMeta {
  return DATASETS.find((d) => d.id === id) ?? DATASETS[0];
}

/* ── Generation ───────────────────────────────────────────── */

const cache = new Map<string, GeneratedDataset>();

export function getDataset(id: string): GeneratedDataset {
  const cached = cache.get(id);
  if (cached) return cached;
  const meta = getDatasetMeta(id);
  const d = meta.features.length;
  const n = meta.nSamples;
  const rng = mulberry32(meta.seed);
  const randn = makeRandn(rng);

  const raw = new Float64Array(n * d);
  const mean = new Float64Array(d);
  const std = new Float64Array(d);

  // True (hidden) concept weights — some features matter, some don't
  const wTrue = meta.features.map(() => {
    const r = rng();
    if (r < 0.25) return 0;
    return (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.9);
  });

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      const feat = meta.features[j];
      let v: number;
      if (rng() < 0.86) {
        v = feat.min + (feat.max - feat.min) * Math.min(1, Math.max(0, 0.5 + 0.26 * randn()));
      } else {
        v = feat.min + (feat.max - feat.min) * rng();
      }
      const step = Math.pow(10, -feat.decimals);
      v = Math.round(v / step) * step;
      raw[i * d + j] = v;
      mean[j] += v / n;
    }
  }
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const dv = raw[i * d + j] - mean[j];
      s += (dv * dv) / n;
    }
    std[j] = Math.sqrt(s) || 1;
  }

  const X = new Float64Array(n * d);
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < d; j++) {
      const xv = (raw[i * d + j] - mean[j]) / std[j];
      X[i * d + j] = xv;
      acc += wTrue[j] * xv;
    }
    z[i] = acc + 0.55 * randn();
  }

  // Threshold at the quantile that matches the target positive rate
  const sorted = Array.from(z).sort((a, b) => a - b);
  const thr = sorted[Math.floor(n * (1 - meta.positiveRate))];
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) y[i] = z[i] > thr ? 1 : 0;

  const ds: GeneratedDataset = { meta, X, raw, y, mean, std };
  cache.set(id, ds);
  return ds;
}

/* ── Client organisations per sector ──────────────────────── */

const ORGS: Record<string, { org: string; region: string }[]> = {
  cardio: [
    { org: "St. Aurelia Medical Center", region: "EU-West" },
    { org: "Northlake University Hospital", region: "US-East" },
    { org: "Klinikum Brandenburg", region: "EU-Central" },
    { org: "Pacific Coast Health Net", region: "US-West" },
    { org: "Osaka General Hospital", region: "APAC" },
    { org: "Karolinska Research Clinic", region: "EU-North" },
    { org: "Andes Salud Network", region: "LATAM" },
    { org: "Cape Town Health Alliance", region: "MEA" },
    { org: "Toronto Unity Hospital", region: "CA-Central" },
    { org: "Mumbai Metro Care Trust", region: "APAC-South" },
    { org: "Sydney Harbour Clinic", region: "OCE" },
    { org: "Riyadh Specialist Center", region: "MEA-Gulf" },
  ],
  credit: [
    { org: "Meridian Savings Bank", region: "EU-West" },
    { org: "Atlas Trust & Credit", region: "US-East" },
    { org: "Hanseatic Kredit AG", region: "EU-Central" },
    { org: "Golden Gate Lending", region: "US-West" },
    { org: "Sakura Consumer Finance", region: "APAC" },
    { org: "Nordic Lån AB", region: "EU-North" },
    { org: "Banco del Sur", region: "LATAM" },
    { org: "Sahara Micro-Finance", region: "MEA" },
    { org: "Maple Credit Union", region: "CA-Central" },
    { org: "Deccan Bank Ltd", region: "APAC-South" },
    { org: "Coral Coast Finance", region: "OCE" },
    { org: "Gulf Capital Bank", region: "MEA-Gulf" },
  ],
  intrusion: [
    { org: "EdgeNode Frankfurt", region: "EU-Central" },
    { org: "EdgeNode Virginia", region: "US-East" },
    { org: "EdgeNode Singapore", region: "APAC" },
    { org: "EdgeNode São Paulo", region: "LATAM" },
    { org: "EdgeNode Stockholm", region: "EU-North" },
    { org: "EdgeNode Oregon", region: "US-West" },
    { org: "EdgeNode Johannesburg", region: "MEA" },
    { org: "EdgeNode Toronto", region: "CA-Central" },
    { org: "EdgeNode Mumbai", region: "APAC-South" },
    { org: "EdgeNode London", region: "EU-West" },
    { org: "EdgeNode Seoul", region: "APAC-East" },
    { org: "EdgeNode Bahrain", region: "MEA-Gulf" },
  ],
};

/* ── Non-IID Dirichlet partition ──────────────────────────── */

export interface Partition {
  clients: ClientInfo[];
  splits: number[][]; // train-index arrays per client
}

export function partitionDataset(
  ds: GeneratedDataset,
  nClients: number,
  alpha: number,
  trainIdx: number[],
  disabled: Set<string>
): Partition {
  const rng = mulberry32(ds.meta.seed * 7 + nClients * 131 + Math.round(alpha * 100));
  const orgs = ORGS[ds.meta.id] ?? ORGS.cardio;

  const byClass: number[][] = [[], []];
  for (const idx of trainIdx) byClass[ds.y[idx]].push(idx);

  const props = [dirichlet(rng, alpha, nClients), dirichlet(rng, alpha, nClients)];
  const splits: number[][] = Array.from({ length: nClients }, () => []);
  for (let c = 0; c < 2; c++) {
    let cursor = 0;
    for (let k = 0; k < nClients; k++) {
      const take =
        k === nClients - 1
          ? byClass[c].length - cursor
          : Math.round(props[c][k] * byClass[c].length);
      splits[k].push(...byClass[c].slice(cursor, cursor + take));
      cursor += take;
    }
  }

  const globalPos = trainIdx.filter((i) => ds.y[i] === 1).length / Math.max(1, trainIdx.length);
  const clients: ClientInfo[] = splits.map((s, k) => {
    const org = orgs[k % orgs.length];
    const positives = s.filter((i) => ds.y[i] === 1).length;
    const pr = s.length ? positives / s.length : 0;
    const epsKl = 1e-9;
    const drift =
      pr * Math.log((pr + epsKl) / (globalPos + epsKl)) +
      (1 - pr) * Math.log((1 - pr + epsKl) / (1 - globalPos + epsKl));
    const id = `client-${ds.meta.id}-${k + 1}`;
    return {
      id,
      name: `Client ${String.fromCharCode(65 + (k % 26))}`,
      org: org.org,
      region: org.region,
      nSamples: s.length,
      positives,
      positiveRate: pr,
      enabled: !disabled.has(id),
      drift,
    };
  });

  // Shuffle within client (deterministic)
  for (const s of splits) {
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
  }

  return { clients, splits };
}

/** Stratified train/test split — test set lives on the (trusted) server only. */
export function trainTestSplit(ds: GeneratedDataset, testFrac = 0.2, seed = 99): number[][] {
  const rng = mulberry32(seed);
  const n = ds.y.length;
  const byClass: number[][] = [[], []];
  for (let i = 0; i < n; i++) byClass[ds.y[i]].push(i);
  const train: number[] = [];
  const test: number[] = [];
  for (const cls of byClass) {
    for (let i = cls.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cls[i], cls[j]] = [cls[j], cls[i]];
    }
    const cut = Math.floor(cls.length * testFrac);
    test.push(...cls.slice(0, cut));
    train.push(...cls.slice(cut));
  }
  return [train, test];
}
