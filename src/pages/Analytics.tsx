/* FedShield — Predictive analytics: single + batch inference with a trained global model */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { getDataset, getDatasetMeta } from "../lib/datasets";
import { modelToJson, predictSingle } from "../lib/flEngine";
import type { PredictionResult, RunResult } from "../lib/types";
import { consumePendingRun, onRunRequest } from "../lib/crosslink";
import { HBars } from "../components/charts";
import { Badge, Button, EmptyState, LockPill, Panel, Ring, cn } from "../components/ui";
import { IconBolt, IconChart, IconDownload, IconFlask } from "../components/icons";

export default function Analytics() {
  const { runs, setPage, toast } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";

  const [runId, setRunId] = useState<string>(() => consumePendingRun() ?? runs[0]?.id ?? "");
  useEffect(
    () =>
      onRunRequest((id) => {
        setRunId(id);
        setPred(null);
      }),
    []
  );
  useEffect(() => {
    if (!runId && runs.length > 0) setRunId(runs[0].id);
  }, [runs, runId]);

  const run: RunResult | undefined = useMemo(() => runs.find((r) => r.id === runId), [runs, runId]);
  const meta = run ? getDatasetMeta(run.datasetId) : null;
  const ds = run ? getDataset(run.datasetId) : null;

  const [values, setValues] = useState<number[]>([]);
  useEffect(() => {
    if (meta) setValues(meta.features.map((f) => (f.min + f.max) / 2));
    setPred(null);
  }, [runId, meta]);

  const [pred, setPred] = useState<PredictionResult | null>(null);

  if (!run || !meta || !ds) {
    return (
      <Panel title="Predictive analytics" delay={0}>
        <EmptyState
          title="No trained global model available"
          body="Run a federated training session first — the resulting global model becomes available here for privacy-preserving inference."
          action={
            <Button onClick={() => setPage("lab")}>
              <IconFlask width={15} height={15} /> Open Training Lab
            </Button>
          }
        />
      </Panel>
    );
  }

  const applyPreset = (q: number) => {
    setValues(meta.features.map((f) => +(f.min + (f.max - f.min) * q).toFixed(f.decimals)));
    setPred(null);
  };

  const predict = () => {
    const p = predictSingle(run, values);
    setPred(p);
    toast("success", `Prediction ready in ${p.latencyMs.toFixed(2)} ms — probability ${(p.probability * 100).toFixed(1)}%.`);
  };

  const exportPrediction = () => {
    if (!pred) return;
    const payload = {
      model: run.modelName,
      dataset: run.datasetId,
      input: Object.fromEntries(meta.features.map((f, i) => [f.key, values[i]])),
      prediction: { probability: +pred.probability.toFixed(4), label: pred.label },
      topContributions: pred.contributions,
      privacy: { differentialPrivacy: run.config.dp, epsilonSpent: run.epsilonSpent, secureAggregation: run.config.secureAgg },
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${run.modelName}-prediction.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("success", "Prediction report exported.");
  };

  // Derived confusion matrix on the holdout set
  const nTest = Math.round(meta.nSamples * 0.2);
  const P = Math.round(nTest * meta.positiveRate);
  const N = nTest - P;
  const tp = Math.round(run.final.recall * P);
  const fn = P - tp;
  const fp = run.final.precision > 0 ? Math.round(tp / run.final.precision - tp) : 0;
  const tn = Math.max(0, N - fp);

  const metrics: [string, string, string][] = [
    ["Accuracy", `${(run.final.accuracy * 100).toFixed(2)}%`, run.centralizedFinal ? `${(run.centralizedFinal.accuracy * 100).toFixed(2)}%` : "—"],
    ["Precision", run.final.precision.toFixed(3), run.centralizedFinal?.precision.toFixed(3) ?? "—"],
    ["Recall", run.final.recall.toFixed(3), run.centralizedFinal?.recall.toFixed(3) ?? "—"],
    ["F1 score", run.final.f1.toFixed(3), run.centralizedFinal?.f1.toFixed(3) ?? "—"],
    ["AUC", run.final.auc.toFixed(3), run.centralizedFinal?.auc.toFixed(3) ?? "—"],
    ["Log loss", run.final.loss.toFixed(3), run.centralizedFinal?.loss.toFixed(3) ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <Panel
        title="Inference console"
        sub="The global model predicts without ever seeing a raw training row"
        delay={0}
        right={
          <select
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            className="bg-ink-900 border border-line rounded-lg px-3 py-1.5 text-[13px] text-fog-200 font-mono outline-none focus:border-signal-600 max-w-[240px]"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.modelName} · {(r.final.accuracy * 100).toFixed(1)}%
              </option>
            ))}
          </select>
        }
      >
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge tone="signal">{run.algo === "fedprox" ? "FedProx" : "FedAvg"}</Badge>
          <Badge tone="sky">{meta.sector}</Badge>
          <Badge tone={run.config.dp ? "ember" : "fog"}>{run.config.dp ? `ε ${run.epsilonSpent.toFixed(1)} spent` : "no DP"}</Badge>
          <Badge tone="fog">{run.config.nClients} clients</Badge>
          <Badge tone="fog">{run.rounds.length} rounds</Badge>
          {isGuest && <LockPill label="exports locked for guests" />}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* feature form */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-fog-500">Feature vector (raw units)</span>
              <div className="flex gap-1">
                {[
                  { q: 0.25, l: "p25" },
                  { q: 0.5, l: "median" },
                  { q: 0.78, l: "p78" },
                ].map((p) => (
                  <button key={p.l} onClick={() => applyPreset(p.q)} className="px-2 py-1 rounded-md border border-line text-[11px] font-mono text-fog-400 hover:text-signal-300 hover:border-signal-700 transition-colors">
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3 max-h-[380px] overflow-y-auto pr-2">
              {meta.features.map((f, i) => (
                <div key={f.key}>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="text-[12px] text-fog-400">
                      {f.label} {f.unit && <span className="text-fog-600 text-[10px]">({f.unit})</span>}
                    </label>
                    <input
                      type="number"
                      value={values[i] ?? 0}
                      step={Math.pow(10, -f.decimals)}
                      min={f.min}
                      max={f.max}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) setValues((prev) => prev.map((p, j) => (j === i ? Math.min(f.max, Math.max(f.min, v)) : p)));
                      }}
                      className="w-[76px] bg-ink-900 border border-line rounded-md px-2 py-0.5 text-right font-mono text-[12px] text-signal-300 outline-none focus:border-signal-600"
                    />
                  </div>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={Math.pow(10, -f.decimals)}
                    value={values[i] ?? f.min}
                    onChange={(e) => setValues((prev) => prev.map((p, j) => (j === i ? parseFloat(e.target.value) : p)))}
                    className="w-full accent-signal-500 h-1.5 cursor-pointer"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={predict} disabled={values.length === 0}>
                <IconBolt width={15} height={15} /> Generate prediction
              </Button>
              <Button variant="outline" onClick={exportPrediction} disabled={isGuest || !pred} title={isGuest ? "Create an account to export" : undefined}>
                <IconDownload width={15} height={15} /> Export report
              </Button>
            </div>
          </div>

          {/* result */}
          <div className="rounded-lg border border-line-soft bg-ink-900/50 p-5 flex flex-col">
            {!pred ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                <span className="w-14 h-14 rounded-2xl border border-dashed border-line flex items-center justify-center text-fog-600 mb-4">
                  <IconChart width={24} height={24} />
                </span>
                <p className="text-[13.5px] text-fog-400 font-medium">No prediction yet</p>
                <p className="text-[12px] text-fog-600 mt-1 max-w-[260px]">
                  Set the feature vector and run inference against the {meta.positiveLabel.toLowerCase()}/{meta.negativeLabel.toLowerCase()} model.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-6">
                  <Ring value={pred.probability} max={1} size={116} stroke={10} color={pred.probability >= 0.5 ? "#e8798f" : "#1fc8b4"}>
                    <span className="font-display font-bold text-[22px] text-fog-50">{(pred.probability * 100).toFixed(1)}%</span>
                    <span className="text-[9px] font-mono text-fog-500 uppercase">p({meta.positiveLabel.toLowerCase()})</span>
                  </Ring>
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-1.5">Classification</div>
                    <span className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[15px] font-display font-semibold", pred.probability >= 0.5 ? "border-rose-400/50 bg-rose-500/10 text-rose-300" : "border-signal-500/50 bg-signal-500/10 text-signal-300")}>
                      {pred.label}
                    </span>
                    <div className="text-[11.5px] font-mono text-fog-500 mt-2.5">
                      latency {pred.latencyMs.toFixed(2)} ms · in-browser
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2.5">Top feature contributions (wⱼ·xⱼ)</div>
                  <HBars
                    items={pred.contributions.map((c) => ({
                      label: c.feature,
                      value: c.impact,
                      color: c.impact >= 0 ? "#e8798f" : "#1fc8b4",
                    }))}
                    fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)}
                    max={Math.max(...pred.contributions.map((c) => Math.abs(c.impact)), 0.1)}
                  />
                  <p className="text-[11px] text-fog-600 mt-2.5 font-mono">
                    <span className="text-rose-300">+</span> pushes toward {meta.positiveLabel} · <span className="text-signal-300">−</span> pushes toward {meta.negativeLabel}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* holdout metrics */}
        <Panel className="lg:col-span-3" title="Model performance on the server holdout set" sub={`${meta.name} · stratified 20% test split · ${nTest.toLocaleString()} rows`} delay={100} pad={false}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-fog-500 border-b border-line">
                <th className="px-5 py-2.5 font-medium">Metric</th>
                <th className="px-3 py-2.5 font-medium text-signal-300">Federated</th>
                <th className="px-5 py-2.5 font-medium text-sky-300">Centralized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {metrics.map(([k, f, c]) => (
                <tr key={k} className="hover:bg-ink-800/30 transition-colors">
                  <td className="px-5 py-2 text-fog-400">{k}</td>
                  <td className="px-3 py-2 font-mono text-fog-100">{f}</td>
                  <td className="px-5 py-2 font-mono text-fog-300">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* confusion matrix */}
        <Panel className="lg:col-span-2" title="Confusion matrix (derived)" sub="Holdout predictions at threshold 0.5" delay={170}>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 items-center max-w-[360px] mx-auto">
            <div />
            <div className="text-center text-[10.5px] font-mono uppercase text-fog-500 pb-1">pred +</div>
            <div className="text-center text-[10.5px] font-mono uppercase text-fog-500 pb-1">pred −</div>
            <div className="text-[10.5px] font-mono uppercase text-fog-500 text-right pr-2">actual +</div>
            <div className="rounded-lg bg-signal-500/12 border border-signal-500/35 py-4 text-center">
              <div className="font-display font-bold text-[20px] text-signal-300">{tp}</div>
              <div className="text-[10px] font-mono text-fog-500">TP</div>
            </div>
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 py-4 text-center">
              <div className="font-display font-bold text-[20px] text-rose-300">{fn}</div>
              <div className="text-[10px] font-mono text-fog-500">FN</div>
            </div>
            <div className="text-[10.5px] font-mono uppercase text-fog-500 text-right pr-2">actual −</div>
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 py-4 text-center">
              <div className="font-display font-bold text-[20px] text-rose-300">{fp}</div>
              <div className="text-[10px] font-mono text-fog-500">FP</div>
            </div>
            <div className="rounded-lg bg-signal-500/12 border border-signal-500/35 py-4 text-center">
              <div className="font-display font-bold text-[20px] text-signal-300">{tn}</div>
              <div className="text-[10px] font-mono text-fog-500">TN</div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => {
              const blob = new Blob([modelToJson(run)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${run.modelName}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
              toast("success", "Global model artifact exported (weights only — no data).");
            }} disabled={isGuest} title={isGuest ? "Create an account to export models" : undefined}>
              <IconDownload width={13} height={13} /> Model artifact
            </Button>
            {isGuest && <span className="self-center"><LockPill /></span>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
