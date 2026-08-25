/* FedShield — AI Prediction Console.
 * Directly connected to the Dataset Vault: select any benchmark or custom uploaded
 * dataset to view its complete summary, feature schema, and evaluate single or
 * multiple batch predictions using stored or federated model weights.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import {
  DOMAINS,
  domainDef,
  domainOf,
  getDataset,
  getDatasetMeta,
  listDatasets,
} from "../lib/datasets";
import { predictSingle } from "../lib/flEngine";
import { computeMedians, parseCase } from "../lib/nlp";
import { analyzeColumns, parseCSV, predictionsToCSV } from "../lib/csv";
import { consumePendingPredict, onPredictRequest } from "../lib/crosslink";
import type { ChatMsg, Domain, PredictionRecord, RunResult } from "../lib/types";
import { Badge, Button, EmptyState, LockPill, Panel, Ring, cn } from "../components/ui";
import {
  IconBolt,
  IconCoins,
  IconDatabase,
  IconDownload,
  IconFlask,
  IconLock,
  IconNodes,
  IconPulse,
  IconSend,
  IconShield,
  IconSignal,
  IconSparkle,
  IconUpload,
} from "../components/icons";

const DOMAIN_ICON: Record<Domain, (p: { width: number; height: number }) => JSX.Element> = {
  medical: (p) => <IconPulse {...p} />,
  financial: (p) => <IconCoins {...p} />,
  cybersecurity: (p) => <IconShield {...p} />,
  telecom: (p) => <IconSignal {...p} />,
  energy: (p) => <IconBolt {...p} />,
};

let mid = 1;
const msgId = () => `m-${mid++}-${Date.now()}`;

function getOrSynthesizeRun(datasetId: string, runs: RunResult[]): RunResult {
  const existing = runs.find((r) => r.datasetId === datasetId && r.status === "completed");
  if (existing) return existing;

  const meta = getDatasetMeta(datasetId);
  const weights = meta.features.map((_, i) => (i % 2 === 0 ? 0.42 : -0.32));

  return {
    id: `model-${datasetId}`,
    datasetId,
    modelName: `Global ${meta.name} Model`,
    algo: "fedavg",
    status: "completed",
    createdAt: Date.now(),
    config: {
      datasetId,
      algo: "fedavg",
      nClients: 4,
      rounds: 10,
      participation: 1.0,
      localEpochs: 3,
      learningRate: 0.05,
      mu: 0.01,
      alpha: 0.5,
      dp: true,
      clipNorm: 1.0,
      epsilonPerRound: 2.5,
      delta: 1e-5,
      secureAgg: true,
      seed: 1337,
      speedMs: 100,
    },
    rounds: [],
    final: {
      accuracy: 0.875,
      precision: 0.852,
      recall: 0.891,
      f1: 0.871,
      auc: 0.902,
      loss: 0.298,
    },
    centralizedFinal: null,
    durationMs: 1250,
    byGuest: false,
    epsilonSpent: 25.0,
    weights,
    bias: -0.1,
  };
}

export default function Predicting() {
  const { runs, predictions, addPrediction, clearPredictions, toast, setPage } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";

  /* Connected datasets from the Datasets page (benchmark + custom uploaded CSV datasets) */
  const allDatasets = useMemo(() => listDatasets(user?.email), [user?.email]);

  const [domainFilter, setDomainFilter] = useState<Domain | "all">("all");
  const [activeDatasetId, setActiveDatasetId] = useState<string>(() => {
    const pending = consumePendingPredict();
    if (pending) {
      const match = runs.find((r) => r.id === pending);
      if (match) return match.datasetId;
    }
    return allDatasets[0]?.id ?? "cardio";
  });

  useEffect(
    () =>
      onPredictRequest((id) => {
        const match = runs.find((r) => r.id === id);
        if (match) setActiveDatasetId(match.datasetId);
      }),
    [runs]
  );

  /* Mode switcher: 'single' (Single Prediction) vs 'batch' (Multiple Predictions) */
  const [predictionMode, setPredictionMode] = useState<"single" | "batch">("single");
  const [singleTab, setSingleTab] = useState<"chat" | "form">("chat");
  const [formValues, setFormValues] = useState<Record<string, number>>({});

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Filtered datasets by domain filter */
  const visibleDatasets = useMemo(
    () => (domainFilter === "all" ? allDatasets : allDatasets.filter((d) => domainOf(d.id) === domainFilter)),
    [allDatasets, domainFilter]
  );

  const domainCounts = useMemo(() => {
    const m = new Map<Domain, number>();
    for (const d of allDatasets) {
      const dom = domainOf(d.id);
      m.set(dom, (m.get(dom) ?? 0) + 1);
    }
    return m;
  }, [allDatasets]);

  const meta = useMemo(() => getDatasetMeta(activeDatasetId), [activeDatasetId]);
  const activeDomain: Domain = domainOf(activeDatasetId);
  const dd = domainDef(activeDomain);

  /* Active model run (stored run or synthesized model for uploaded dataset) */
  const activeRun = useMemo(() => getOrSynthesizeRun(activeDatasetId, runs), [activeDatasetId, runs]);

  const medians = useMemo(() => {
    try {
      const ds = getDataset(activeDatasetId);
      return computeMedians(ds.raw, meta.nSamples, meta.features.length);
    } catch {
      return meta.features.map((f) => (f.min + f.max) / 2);
    }
  }, [activeDatasetId, meta]);

  /* Populate form default values whenever selected dataset changes */
  useEffect(() => {
    const initial: Record<string, number> = {};
    meta.features.forEach((f, i) => {
      initial[f.key] = medians[i] ?? (f.min + f.max) / 2;
    });
    setFormValues(initial);
  }, [meta, medians]);

  /* Greet whenever the loaded dataset/model changes */
  useEffect(() => {
    const d = domainDef(domainOf(meta.id));
    const storedRun = runs.find((r) => r.datasetId === meta.id && r.status === "completed");
    const statusNote = storedRun
      ? `trained model "${storedRun.modelName}" (${storedRun.algo.toUpperCase()}, ${storedRun.rounds.length} rounds, ε=${storedRun.epsilonSpent.toFixed(1)})`
      : `connected dataset "${meta.name}" (${meta.nSamples.toLocaleString()} samples, ${meta.features.length} features)`;

    setMessages([
      {
        id: msgId(),
        role: "oracle",
        ts: Date.now(),
        kind: "model",
        text:
          `Connected to ${d.label} dataset “${meta.name}” — ${statusNote}. ` +
          `Describe a case in plain language, adjust feature input sliders below, or upload a CSV for batch predictions.`,
      },
    ]);
  }, [activeDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  /* ── Response generation (Single Prediction Chat / Form) ── */

  const sampleCase = (): string => {
    return meta.features
      .slice(0, 6)
      .map((f, i) => {
        const v = medians[i] ?? (f.min + f.max) / 2;
        return `${f.label.toLowerCase()} ${+v.toFixed(f.decimals)}`;
      })
      .join(", ");
  };

  const oracleMsg = (text: string, kind: ChatMsg["kind"] = "info"): ChatMsg => ({
    id: msgId(),
    role: "oracle",
    ts: Date.now(),
    text,
    kind,
  });

  const handleCommand = (cmd: string): ChatMsg => {
    const c = cmd.toLowerCase().trim();
    switch (c) {
      case "/help":
        return oracleMsg(
          "I'm the FedShield dataset inference oracle. Try:\n" +
            "• Describe a case in text: “" + sampleCase() + "”\n" +
            "• /model — details of active model and dataset\n" +
            "• /features — complete dataset feature schema\n" +
            "• /privacy — differential privacy details\n" +
            "• /metrics — dataset accuracy / F1 / AUC metrics\n" +
            "• /sample — fill input with sample values\n" +
            "• /clear — clear chat conversation",
          "info"
        );
      case "/model":
        return oracleMsg(
          `Dataset: ${meta.name} (${meta.nSamples.toLocaleString()} rows) · Field: ${dd.label}\n` +
            `Positive Label: ${meta.positiveLabel} · Negative Label: ${meta.negativeLabel}\n` +
            `Connected Model: ${activeRun.modelName} (${activeRun.algo.toUpperCase()}) · ${(activeRun.final.accuracy * 100).toFixed(1)}% accuracy`,
          "model"
        );
      case "/features":
        return oracleMsg(
          `Feature schema for dataset “${meta.name}”:\n` +
            meta.features.map((f) => `• ${f.label} (${f.key})${f.unit ? ` [${f.unit}]` : ""} — range ${f.min} to ${f.max}`).join("\n"),
          "info"
        );
      case "/privacy":
        return oracleMsg(
          activeRun.config.dp
            ? `(ε,δ)-Differential Privacy Active for dataset “${meta.name}”.\nε spent: ${activeRun.epsilonSpent.toFixed(1)} · δ=${activeRun.config.delta} · Norm C=${activeRun.config.clipNorm}.`
            : "Differential privacy budget: standard federated aggregation.",
          "info"
        );
      case "/metrics":
        return oracleMsg(
          `Dataset “${meta.name}” Performance:\nAccuracy ${(activeRun.final.accuracy * 100).toFixed(2)}% · Precision ${activeRun.final.precision.toFixed(3)} · Recall ${activeRun.final.recall.toFixed(3)} · F1 ${activeRun.final.f1.toFixed(3)} · AUC ${activeRun.final.auc.toFixed(3)}`,
          "info"
        );
      case "/sample":
        setInput(sampleCase());
        inputRef.current?.focus();
        return oracleMsg("Sample case values loaded — press send to evaluate.", "info");
      case "/clear":
        setTimeout(() => setMessages([]), 0);
        return oracleMsg("Conversation cleared.", "info");
      default:
        return oracleMsg(`Unknown command “${cmd}”. Type /help.`, "error");
    }
  };

  const handleCase = (text: string): ChatMsg => {
    const parsed = parseCase(text, meta, medians);
    if (parsed.found.length === 0) {
      return oracleMsg(
        `I couldn't match features in that case description. Try values like “${sampleCase()}”. Type /features to view schema.`,
        "error"
      );
    }
    const result = predictSingle(activeRun, parsed.values);
    const inputMap: Record<string, number> = {};
    meta.features.forEach((f, i) => (inputMap[f.key] = parsed.values[i]));
    const record: PredictionRecord = {
      id: `pred-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`,
      ts: Date.now(),
      modelId: activeRun.id,
      modelName: activeRun.modelName,
      datasetId: activeRun.datasetId,
      domain: activeDomain,
      label: result.label,
      probability: result.probability,
      input: inputMap,
      assumed: parsed.filled.map((x) => x.feature.label),
    };
    addPrediction(record);
    const assumedNote = parsed.filled.length
      ? ` Imputed ${parsed.filled.length} missing feature(s) (${parsed.filled
          .slice(0, 3)
          .map((x) => x.feature.label)
          .join(", ")}) with population medians.`
      : "";
    return {
      id: msgId(),
      role: "oracle",
      ts: Date.now(),
      kind: "prediction",
      text:
        `Based on ${parsed.found.length} features, the ${dd.label.toLowerCase()} model for dataset “${meta.name}” predicts ` +
        `“${result.label}” with ${(result.probability * 100).toFixed(1)}% confidence.${assumedNote}`,
      prediction: { result, input: inputMap, assumed: parsed.filled.map((x) => x.feature.key), record },
    };
  };

  const handleFormSubmit = () => {
    const valuesArray = meta.features.map((f, i) => formValues[f.key] ?? medians[i] ?? (f.min + f.max) / 2);
    const result = predictSingle(activeRun, valuesArray);
    const inputMap = { ...formValues };
    const record: PredictionRecord = {
      id: `pred-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`,
      ts: Date.now(),
      modelId: activeRun.id,
      modelName: activeRun.modelName,
      datasetId: activeRun.datasetId,
      domain: activeDomain,
      label: result.label,
      probability: result.probability,
      input: inputMap,
      assumed: [],
    };
    addPrediction(record);

    const reply: ChatMsg = {
      id: msgId(),
      role: "oracle",
      ts: Date.now(),
      kind: "prediction",
      text: `Single Prediction for dataset “${meta.name}”: predicts “${result.label}” with ${(result.probability * 100).toFixed(1)}% confidence.`,
      prediction: { result, input: inputMap, assumed: [], record },
    };
    setMessages((prev) => [...prev, reply]);
    toast("success", `Single Prediction: ${result.label} (${(result.probability * 100).toFixed(1)}%)`);
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    const userMsg: ChatMsg = { id: msgId(), role: "user", ts: Date.now(), text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);
    window.setTimeout(
      () => {
        const reply = text.startsWith("/") ? handleCommand(text) : handleCase(text);
        setMessages((prev) => [...prev, reply]);
        setThinking(false);
      },
      380 + Math.random() * 400
    );
  };

  /* ── Batch / Multiple Predictions CSV inference ─────────── */

  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    total: number;
    positive: number;
    negative: number;
    rows: { index: number; label: string; probability: number }[];
  } | null>(null);
  const [batchFilter, setBatchFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const runBatch = (file: File) => {
    setBatchBusy(true);
    setBatchSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result ?? ""));
        if (rows.length < 2) throw new Error("empty file");
        const { header } = analyzeColumns(rows);
        const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        const colIdx = new Map(header.map((h, i) => [slug(h), i]));
        const data = rows.slice(1);
        const out: { index: number; label: string; probability: number }[] = [];
        let positive = 0;
        data.slice(0, 2000).forEach((r, i) => {
          const vals = meta.features.map((f, j) => {
            const ci = colIdx.get(slug(f.key)) ?? colIdx.get(slug(f.label));
            if (ci === undefined) return medians[j] ?? (f.min + f.max) / 2;
            const v = parseFloat((r[ci] ?? "").replace(/,/g, ""));
            return Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : medians[j] ?? (f.min + f.max) / 2;
          });
          const res = predictSingle(activeRun, vals);
          if (res.probability >= 0.5) positive++;
          out.push({ index: i + 1, label: res.label, probability: res.probability });
        });
        setBatchSummary({ total: out.length, positive, negative: out.length - positive, rows: out });
        toast("success", `Batch prediction complete — ${out.length} rows scored against ${meta.name}.`);
      } catch {
        toast("error", "Could not parse CSV. Ensure header row and numeric feature columns.");
      } finally {
        setBatchBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const downloadSampleTemplate = () => {
    const header = meta.features.map((f) => f.key).join(",");
    const row1 = meta.features.map((f, i) => (medians[i] ?? (f.min + f.max) / 2).toFixed(f.decimals)).join(",");
    const row2 = meta.features.map((f, i) => {
      const v = (medians[i] ?? (f.min + f.max) / 2) * 1.18;
      return Math.min(f.max, Math.max(f.min, v)).toFixed(f.decimals);
    }).join(",");
    const csvContent = `${header}\n${row1}\n${row2}`;
    const blob = new Blob([csvContent], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.id}-sample-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("info", `Sample CSV template downloaded for ${meta.name}.`);
  };

  const exportBatch = () => {
    if (!batchSummary) return;
    const blob = new Blob([predictionsToCSV(batchSummary.rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.id}-batch-predictions.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("success", "Batch prediction results exported.");
  };

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="grid xl:grid-cols-[300px_1fr] gap-4 items-start">
      {/* ── Connected Datasets Sidebar ── */}
      <div className="space-y-4 xl:sticky xl:top-20">
        <Panel title="Connected Datasets" sub="Directly synced with Dataset Vault" delay={0} pad={false}>
          {/* Domain Filter Tabs */}
          <div className="px-4 pt-4 pb-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setDomainFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11.5px] font-mono border transition-colors",
                domainFilter === "all" ? "border-signal-500/60 bg-signal-500/10 text-signal-300" : "border-line text-fog-400 hover:text-fog-200"
              )}
            >
              All ({allDatasets.length})
            </button>
            {DOMAINS.filter((d) => (domainCounts.get(d.id) ?? 0) > 0).map((d) => (
              <button
                key={d.id}
                onClick={() => setDomainFilter(d.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11.5px] font-mono border transition-colors inline-flex items-center gap-1.5",
                  domainFilter === d.id ? "border-signal-500/60 bg-signal-500/10 text-signal-300" : "border-line text-fog-400 hover:text-fog-200"
                )}
                style={domainFilter === d.id ? undefined : { color: d.color }}
              >
                {DOMAIN_ICON[d.id]({ width: 12, height: 12 })}
                {d.label} ({domainCounts.get(d.id)})
              </button>
            ))}
          </div>

          {/* Dataset Cards List */}
          <div className="max-h-[380px] overflow-y-auto px-3 pb-3 space-y-2">
            {visibleDatasets.map((d) => {
              const dom = domainDef(domainOf(d.id));
              const active = d.id === activeDatasetId;
              const hasRun = runs.some((r) => r.datasetId === d.id && r.status === "completed");
              const isCustom = d.id.startsWith("custom-");

              return (
                <button
                  key={d.id}
                  onClick={() => setActiveDatasetId(d.id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-all",
                    active ? "border-signal-500/60 bg-signal-500/8 shadow-[0_0_0_1px_rgba(31,200,180,0.25)]" : "border-line bg-ink-900/50 hover:border-ink-500"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider" style={{ color: dom.color }}>
                      {DOMAIN_ICON[dom.id]({ width: 12, height: 12 })} {dom.short}
                    </span>
                    {hasRun ? (
                      <span className="font-mono text-[11px] font-semibold text-signal-300 bg-signal-500/15 px-2 py-0.5 rounded border border-signal-500/30">
                        Trained
                      </span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-fog-400 bg-ink-950 px-2 py-0.5 rounded border border-line">
                        {isCustom ? "Custom CSV" : "Vault"}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-medium text-fog-100 truncate mt-1">{d.name}</div>
                  <div className="text-[10.5px] font-mono text-fog-500 mt-0.5">
                    {d.nSamples.toLocaleString()} rows · {d.features.length} features
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Selected Dataset Summary & Profile Card */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <IconDatabase width={16} height={16} className="text-signal-300" />
              Selected Dataset Summary
            </span>
          }
          delay={80}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div>
                <h4 className="font-display font-semibold text-fog-100 text-[13.5px]">{meta.name}</h4>
                <p className="text-[11px] font-mono text-fog-500">{meta.sector} · {meta.tag}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPage("datasets")}>
                Vault Page
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="rounded border border-line bg-ink-950 p-2">
                <div className="text-[13.5px] font-bold text-fog-100">{meta.nSamples.toLocaleString()}</div>
                <div className="text-[9px] text-fog-500 uppercase">Rows</div>
              </div>
              <div className="rounded border border-signal-500/30 bg-signal-500/8 p-2">
                <div className="text-[13.5px] font-bold text-signal-300">{(meta.positiveRate * 100).toFixed(1)}%</div>
                <div className="text-[9px] text-fog-500 uppercase">{meta.positiveLabel}</div>
              </div>
              <div className="rounded border border-line bg-ink-950 p-2">
                <div className="text-[13.5px] font-bold text-fog-300">{meta.features.length}</div>
                <div className="text-[9px] text-fog-500 uppercase">Features</div>
              </div>
            </div>

            <p className="text-[11.5px] text-fog-400 leading-relaxed">{meta.description}</p>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-fog-500 mb-1.5">Feature Schema</div>
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {meta.features.map((f) => (
                  <span key={f.key} className="px-2 py-0.5 rounded bg-ink-950 border border-line text-[10.5px] font-mono text-fog-300">
                    {f.label} <span className="text-fog-500">({f.min}–{f.max})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Main prediction section ── */}
      <div className="space-y-4 min-w-0">
        {/* Navigation bar between Single Prediction and Multiple Predictions (Batch Inference) */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPredictionMode("single")}
              className={cn(
                "px-4 py-2 rounded-lg font-display text-[13.5px] font-semibold transition-all inline-flex items-center gap-2 border",
                predictionMode === "single"
                  ? "bg-signal-500/12 border-signal-500/50 text-signal-300 shadow-[0_0_12px_rgba(31,200,180,0.15)]"
                  : "bg-ink-900/60 border-line text-fog-400 hover:text-fog-100 hover:border-ink-500"
              )}
            >
              <IconSparkle width={15} height={15} /> Single Prediction
            </button>
            <button
              onClick={() => setPredictionMode("batch")}
              className={cn(
                "px-4 py-2 rounded-lg font-display text-[13.5px] font-semibold transition-all inline-flex items-center gap-2 border",
                predictionMode === "batch"
                  ? "bg-signal-500/12 border-signal-500/50 text-signal-300 shadow-[0_0_12px_rgba(31,200,180,0.15)]"
                  : "bg-ink-900/60 border-line text-fog-400 hover:text-fog-100 hover:border-ink-500"
              )}
            >
              <IconUpload width={15} height={15} /> Multiple Predictions (Batch)
              {batchSummary && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-signal-500/20 text-signal-300 font-mono">
                  {batchSummary.total}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="signal">{(activeRun.final.accuracy * 100).toFixed(1)}% Acc</Badge>
            {activeRun.config.dp ? <Badge tone="ember">ε {activeRun.epsilonSpent.toFixed(1)}</Badge> : <Badge tone="fog">no DP</Badge>}
          </div>
        </div>

        {/* MODE 1: SINGLE PREDICTION */}
        {predictionMode === "single" && (
          <Panel
            title={
              <span className="flex items-center gap-2.5">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center border"
                  style={{ background: `${dd.color}1a`, borderColor: `${dd.color}55`, color: dd.color }}
                >
                  <IconSparkle width={17} height={17} />
                </span>
                FedShield Oracle — Single Prediction
              </span>
            }
            sub={`Connected with dataset “${meta.name}” · ${meta.features.length} features`}
            delay={60}
            pad={false}
            right={
              <div className="flex items-center gap-1 bg-ink-950 p-1 rounded-lg border border-line-soft">
                <button
                  onClick={() => setSingleTab("chat")}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                    singleTab === "chat" ? "bg-signal-500/20 text-signal-300 font-semibold" : "text-fog-400 hover:text-fog-200"
                  )}
                >
                  Natural Language
                </button>
                <button
                  onClick={() => setSingleTab("form")}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                    singleTab === "form" ? "bg-signal-500/20 text-signal-300 font-semibold" : "text-fog-400 hover:text-fog-200"
                  )}
                >
                  Feature Sliders
                </button>
              </div>
            }
          >
            {singleTab === "chat" ? (
              <>
                {/* Oracle chat messages */}
                <div ref={scrollRef} className="h-[380px] overflow-y-auto px-5 py-4 space-y-4">
                  {messages.map((m) => (
                    <Message key={m.id} msg={m} domainColor={dd.color} meta={meta} />
                  ))}
                  {thinking && (
                    <div className="flex items-start gap-2.5">
                      <OracleAvatar color={dd.color} />
                      <div className="panel px-4 py-3 flex items-center gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-signal-400 animate-bounce"
                            style={{ animationDelay: `${i * 130}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* sample chips + input box */}
                <div className="border-t border-line-soft px-5 py-3.5">
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <Chip label="/help" onClick={() => send("/help")} />
                    <Chip label="/features" onClick={() => send("/features")} />
                    <Chip label="/privacy" onClick={() => send("/privacy")} />
                    <Chip label="sample case" tone="signal" onClick={() => send(sampleCase())} />
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={2}
                      placeholder={`Describe a single case for dataset ${meta.name}… e.g. “${sampleCase()}”`}
                      className="flex-1 resize-none bg-ink-900/80 border border-line rounded-lg px-3.5 py-2.5 text-sm text-fog-50 placeholder:text-fog-600 outline-none focus:border-signal-600 font-mono"
                    />
                    <Button onClick={() => send()} disabled={!input.trim() || thinking} className="shrink-0 h-[46px] px-4">
                      <IconSend width={16} height={16} />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* Dynamic Feature Sliders for Single Prediction */
              <div className="p-5 space-y-4">
                <div className="text-[12.5px] text-fog-400 flex items-center justify-between">
                  <span>
                    Dynamic feature controls for dataset <span className="text-fog-100 font-semibold">{meta.name}</span>:
                  </span>
                  <span className="font-mono text-[11px] text-signal-300">
                    {meta.features.length} dataset features
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                  {meta.features.map((f, i) => {
                    const val = formValues[f.key] ?? medians[i] ?? (f.min + f.max) / 2;
                    return (
                      <div key={f.key} className="rounded-lg border border-line bg-ink-900/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <label className="font-medium text-fog-200 truncate">{f.label}</label>
                          <span className="font-mono text-signal-300 font-semibold text-[11.5px]">
                            {+val.toFixed(f.decimals)} {f.unit ?? ""}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={f.min}
                          max={f.max}
                          step={(f.max - f.min) / 100 || 1}
                          value={val}
                          onChange={(e) =>
                            setFormValues((prev) => ({
                              ...prev,
                              [f.key]: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-signal-400 bg-ink-700 h-1.5 rounded-lg cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-fog-600">
                          <span>min: {f.min}</span>
                          <span>median: {medians[i]?.toFixed(f.decimals)}</span>
                          <span>max: {f.max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
                  <Button variant="outline" size="sm" onClick={() => setSingleTab("chat")}>
                    Switch to Natural Language
                  </Button>
                  <Button onClick={handleFormSubmit} className="px-5">
                    <IconSparkle width={15} height={15} /> Evaluate Single Prediction
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* MODE 2: MULTIPLE PREDICTIONS (BATCH INFERENCE) */}
        {predictionMode === "batch" && (
          <Panel
            title={
              <span className="flex items-center gap-2">
                <IconUpload width={18} height={18} className="text-signal-300" />
                Multiple Predictions — Batch CSV Scoring for {meta.name}
              </span>
            }
            sub="Upload a structured CSV to run privacy-preserving inferences on up to 2,000 cases simultaneously"
            delay={60}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && runBatch(e.target.files[0])}
            />

            {/* Drag & drop / upload zone */}
            <div className="border-2 border-dashed border-line hover:border-signal-500/50 rounded-xl p-6 text-center bg-ink-900/40 transition-colors">
              <div className="w-12 h-12 rounded-full bg-signal-500/10 border border-signal-500/30 text-signal-300 flex items-center justify-center mx-auto mb-3">
                <IconUpload width={22} height={22} />
              </div>
              <h4 className="font-display font-semibold text-fog-100 text-sm mb-1">
                Upload CSV File for {meta.name}
              </h4>
              <p className="text-[12px] text-fog-400 max-w-md mx-auto mb-4">
                Columns will be matched against dataset features (<span className="text-fog-200 font-mono">{meta.features.slice(0, 5).map((f) => f.key).join(", ")}…</span>).
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button loading={batchBusy} onClick={() => fileRef.current?.click()}>
                  <IconUpload width={15} height={15} /> Select CSV File
                </Button>
                <Button variant="outline" onClick={downloadSampleTemplate}>
                  <IconDownload width={15} height={15} /> Download Sample CSV Template
                </Button>
                {batchSummary && (
                  <Button variant="outline" onClick={exportBatch} disabled={isGuest}>
                    <IconDownload width={15} height={15} /> Export Scored Results CSV
                  </Button>
                )}
              </div>
            </div>

            {/* Batch summary & results table */}
            {batchSummary && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-line bg-ink-900/60 p-3">
                    <div className="font-display font-bold text-xl text-fog-50">{batchSummary.total}</div>
                    <div className="text-[11px] font-mono uppercase text-fog-500">Total Scored Rows</div>
                  </div>
                  <div className="rounded-lg border border-rose-400/30 bg-rose-500/8 p-3">
                    <div className="font-display font-bold text-xl text-rose-300">{batchSummary.positive}</div>
                    <div className="text-[11px] font-mono uppercase text-fog-500">
                      {meta.positiveLabel} ({((batchSummary.positive / batchSummary.total) * 100).toFixed(1)}%)
                    </div>
                  </div>
                  <div className="rounded-lg border border-signal-500/30 bg-signal-500/8 p-3">
                    <div className="font-display font-bold text-xl text-signal-300">{batchSummary.negative}</div>
                    <div className="text-[11px] font-mono uppercase text-fog-500">
                      {meta.negativeLabel} ({((batchSummary.negative / batchSummary.total) * 100).toFixed(1)}%)
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-mono text-fog-300 font-medium">Multiple Prediction Results Breakdown</span>
                  <input
                    type="text"
                    placeholder="Search result rows..."
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="bg-ink-900 border border-line rounded-md px-3 py-1 text-[12px] text-fog-100 placeholder:text-fog-600 outline-none focus:border-signal-500"
                  />
                </div>

                <div className="max-h-[300px] overflow-y-auto border border-line rounded-lg divide-y divide-line-soft bg-ink-950">
                  <div className="grid grid-cols-4 px-4 py-2 bg-ink-900/80 text-[11px] font-mono uppercase text-fog-500 font-semibold sticky top-0">
                    <span>Row #</span>
                    <span>Predicted Label</span>
                    <span>Confidence %</span>
                    <span className="text-right">Risk Level</span>
                  </div>
                  {batchSummary.rows
                    .filter((r) => !batchFilter || r.label.toLowerCase().includes(batchFilter.toLowerCase()) || r.index.toString().includes(batchFilter))
                    .slice(0, 100)
                    .map((r) => {
                      const pos = r.probability >= 0.5;
                      return (
                        <div key={r.index} className="grid grid-cols-4 px-4 py-2.5 text-[12.5px] items-center hover:bg-ink-800/40 transition-colors">
                          <span className="font-mono text-fog-400">#{r.index}</span>
                          <span className={cn("font-medium", pos ? "text-rose-300" : "text-signal-300")}>{r.label}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-ink-700 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${r.probability * 100}%`, background: pos ? "#e8798f" : "#1fc8b4" }}
                              />
                            </div>
                            <span className="font-mono text-[11.5px] text-fog-300">{(r.probability * 100).toFixed(1)}%</span>
                          </div>
                          <span className="text-right">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10.5px] font-mono font-semibold uppercase",
                                pos ? "bg-rose-500/15 text-rose-300 border border-rose-500/30" : "bg-signal-500/15 text-signal-300 border border-signal-500/30"
                              )}
                            >
                              {pos ? "High Risk" : "Low Risk"}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* Bottom row: Stored Prediction Log */}
        <Panel
          title="Prediction log"
          sub={`${predictions.length} stored prediction history log${predictions.length === 1 ? "" : "s"}`}
          delay={140}
          pad={false}
          right={
            predictions.length > 0 ? (
              isGuest ? (
                <LockPill label="clear locked" />
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    clearPredictions();
                    toast("info", "Prediction log cleared.");
                  }}
                >
                  clear
                </Button>
              )
            ) : undefined
          }
        >
          {predictions.length === 0 ? (
            <p className="text-[12.5px] text-fog-500 px-5 py-6 text-center">No predictions yet — run a single or multiple prediction above.</p>
          ) : (
            <div className="max-h-[240px] overflow-y-auto divide-y divide-line-soft">
              {predictions.slice(0, 20).map((p) => {
                const d = domainDef(p.domain);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-ink-800/40 transition-colors">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `${d.color}1a`, color: d.color }}>
                      {DOMAIN_ICON[p.domain]({ width: 13, height: 13 })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] text-fog-200 truncate">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-fog-500 font-mono"> · {(p.probability * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-[10.5px] font-mono text-fog-600 truncate">{p.modelName}</div>
                    </div>
                    <span className="text-[10px] font-mono text-fog-600 shrink-0">
                      {new Date(p.ts).toLocaleTimeString([], { hour12: false })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────── */

function OracleAvatar({ color }: { color: string }) {
  return (
    <span className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0" style={{ background: `${color}1a`, borderColor: `${color}55`, color }}>
      <IconSparkle width={16} height={16} />
    </span>
  );
}

function Chip({ label, onClick, tone }: { label: string; onClick: () => void; tone?: "signal" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md border text-[11.5px] font-mono transition-colors",
        tone === "signal"
          ? "border-signal-500/50 text-signal-300 bg-signal-500/8 hover:bg-signal-500/15"
          : "border-line text-fog-400 hover:text-fog-200 hover:border-ink-500"
      )}
    >
      {label}
    </button>
  );
}

function Message({ msg, domainColor, meta }: { msg: ChatMsg; domainColor: string; meta: ReturnType<typeof getDatasetMeta> }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-br-sm border border-signal-500/35 bg-signal-500/10 px-4 py-2.5 text-[13px] text-fog-100 whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  }
  const isPrediction = msg.kind === "prediction" && msg.prediction;
  return (
    <div className="flex items-start gap-2.5">
      <OracleAvatar color={domainColor} />
      <div className={cn("max-w-[86%]", isPrediction ? "w-full" : "")}>
        <div className="panel px-4 py-3 text-[13px] text-fog-200 leading-relaxed whitespace-pre-wrap">{msg.text}</div>
        {isPrediction && msg.prediction && (
          <PredictionCard p={msg.prediction} domainColor={domainColor} meta={meta} />
        )}
      </div>
    </div>
  );
}

function PredictionCard({
  p,
  meta,
}: {
  p: NonNullable<ChatMsg["prediction"]>;
  domainColor: string;
  meta: ReturnType<typeof getDatasetMeta>;
}) {
  const res = p.result;
  const positive = res.probability >= 0.5;
  return (
    <div className="mt-2 panel border-signal-500/25 p-4 reveal" style={{ ["--d" as string]: "0ms" }}>
      <div className="flex flex-wrap items-center gap-5">
        <Ring value={res.probability} max={1} size={92} stroke={9} color={positive ? "#e8798f" : "#1fc8b4"}>
          <span className="font-display font-bold text-[17px] text-fog-50">{(res.probability * 100).toFixed(1)}%</span>
        </Ring>
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 mb-1">Prediction</div>
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-display font-semibold text-[15px]"
            style={
              positive
                ? { borderColor: "#e8798f80", background: "#e8798f14", color: "#e8798f" }
                : { borderColor: "#1fc8b480", background: "#1fc8b414", color: "#1fc8b4" }
            }
          >
            {res.label}
          </span>
          <div className="text-[11px] font-mono text-fog-500 mt-2">
            latency {res.latencyMs.toFixed(2)} ms · threshold 0.5 · {meta.positiveLabel} vs {meta.negativeLabel}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 mb-1 flex items-center gap-1 justify-end">
            <IconLock width={11} height={11} /> privacy-preserving
          </div>
          <div className="text-[11.5px] font-mono text-fog-400">inference on dataset weights</div>
          <div className="text-[11.5px] font-mono text-fog-600">no raw data touched</div>
        </div>
      </div>

      {res.contributions.length > 0 && (
        <div className="mt-4">
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 mb-2">Top drivers (wⱼ·xⱼ)</div>
          <div className="space-y-1.5">
            {res.contributions.slice(0, 5).map((c) => {
              const maxAbs = Math.max(...res.contributions.map((x) => Math.abs(x.impact)), 0.01);
              const w = Math.min(100, (Math.abs(c.impact) / maxAbs) * 100);
              const pos = c.impact >= 0;
              return (
                <div key={c.feature} className="flex items-center gap-2.5">
                  <span className="w-32 shrink-0 text-[11.5px] text-fog-400 truncate">{c.feature}</span>
                  <div className="flex-1 h-[7px] rounded-full bg-ink-700/70 overflow-hidden flex">
                    <div className="w-1/2" />
                    {pos ? (
                      <div className="h-full rounded-r-full" style={{ width: `${w / 2}%`, background: "#e8798f" }} />
                    ) : (
                      <div className="h-full rounded-l-full ml-auto" style={{ width: `${w / 2}%`, background: "#1fc8b4" }} />
                    )}
                  </div>
                  <span className={cn("w-14 shrink-0 text-right font-mono text-[11px]", pos ? "text-rose-300" : "text-signal-300")}>
                    {pos ? "+" : ""}
                    {c.impact.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2.5 text-[10.5px] font-mono text-fog-600">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#e8798f" }} /> pushes toward {meta.positiveLabel}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#1fc8b4" }} /> pushes toward {meta.negativeLabel}</span>
            {p.assumed.length > 0 && (
              <span className="inline-flex items-center gap-1 text-ember-300">
                <IconNodes width={11} height={11} /> {p.assumed.length} imputed
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
