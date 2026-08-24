/* FedShield — AI Prediction Console.
 * Acts like an LLM: you select a field-specific trained model (stored from
 * the Training Lab) and converse with it — describe a case in plain language
 * or use commands, and it returns privacy-preserving predictions with
 * explanations. Every prediction is logged. Batch CSV inference included.
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
} from "../lib/datasets";
import { predictSingle } from "../lib/flEngine";
import { computeMedians, parseCase } from "../lib/nlp";
import { analyzeColumns, buildCustomDataset, parseCSV, predictionsToCSV } from "../lib/csv";
import { consumePendingPredict, onPredictRequest } from "../lib/crosslink";
import type { ChatMsg, Domain, PredictionRecord, RunResult } from "../lib/types";
import { Badge, Button, EmptyState, LockPill, Panel, Ring, cn } from "../components/ui";
import {
  IconBolt,
  IconCoins,
  IconDownload,
  IconFlask,
  IconLock,
  IconNodes,
  IconPulse,
  IconSend,
  IconShield,
  IconSignal,
  IconSparkle,
  IconTerminal,
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

export default function Predicting() {
  const { runs, predictions, addPrediction, clearPredictions, toast, setPage } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";

  const models = useMemo(() => runs.filter((r) => r.status === "completed"), [runs]);
  const [domainFilter, setDomainFilter] = useState<Domain | "all">("all");
  const [activeRunId, setActiveRunId] = useState<string | null>(() => consumePendingPredict() ?? models[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () =>
      onPredictRequest((id) => {
        setActiveRunId(id);
      }),
    []
  );

  const visibleModels = useMemo(
    () => (domainFilter === "all" ? models : models.filter((m) => domainOf(m.datasetId) === domainFilter)),
    [models, domainFilter]
  );
  const domainCounts = useMemo(() => {
    const m = new Map<Domain, number>();
    for (const r of models) {
      const d = domainOf(r.datasetId);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [models]);

  const activeRun: RunResult | undefined = useMemo(
    () => models.find((r) => r.id === activeRunId),
    [models, activeRunId]
  );

  /* Keep the selection valid: fall back to the first model if it goes stale. */
  useEffect(() => {
    if (!activeRun && models.length > 0) setActiveRunId(models[0].id);
  }, [activeRun, models]);

  const meta = useMemo(() => (activeRun ? getDatasetMeta(activeRun.datasetId) : null), [activeRun]);
  const activeDomain: Domain = activeRun ? domainOf(activeRun.datasetId) : "medical";
  const dd = domainDef(activeDomain);

  const medians = useMemo(() => {
    if (!activeRun || !meta) return [];
    try {
      const ds = getDataset(activeRun.datasetId);
      return computeMedians(ds.raw, meta.nSamples, meta.features.length);
    } catch {
      return meta.features.map((f) => (f.min + f.max) / 2);
    }
  }, [activeRun, meta]);

  /* Greet whenever the loaded model changes. */
  useEffect(() => {
    if (!activeRun || !meta) {
      setMessages([]);
      return;
    }
    const d = domainDef(domainOf(activeRun.datasetId));
    setMessages([
      {
        id: msgId(),
        role: "oracle",
        ts: Date.now(),
        kind: "model",
        text:
          `Loaded the ${d.label} model “${activeRun.modelName}” (trained via ${activeRun.algo === "fedprox" ? "FedProx" : "FedAvg"} over ` +
          `${activeRun.config.nClients} federated clients, ${activeRun.rounds.length} rounds, ` +
          `${activeRun.config.dp ? `ε=${activeRun.epsilonSpent.toFixed(1)} differential privacy` : "no DP"}). ` +
          `Describe a case in plain language, or type /help to see what I can do.`,
      },
    ]);
  }, [activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  /* ── Response generation (the "LLM") ────────────────────── */

  const sampleCase = (): string => {
    if (!meta) return "";
    return meta.features
      .slice(0, 6)
      .map((f, i) => {
        const v = medians[i] ?? (f.min + f.max) / 2;
        return `${f.label.toLowerCase()} ${+v.toFixed(f.decimals)}`;
      })
      .join(", ");
  };

  const handleCommand = (cmd: string): ChatMsg => {
    const c = cmd.toLowerCase().trim();
    if (!activeRun || !meta) return oracleMsg("No model loaded.", "error");
    const d = domainDef(domainOf(activeRun.datasetId));
    switch (c) {
      case "/help":
        return oracleMsg(
          "I'm the FedShield inference oracle. Try:\n" +
            "• Describe a case: “58yo, blood pressure 165, cholesterol 250, BMI 31”\n" +
            "• /model — details of the loaded model\n" +
            "• /features — the feature schema I understand\n" +
            "• /privacy — the differential-privacy budget behind this model\n" +
            "• /metrics — accuracy / precision / recall / F1 / AUC\n" +
            "• /sample — drop a ready-made case into the box\n" +
            "• /clear — wipe the conversation",
          "info"
        );
      case "/model":
        return oracleMsg(
          `${activeRun.modelName}\nField: ${d.label} · Dataset: ${meta.name} (${meta.nSamples.toLocaleString()} rows)\n` +
            `Strategy: ${activeRun.algo === "fedprox" ? "FedProx" : "FedAvg"} · ${activeRun.config.nClients} clients · ${activeRun.rounds.length} rounds\n` +
            `Trained ${new Date(activeRun.createdAt).toLocaleString()} · weights stored locally, no raw data included.`,
          "model"
        );
      case "/features":
        return oracleMsg(
          "I read these features (aliases work too):\n" +
            meta.features.map((f) => `• ${f.label}${f.unit ? ` (${f.unit})` : ""} — range ${f.min}–${f.max}`).join("\n"),
          "info"
        );
      case "/privacy":
        return oracleMsg(
          activeRun.config.dp
            ? `This model was trained with (ε,δ)-differential privacy.\nε spent: ${activeRun.epsilonSpent.toFixed(1)} total (${activeRun.config.epsilonPerRound}/round) · δ=${activeRun.config.delta}\nClipping norm C=${activeRun.config.clipNorm} · Gaussian noise added to every update.` +
              (activeRun.config.secureAgg ? "\nSecure aggregation masked individual client updates." : "")
            : "This run had differential privacy disabled — retrain with DP enabled for a privacy budget.",
          "info"
        );
      case "/metrics":
        return oracleMsg(
          `Holdout performance:\nAccuracy ${(activeRun.final.accuracy * 100).toFixed(2)}% · Precision ${activeRun.final.precision.toFixed(3)} · ` +
            `Recall ${activeRun.final.recall.toFixed(3)} · F1 ${activeRun.final.f1.toFixed(3)} · AUC ${activeRun.final.auc.toFixed(3)}`,
          "info"
        );
      case "/sample":
        setInput(sampleCase());
        inputRef.current?.focus();
        return oracleMsg("Here's a sample case — press send when ready.", "info");
      case "/clear":
        setTimeout(() => setMessages([]), 0);
        return oracleMsg("Conversation cleared.", "info");
      default:
        return oracleMsg(`Unknown command “${cmd}”. Type /help.`, "error");
    }
  };

  const oracleMsg = (text: string, kind: ChatMsg["kind"] = "info"): ChatMsg => ({
    id: msgId(),
    role: "oracle",
    ts: Date.now(),
    text,
    kind,
  });

  const handleCase = (text: string): ChatMsg => {
    if (!activeRun || !meta) return oracleMsg("Load a model first.", "error");
    const parsed = parseCase(text, meta, medians);
    if (parsed.found.length === 0) {
      return oracleMsg(
        `I couldn't match any features in that. I understand things like “${sampleCase()}”. Type /features to see my vocabulary.`,
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
      ? ` I imputed ${parsed.filled.length} missing feature${parsed.filled.length > 1 ? "s" : ""} (${parsed.filled
          .slice(0, 3)
          .map((x) => x.feature.label)
          .join(", ")}${parsed.filled.length > 3 ? "…" : ""}) with population medians.`
      : "";
    return {
      id: msgId(),
      role: "oracle",
      ts: Date.now(),
      kind: "prediction",
      text:
        `Based on ${parsed.found.length} of ${meta.features.length} features, the ${domainDef(activeDomain).label.toLowerCase()} model predicts ` +
        `“${result.label}” with ${(result.probability * 100).toFixed(1)}% confidence.${assumedNote}`,
      prediction: { result, input: inputMap, assumed: parsed.filled.map((x) => x.feature.key), record },
    };
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
      420 + Math.random() * 480
    );
  };

  /* ── Batch CSV inference ────────────────────────────────── */

  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{ total: number; positive: number; negative: number; rows: { index: number; label: string; probability: number }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runBatch = (file: File) => {
    if (!activeRun || !meta) {
      toast("error", "Load a model before running batch inference.");
      return;
    }
    setBatchBusy(true);
    setBatchSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result ?? ""));
        if (rows.length < 2) throw new Error("empty file");
        const { header } = analyzeColumns(rows);
        // Map each model feature to a CSV column by slugified header.
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
        toast("success", `Batch inference complete — ${out.length} rows scored.`);
      } catch {
        toast("error", "Could not parse that CSV. Ensure a header row and numeric feature columns.");
      } finally {
        setBatchBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const exportBatch = () => {
    if (!batchSummary) return;
    const blob = new Blob([predictionsToCSV(batchSummary.rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${activeRun?.modelName ?? "model"}-batch.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("success", "Batch predictions exported.");
  };

  /* ── Render ─────────────────────────────────────────────── */

  if (models.length === 0) {
    return (
      <Panel title="Prediction Console" delay={0}>
        <EmptyState
          title="No trained models to query yet"
          body="The prediction console runs on models saved by the Training Lab. Train a federated model first — its weights are stored and become instantly available here for each field."
          action={
            <Button onClick={() => setPage("lab")}>
              <IconFlask width={15} height={15} /> Open Training Lab
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="grid xl:grid-cols-[290px_1fr] gap-4 items-start">
      {/* ── Model registry (grouped by field) ── */}
      <div className="space-y-3 xl:sticky xl:top-20">
        <Panel title="Model registry" sub="Stored training results, by field" delay={0} pad={false}>
          <div className="px-4 pt-4 pb-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setDomainFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11.5px] font-mono border transition-colors",
                domainFilter === "all" ? "border-signal-500/60 bg-signal-500/10 text-signal-300" : "border-line text-fog-400 hover:text-fog-200"
              )}
            >
              All ({models.length})
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
          <div className="max-h-[420px] overflow-y-auto px-3 pb-3 space-y-2">
            {visibleModels.length === 0 && (
              <p className="text-[12px] text-fog-500 px-2 py-3">No models for this field yet — train one in the Lab.</p>
            )}
            {visibleModels.map((m) => {
              const d = domainDef(domainOf(m.datasetId));
              const active = m.id === activeRunId;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveRunId(m.id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-all",
                    active ? "border-signal-500/60 bg-signal-500/8 shadow-[0_0_0_1px_rgba(31,200,180,0.25)]" : "border-line bg-ink-900/50 hover:border-ink-500"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider" style={{ color: d.color }}>
                      {DOMAIN_ICON[d.id]({ width: 12, height: 12 })} {d.short}
                    </span>
                    <span className="font-mono text-[13px] font-semibold text-signal-300">{(m.final.accuracy * 100).toFixed(1)}%</span>
                  </div>
                  <div className="text-[13px] font-medium text-fog-100 truncate mt-1">{m.modelName}</div>
                  <div className="text-[10.5px] font-mono text-fog-500 mt-0.5">
                    {m.algo === "fedprox" ? "FedProx" : "FedAvg"} · {m.rounds.length}r · {m.config.dp ? `ε${m.epsilonSpent.toFixed(1)}` : "no DP"}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="How it works" delay={80}>
          <p className="text-[12px] text-fog-400 leading-relaxed">
            The console queries <span className="text-signal-300">stored global weights</span> from a federated run — never raw client data. Select a
            field's model, then describe a case in natural language; the parser maps your words onto that model's exact feature schema.
          </p>
        </Panel>
      </div>

      {/* ── Console column ── */}
      <div className="space-y-4 min-w-0">
        <Panel
          title={
            <span className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ background: `${dd.color}1a`, borderColor: `${dd.color}55`, color: dd.color }}>
                <IconSparkle width={17} height={17} />
              </span>
              FedShield Oracle
            </span>
          }
          sub={activeRun ? `Answering with the ${dd.label} model · ${meta?.name}` : "No model loaded"}
          delay={60}
          pad={false}
          right={
            activeRun ? (
              <div className="flex items-center gap-1.5">
                {activeRun.config.dp ? <Badge tone="ember">ε {activeRun.epsilonSpent.toFixed(1)}</Badge> : <Badge tone="fog">no DP</Badge>}
                <Badge tone="signal">{(activeRun.final.accuracy * 100).toFixed(1)}%</Badge>
              </div>
            ) : undefined
          }
        >
          {/* messages */}
          <div ref={scrollRef} className="h-[400px] overflow-y-auto px-5 py-4 space-y-4">
            {messages.map((m) => (
              <Message key={m.id} msg={m} domainColor={dd.color} meta={meta} />
            ))}
            {thinking && (
              <div className="flex items-start gap-2.5">
                <OracleAvatar color={dd.color} />
                <div className="panel px-4 py-3 flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-signal-400 animate-bounce" style={{ animationDelay: `${i * 130}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* sample chips + input */}
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
                placeholder={meta ? `Describe a ${dd.label.toLowerCase()} case… e.g. “${sampleCase()}”` : "Load a model to begin"}
                className="flex-1 resize-none bg-ink-900/80 border border-line rounded-lg px-3.5 py-2.5 text-sm text-fog-50 placeholder:text-fog-600 outline-none focus:border-signal-600"
              />
              <Button onClick={() => send()} disabled={!input.trim() || thinking} className="shrink-0 h-[46px] px-4">
                <IconSend width={16} height={16} />
              </Button>
            </div>
          </div>
        </Panel>

        {/* bottom row: log + batch */}
        <div className="grid md:grid-cols-2 gap-4">
          <Panel
            title="Prediction log"
            sub={`${predictions.length} stored prediction${predictions.length === 1 ? "" : "s"}`}
            delay={140}
            pad={false}
            right={
              predictions.length > 0 ? (
                isGuest ? (
                  <LockPill label="clear locked" />
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => { clearPredictions(); toast("info", "Prediction log cleared."); }}>
                    clear
                  </Button>
                )
              ) : undefined
            }
          >
            {predictions.length === 0 ? (
              <p className="text-[12.5px] text-fog-500 px-5 py-6 text-center">No predictions yet — ask the oracle above.</p>
            ) : (
              <div className="max-h-[260px] overflow-y-auto divide-y divide-line-soft">
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

          <Panel title="Batch inference" sub="Score a whole CSV against the loaded model" delay={200}>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && runBatch(e.target.files[0])} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" loading={batchBusy} onClick={() => fileRef.current?.click()} disabled={!activeRun}>
                <IconUpload width={14} height={14} /> Upload CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportBatch} disabled={!batchSummary || isGuest} title={isGuest ? "Create an account to export" : undefined}>
                <IconDownload width={14} height={14} /> Export results
              </Button>
              {isGuest && batchSummary && <LockPill label="export locked" />}
            </div>
            {batchSummary && (
              <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-line-soft bg-ink-900/50 py-2">
                  <div className="font-display font-bold text-[17px] text-fog-50">{batchSummary.total}</div>
                  <div className="text-[10px] font-mono uppercase text-fog-500">rows</div>
                </div>
                <div className="rounded-md border border-rose-400/30 bg-rose-500/8 py-2">
                  <div className="font-display font-bold text-[17px] text-rose-300">{batchSummary.positive}</div>
                  <div className="text-[10px] font-mono uppercase text-fog-500">{meta?.positiveLabel ?? "positive"}</div>
                </div>
                <div className="rounded-md border border-signal-500/30 bg-signal-500/8 py-2">
                  <div className="font-display font-bold text-[17px] text-signal-300">{batchSummary.negative}</div>
                  <div className="text-[10px] font-mono uppercase text-fog-500">{meta?.negativeLabel ?? "negative"}</div>
                </div>
              </div>
            )}
            <p className="text-[11px] text-fog-600 mt-3 leading-relaxed">
              Columns are matched to the model's features by header name; unmatched features fall back to population medians. Up to 2,000 rows per batch.
            </p>
          </Panel>
        </div>
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

function Message({ msg, domainColor, meta }: { msg: ChatMsg; domainColor: string; meta: ReturnType<typeof getDatasetMeta> | null }) {
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
        {isPrediction && msg.prediction && meta && (
          <PredictionCard p={msg.prediction} domainColor={domainColor} meta={meta} />
        )}
      </div>
    </div>
  );
}

function PredictionCard({
  p,
  domainColor,
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
          <div className="text-[11.5px] font-mono text-fog-400">inference on stored weights</div>
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
