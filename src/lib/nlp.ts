/* ─────────────────────────────────────────────────────────────
 * FedShield — natural-language case parser.
 * Lets the prediction console behave like a conversational model:
 * the user describes a case in free text ("58yo, BP 165/95,
 * cholesterol 250, BMI 31") and we extract feature values by
 * matching aliases against the active model's feature schema.
 * ───────────────────────────────────────────────────────────── */
import type { DatasetMeta, FeatureDef } from "./types";

export interface ParsedFeature {
  feature: FeatureDef;
  value: number;
  source: string; // the raw text token that produced it
}

export interface ParsedCase {
  found: ParsedFeature[];
  missing: FeatureDef[];
  filled: { feature: FeatureDef; value: number }[]; // imputed with median
  values: number[]; // aligned to meta.features order
}

/** Global synonym table → canonical feature keys. */
const SYNONYMS: Record<string, string[]> = {
  age: ["age", "years old", "yo", "yrs", "patient age"],
  bmi: ["bmi", "body mass", "body mass index"],
  sbp: ["blood pressure", "bp", "systolic", "systolic bp", "pressure", "sys"],
  dbp: ["diastolic", "diastolic bp", "dia"],
  chol: ["cholesterol", "chol", "ldl", "total cholesterol"],
  glu: ["glucose", "blood sugar", "sugar", "hba1c", "fasting glucose"],
  hr: ["heart rate", "hr", "pulse", "bpm", "resting heart rate"],
  crp: ["crp", "c reactive", "c-reactive", "crp protein"],
  smk: ["smok", "pack years", "pack-years", "smoker", "cigarettes", "tobacco"],
  fam: ["family history", "family", "hereditary", "fam"],
  act: ["activity", "exercise", "workout", "active hours", "weekly activity"],
  egfr: ["egfr", "kidney", "renal", "kidney function", "gfr"],
  income: ["income", "salary", "earnings", "annual income"],
  dti: ["debt to income", "dti", "debt-to-income", "debt ratio"],
  score: ["credit score", "fico", "score", "credit rating"],
  hist: ["credit history", "history", "years of credit"],
  util: ["utilization", "card utilization", "credit utilization", "util"],
  inq: ["inquiries", "inquiry", "hard pulls", "inq"],
  bal: ["balance", "avg balance", "average balance"],
  emp: ["employment", "tenure employed", "job tenure", "employment tenure", "employed"],
  dep: ["dependents", "dependants", "children", "kids", "dep"],
  delq: ["delinquenc", "late payments", "delinquent", "delq", "missed payments"],
  dur: ["duration", "flow duration", "session length", "dur"],
  psrc: ["src packets", "source packets", "packets sent"],
  pdst: ["dst packets", "destination packets", "packets received"],
  bsrc: ["src bytes", "source bytes", "bytes sent", "upload bytes"],
  bdst: ["dst bytes", "destination bytes", "bytes received", "download bytes"],
  proto: ["protocol", "proto"],
  sport: ["src port", "source port"],
  dport: ["dst port", "destination port", "target port"],
  syn: ["syn rate", "syn", "syn flood"],
  err: ["error rate", "errors", "error"],
  icmp: ["icmp", "ping ratio", "icmp ratio"],
  burst: ["burst", "burst score"],
  geo: ["geo", "distance", "geo distance", "km"],
  ttl: ["ttl", "time to live", "ttl anomaly"],
  tenure: ["tenure", "customer tenure", "months with", "loyalty"],
  monthly: ["monthly charge", "monthly bill", "monthly", "bill"],
  total: ["total charge", "total spent", "total charges", "lifetime value"],
  contract: ["contract", "contract length", "contract months"],
  tickets: ["support ticket", "tickets", "support calls", "complaints"],
  services: ["services", "service count", "add-ons", "number of services"],
  data_gb: ["data usage", "data", "gb used", "data gb", "gigabytes"],
  discount: ["discount", "promo", "promotion"],
  fiber: ["fiber", "fibre", "fiber optic"],
  autopay: ["autopay", "auto pay", "auto-pay", "automatic payment"],
  kwh: ["consumption", "kwh", "energy used", "power usage", "electricity"],
  vdev: ["voltage deviation", "voltage", "vdev"],
  tamper: ["tamper", "tampering events", "meter tamper"],
  night: ["night ratio", "night usage", "nighttime", "night"],
  mismatch: ["billing mismatch", "mismatch", "bill discrepancy"],
  peak: ["peak load", "peak ratio", "peak"],
  age_yr: ["connection age", "meter age", "age of connection"],
  outages: ["outage", "outages", "power outage", "outage reports"],
  load_var: ["load variance", "variance", "load variability"],
};

