/* ─────────────────────────────────────────────────────────────
 * FedShield — CSV ingestion for uploaded (custom) datasets.
 * Parses a CSV, detects numeric feature columns + binary label
 * column, and standardizes rows into a CustomDatasetDef that the
 * FL engine can train and the prediction console can query.
 * ───────────────────────────────────────────────────────────── */
import type { CustomDatasetDef, Domain, FeatureDef } from "./types";

/** Robust CSV → rows of cells (handles quotes, escaped quotes, CRLF). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.length > 1 || row[0].trim() !== "") rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const toNum = (s: string): number => {
  const v = parseFloat(s.replace(/,/g, "").trim());
  return Number.isFinite(v) ? v : NaN;
};

const BINARY_LABELS = new Set([
  "0", "1", "yes", "no", "true", "false", "positive", "negative",
  "churn", "retained", "default", "repaid", "fraud", "normal",
  "intrusion", "benign", "tampering", "high", "low", "risk",
]);

export interface ColumnInfo {
  index: number;
  name: string;
  numericFrac: number; // fraction of non-empty cells that parse as numbers
  distinct: number;
  looksBinary: boolean;
  isLabelCandidate: boolean;
}

export function analyzeColumns(rows: string[][]): { header: string[]; info: ColumnInfo[] } {
  const header = rows[0].map((h, i) => (h.trim() || `col_${i + 1}`));
  const data = rows.slice(1);
  const info: ColumnInfo[] = header.map((name, index) => {
    let numeric = 0;
    let nonEmpty = 0;
    const values = new Set<string>();
    for (const r of data) {
      const cell = (r[index] ?? "").trim();
      if (cell === "") continue;
      nonEmpty++;
      values.add(cell.toLowerCase());
      if (!Number.isNaN(toNum(cell))) numeric++;
    }
    const numericFrac = nonEmpty ? numeric / nonEmpty : 0;
    const distinct = values.size;
    const looksBinary =
      distinct <= 2 &&
      Array.from(values).every((v) => BINARY_LABELS.has(v) || !Number.isNaN(toNum(v)));
    const nameHint = /^(label|target|class|y|outcome|churn|default|fraud|intrusion|tamper|risk)$/i.test(
      name.trim()
    );
    const isLabelCandidate = looksBinary || nameHint;
    return { index, name, numericFrac, distinct, looksBinary, isLabelCandidate };
  });
  return { header, info };
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "feature"
  );
}

export interface BuildResult {
  def: CustomDatasetDef | null;
  error: string | null;
  usedRows: number;
}

/**
 * Build a CustomDatasetDef from parsed CSV rows.
 * Rows are capped for localStorage safety; features are standardized (z-score).
 */
export function buildCustomDataset(
  name: string,
  domain: Domain,
  fileName: string,
  rows: string[][],
  labelIndex: number,
  featureIndexes: number[]
): BuildResult {
  const data = rows.slice(1);
  if (data.length < 50) {
    return { def: null, error: "Need at least 50 data rows to federate meaningfully.", usedRows: 0 };
  }
  if (featureIndexes.length < 2) {
    return { def: null, error: "Select at least 2 numeric feature columns.", usedRows: 0 };
  }

  // Normalize the label column to 0/1.
  const labelVals = data.map((r) => (r[labelIndex] ?? "").trim().toLowerCase());
  const uniq = Array.from(new Set(labelVals.filter((v) => v !== "")));
  if (uniq.length !== 2) {
    return { def: null, error: "The label column must be exactly binary (2 distinct values).", usedRows: 0 };
  }
  const positiveToken = uniq.find((v) =>
    ["1", "yes", "true", "positive", "churn", "default", "fraud", "intrusion", "tampering", "high", "risk"].includes(v)
  ) ?? uniq[0];

  const cap = 6000;
  const kept: string[][] = data.slice(0, cap);
  const n = kept.length;
  const d = featureIndexes.length;

  const raw = new Array<number>(n * d).fill(0);
  const y = new Array<number>(n).fill(0);
  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(1);
  let positives = 0;
  let validRows = 0;

  const cleanRaw: number[][] = [];
  const cleanY: number[] = [];
  for (const r of kept) {
    const lab = (r[labelIndex] ?? "").trim().toLowerCase();
    if (lab === "") continue;
    const feats: number[] = [];
    let ok = true;
    for (let j = 0; j < d; j++) {
      const v = toNum(r[featureIndexes[j]] ?? "");
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      feats.push(v);
    }
    if (!ok) continue;
    const target = lab === positiveToken ? 1 : 0;
    cleanRaw.push(feats);
    cleanY.push(target);
    if (target === 1) positives++;
    validRows++;
  }

  if (validRows < 50) {
    return { def: null, error: "Fewer than 50 fully-numeric rows after cleaning — check the selected columns.", usedRows: validRows };
  }

  const nn = cleanRaw.length;
  for (let i = 0; i < nn; i++) {
    for (let j = 0; j < d; j++) {
      raw[i * d + j] = cleanRaw[i][j];
      mean[j] += cleanRaw[i][j] / nn;
    }
    y[i] = cleanY[i];
  }
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < nn; i++) {
      const dv = raw[i * d + j] - mean[j];
      s += (dv * dv) / nn;
    }
    std[j] = Math.sqrt(s) || 1;
  }
  const X = raw.map((v, i) => (v - mean[i % d]) / std[i % d]);

  const features: FeatureDef[] = featureIndexes.map((ci, j) => {
    const colName = rows[0][ci]?.trim() || `feature_${j + 1}`;
    let mn = Infinity;
    let mx = -Infinity;
    let allInt = true;
    for (let i = 0; i < nn; i++) {
      const v = raw[i * d + j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      if (!Number.isInteger(v)) allInt = false;
    }
    return {
      key: slug(colName),
      label: colName,
      min: mn,
      max: mx,
      decimals: allInt ? 0 : 2,
    };
  });

  const id = `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`;
  const def: CustomDatasetDef = {
    id,
    meta: {
      id,
      name: name.trim() || "Uploaded Dataset",
      sector: domain.charAt(0).toUpperCase() + domain.slice(1),
      tag: "Uploaded · binary classification",
      description: `Uploaded from "${fileName}" and standardized on-device. Trained via the federation like any built-in dataset.`,
      nSamples: nn,
      positiveRate: positives / nn,
      seed: 1000 + (nn % 9000),
      positiveLabel: positiveToken,
      negativeLabel: uniq.find((v) => v !== positiveToken) ?? "negative",
      features,
      custom: true,
    },
    domain,
    X,
    raw,
    y,
    mean,
    std,
    uploadedAt: Date.now(),
    fileName,
  };

  return { def, error: null, usedRows: nn };
}

/** Serialize prediction results to a downloadable CSV string. */
export function predictionsToCSV(
  rows: { index: number; label: string; probability: number }[]
): string {
  const head = "row,predicted_label,probability";
  const body = rows
    .map((r) => `${r.index},${r.label.replace(/,/g, " ")},${r.probability.toFixed(4)}`)
    .join("\n");
  return `${head}\n${body}`;
}