function buildAliasIndex(meta: DatasetMeta): { aliases: string[]; feature: FeatureDef }[] {
  return meta.features.map((feature) => {
    const set = new Set<string>();
    set.add(feature.key.toLowerCase());
    set.add(feature.label.toLowerCase());
    // Only multi-char units are safe aliases (avoids "$", "%", "h" false positives).
    if (feature.unit && feature.unit.length >= 2) set.add(feature.unit.toLowerCase());
    const synonyms = SYNONYMS[feature.key] ?? [];
    for (const s of synonyms) set.add(s.toLowerCase());
    // also add the label's words (e.g. "Total cholesterol" -> "cholesterol")
    feature.label.toLowerCase().split(/\s+/).forEach((w) => w.length > 3 && set.add(w));
    return { aliases: Array.from(set), feature };
  });
}

const NUM = "(-?\\d+(?:\\.\\d+)?)";

/**
 * Extract feature values from free text. For each feature we try the
 * alias list; when an alias is found we grab the nearest number after it
 * (or before it, for "165 bp" style) within a short window.
 */
export function parseCase(text: string, meta: DatasetMeta, medians: number[]): ParsedCase {
  const lower = text.toLowerCase();
  const found: ParsedFeature[] = [];
  const index = buildAliasIndex(meta);

  for (const { aliases, feature } of index) {
    let matched: { value: number; source: string } | null = null;

    // Sort aliases longest-first so "blood pressure" beats "bp".
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
      if (matched) break;
      const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`\\b${esc}\\b\\s*(?:of|=|:|is|was)?\\s*${NUM}`, "i"), // "bp 165" / "bp: 165" / "bp = 165"
        new RegExp(`${NUM}\\s*(?:${esc})\\b`, "i"), // "165 bp" / "250 cholesterol"
      ];
      for (const re of patterns) {
        const m = lower.match(re);
        if (m && m[1] !== undefined) {
          const value = clamp(parseFloat(m[1]), feature);
          matched = { value, source: m[0].trim() };
          break;
        }
      }
    }

    if (matched) found.push({ feature, value: matched.value, source: matched.source });
  }

  const missing: FeatureDef[] = [];
  const filled: { feature: FeatureDef; value: number }[] = [];
  const values: number[] = meta.features.map((feature, i) => {
    const hit = found.find((pf) => pf.feature.key === feature.key);
    if (hit) return hit.value;
    missing.push(feature);
    const med = medians[i] ?? (feature.min + feature.max) / 2;
    filled.push({ feature, value: med });
    return med;
  });

  return { found, missing, filled, values };
}

function clamp(v: number, feature: FeatureDef): number {
  return Math.min(feature.max, Math.max(feature.min, v));
}

/** Compute per-feature medians from a dataset's raw matrix. */
export function computeMedians(raw: Float64Array, n: number, d: number): number[] {
  const medians: number[] = [];
  for (let j = 0; j < d; j++) {
    const col: number[] = [];
    for (let i = 0; i < n; i++) col.push(raw[i * d + j]);
    col.sort((a, b) => a - b);
    medians.push(col[Math.floor(n / 2)] ?? 0);
  }
  return medians;
}
