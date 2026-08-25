/* FedShield — Federated Learning simulation lab */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { getDataset, isCustom, listDatasets, partitionDataset, trainTestSplit } from "../lib/datasets";
import { defaultConfig, trainFederated } from "../lib/flEngine";
import type { CancelToken } from "../lib/flEngine";
import type { LogLine, Phase, RoundRecord, RunResult, TrainingConfig } from "../lib/types";
import { LineChart } from "../components/charts";
import { Topology } from "../components/viz";
import { onLabRequest } from "../lib/crosslink";
import { Badge, Button, Panel, ProgressBar, Segmented, SliderRow, Toggle, cn } from "../components/ui";
import { IconPlay, IconRefresh, IconStop, IconLock, IconQrCode } from "../components/icons";
import QrCodeModal from "../components/QrCodeModal";

const SPEEDS = [
  { value: "1400", label: "Slow" },
  { value: "850", label: "Normal" },
  { value: "350", label: "Fast" },
  { value: "40", label: "Instant" },
];

export default function TrainingLab() {
  const { runs, addRun, toast, disabledClients, setPage, customCount } = useApp();
  const { user } = useAuth();
  const allDatasets = useMemo(() => listDatasets(user?.email), [customCount, user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const [config, setConfig] = useState<TrainingConfig>(() => defaultConfig("cardio"));
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [live, setLive] = useState<RoundRecord[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<RunResult | null>(() => runs[0] ?? null);
  const [qrRun, setQrRun] = useState<RunResult | null>(null);
  const cancelRef = useRef<CancelToken | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Restore latest training result from history when user logs in/opens page
  useEffect(() => {
    if (!result && runs.length > 0) {
      setResult(runs[0]);
    }
  }, [runs, result]);

  const set = <K extends keyof TrainingConfig>(k: K, v: TrainingConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  const topo = useMemo(() => {
    const ds = getDataset(config.datasetId);
    const [trainIdx] = trainTestSplit(ds);
    const disabled = new Set(disabledClients[config.datasetId] ?? []);
    const { clients } = partitionDataset(ds, config.nClients, config.alpha, trainIdx, disabled);
    return clients;
  }, [config.datasetId, config.nClients, config.alpha, disabledClients]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // dataset chosen on the Datasets page lands here
  useEffect(
    () =>
      onLabRequest((datasetId) => {
        setConfig((c) => ({ ...c, datasetId }));
      }),
    []
  );

  const enabledCount = topo.filter((c) => c.enabled).length;

  const start = async () => {
    if (enabledCount < 2) {
      toast("error", "At least two clients must be enabled — re-enable clients on the Clients page.");
      return;
    }
    setResult(null);
    setLive([]);
    setLogs([]);
    setRound(0);
    setRunning(true);
    const token: CancelToken = { cancelled: false };
    cancelRef.current = token;
    try {
      const res = await trainFederated(
        { ...config, disabledClients: disabledClients[config.datasetId] ?? [] },
        (e) => {
          if (e.type === "phase") {
            setPhase(e.phase);
            setRound(e.round);
          } else if (e.type === "round") {
            setLive((prev) => [...prev, e.record]);
          } else if (e.type === "log") {
            setLogs((prev) => [...prev.slice(-160), e.line]);
          }
        },
        token
      );
      const stored = { ...res, byGuest: user?.role === "guest" };
      addRun(stored);
      setResult(stored);
      toast("success", `Federation converged — global accuracy ${(res.final.accuracy * 100).toFixed(1)}%.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Training failed.";
      if (msg === "cancelled") toast("warn", "Training stopped — partial run discarded.");
      else toast("error", msg);
      setPhase("idle");
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    if (cancelRef.current) cancelRef.current.cancelled = true;
  };

  const reset = () => {
    setResult(null);
    setLive([]);
    setLogs([]);
    setRound(0);
    setPhase("idle");
  };

  const activeRounds = result ? result.rounds : live;
  const last = activeRounds[activeRounds.length - 1];
  const progress = config.rounds > 0 ? (running ? live.length / config.rounds : result ? 1 : 0) : 0;

  return (
    <div className="grid lg:grid-cols-[330px_1fr] gap-4 items-start">
      {/* ── Configuration ── */}
      <Panel title="Federation configuration" sub="All knobs map to real engine parameters" delay={0} className="lg:sticky lg:top-20">
        <div className="space-y-5">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">Dataset</div>
            <div className="space-y-1.5">
              {allDatasets.map((d) => (
                <button
                  key={d.id}
                  onClick={() => set("datasetId", d.id)}
                  disabled={running}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                    config.datasetId === d.id
                      ? "border-signal-500/60 bg-signal-500/8"
                      : "border-line bg-ink-900/50 hover:border-ink-500"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-fog-100">{d.name}</span>
                    <span className="flex items-center gap-1">
                      {isCustom(d.id) && <Badge tone="ember">uploaded</Badge>}
                      <Badge tone={config.datasetId === d.id ? "signal" : "fog"}>{d.sector}</Badge>
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-fog-500 mt-0.5">
                    {d.nSamples.toLocaleString()} rows · {d.features.length} features
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">Algorithm Strategy</div>
            <div className="space-y-1.5">
              {[
                { id: "central", name: "Central Training", color: "bg-fog-400", sub: "Baseline pooled dataset model" },
                { id: "fedavg", name: "FedAvg", color: "bg-signal-400", sub: "Standard Federated Averaging" },
                { id: "fedprox", name: "FedProx", color: "bg-sky-400", sub: "Proximal μ-term for Non-IID skew" },
                { id: "scaffold", name: "SCAFFOLD", color: "bg-amber-400", sub: "Control variate client drift correction" },
                { id: "dpsgd", name: "FL + DP-SGD", color: "bg-rose-400", sub: "Per-sample clipping C & Gaussian noise σ" },
              ].map((a) => (
                <button
                  key={a.id}
                  onClick={() => set("algo", a.id as any)}
                  disabled={running}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center justify-between",
                    config.algo === a.id
                      ? "border-signal-500/60 bg-signal-500/10 text-fog-50"
                      : "border-line bg-ink-900/50 hover:border-ink-500 text-fog-400"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full", a.color)} />
                    <div>
                      <div className="text-[12.5px] font-medium leading-none">{a.name}</div>
                      <div className="text-[10px] font-mono text-fog-500 mt-1">{a.sub}</div>
                    </div>
                  </div>
                  {config.algo === a.id && <span className="text-signal-400 text-xs font-mono">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <SliderRow
              label="Communication rounds"
              value={config.rounds}
              min={3}
              max={25}
              onChange={(v) => set("rounds", v)}
              fmt={(v) => `${v} rounds`}
              sub="Weight sync intervals"
            />

            <SliderRow
              label="Number of clients"
              value={config.nClients}
              min={3}
              max={8}
              onChange={(v) => set("nClients", v)}
              fmt={(v) => `${v} sites`}
              sub="Hospital / bank nodes"
            />

            <SliderRow
              label="Client participation rate"
              value={config.participation}
              min={0.4}
              max={1.0}
              step={0.1}
              onChange={(v) => set("participation", v)}
              fmt={(v) => `${Math.round(v * 100)}%`}
              sub="Active per round"
            />

            <SliderRow
              label="Local training epochs"
              value={config.localEpochs}
              min={1}
              max={5}
              onChange={(v) => set("localEpochs", v)}
              fmt={(v) => `${v} epochs`}
              sub="Computation per node"
            />

            <SliderRow
              label="Dirichlet non-IID (α)"
              value={config.alpha}
              min={0.1}
              max={5.0}
              step={0.1}
              onChange={(v) => set("alpha", v)}
              fmt={(v) => (v < 0.3 ? `${v.toFixed(1)} (high)` : v > 2 ? `${v.toFixed(1)} (IID)` : `${v.toFixed(1)}`)}
              sub="Label skew distribution"
            />

            {config.algo === "fedprox" && (
              <SliderRow
                label="Proximal term (μ)"
                value={config.mu}
                min={0.01}
                max={0.5}
                step={0.01}
                onChange={(v) => set("mu", v)}
                fmt={(v) => v.toFixed(2)}
                sub="Constrains local drift"
              />
            )}
          </div>

          <div className="pt-3 border-t border-line-soft space-y-3">
            <Toggle
              checked={config.dp}
              onChange={(v) => set("dp", v)}
              label="Differential Privacy (DP-SGD)"
              sub="Injects Gaussian noise into clipped gradients"
            />

            {config.dp && (
              <div className="space-y-3 pl-2 border-l-2 border-signal-500/40">
                <SliderRow
                  label="ε per round"
                  value={config.epsilonPerRound}
                  min={0.2}
                  max={4.0}
                  step={0.1}
                  onChange={(v) => set("epsilonPerRound", v)}
                  fmt={(v) => `ε = ${v.toFixed(1)}`}
                  sub="Target privacy budget"
                />
                <SliderRow
                  label="Gradient clip norm (C)"
                  value={config.clipNorm}
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  onChange={(v) => set("clipNorm", v)}
                  fmt={(v) => `C = ${v.toFixed(1)}`}
                  sub="Sensitivity bound"
                />
              </div>
            )}

            <Toggle
              checked={config.secureAgg}
              onChange={(v) => set("secureAgg", v)}
              label="Secure Aggregation"
              sub="Additive masking — server sees sum, never individual updates"
            />

            <div className="pt-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-1.5">Simulation speed</div>
              <Segmented
                options={SPEEDS}
                value={String(config.speedMs)}
                onChange={(v) => set("speedMs", Number(v))}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-line-soft space-y-2">
            {!running ? (
              <Button size="lg" className="w-full justify-center" onClick={start}>
                <IconPlay width={17} height={17} /> Start Training Run
              </Button>
            ) : (
              <Button size="lg" variant="danger" className="w-full justify-center" onClick={stop}>
                <IconStop width={17} height={17} /> Stop Simulation
              </Button>
            )}

            {result && !running && (
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={reset}>
                <IconRefresh width={14} height={14} /> Clear & Configure New Run
              </Button>
            )}

            <p className="text-[11px] font-mono text-fog-500 text-center leading-snug">
              {enabledCount}/{config.nClients} clients enabled · {enabledCount < 2 && <span className="text-rose-400">need ≥2 · </span>}
              est. budget ε ≈ {(config.dp ? config.epsilonPerRound * config.rounds : 0).toFixed(1)}
            </p>
          </div>
        </div>
      </Panel>

      {/* ── Live view ── */}
      <div className="space-y-4 min-w-0">
        <Panel
          title="Live federation"
          sub="Watch each round: broadcast → local training → masking → aggregation → evaluation"
          delay={80}
          right={
            running ? (
              <Badge tone="ember">
                <span className="w-1.5 h-1.5 rounded-full bg-ember-400 animate-pulse" /> training
              </Badge>
            ) : result ? (
              <Badge tone="lime">converged</Badge>
            ) : (
              <Badge tone="fog">idle</Badge>
            )
          }
        >
          <Topology
            clients={topo.map((c) => ({ id: c.id, name: c.name, enabled: c.enabled, nSamples: c.nSamples }))}
            phase={phase}
            round={round}
            secureAgg={config.secureAgg}
            height={380}
          />
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar value={progress} tone={running ? "ember" : "signal"} className="flex-1" />
            <span className="font-mono text-[12px] text-fog-400 shrink-0">
              round {activeRounds.length}/{config.rounds}
            </span>
          </div>
        </Panel>

        <div className="grid sm:grid-cols-4 gap-3">
          {[
            { label: "Accuracy", val: last ? `${(last.fed.accuracy * 100).toFixed(1)}%` : "—" },
            { label: "F1 score", val: last ? last.fed.f1.toFixed(3) : "—" },
            { label: "Test loss", val: last ? last.fed.loss.toFixed(3) : "—" },
            { label: "ε consumed", val: config.dp ? `${(last?.epsilonCum ?? 0).toFixed(1)}` : "n/a" },
          ].map((m, i) => (
            <div key={m.label} className="panel px-4 py-3 reveal" style={{ ["--d" as string]: `${120 + i * 50}ms` }}>
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500">{m.label}</div>
              <div className="font-display text-[20px] font-bold text-fog-50 mt-0.5">{m.val}</div>
            </div>
          ))}
        </div>

        <Panel title="Convergence" sub="Federated global model vs centralized baseline on the server holdout set" delay={200}>
          <LineChart
            xs={activeRounds.map((r) => r.round)}
            series={[
              { name: "Federated acc", color: "#1fc8b4", ys: activeRounds.map((r) => r.fed.accuracy * 100), area: true },
              { name: "Centralized acc", color: "#58b7f0", ys: activeRounds.map((r) => (r.centralized ? r.centralized.accuracy * 100 : 0)), dash: true },
              { name: "Federated F1 ×100", color: "#f0b454", ys: activeRounds.map((r) => r.fed.f1 * 100), dash: true },
            ]}
            yFmt={(v) => `${v.toFixed(0)}`}
            xFmt={(v) => `R${v}`}
            height={230}
          />
        </Panel>

        <Panel
          title="Engine console"
          sub="Audit trail of every federated operation — zero raw-data events by construction"
          delay={260}
          pad={false}
          right={<span className="font-mono text-[11px] text-fog-600">{logs.length} events</span>}
        >
          <div ref={consoleRef} className="h-56 overflow-y-auto px-5 py-3 font-mono text-[12px] leading-[1.7]">
            {logs.length === 0 && (
              <span className="text-fog-600">
                <span className="text-signal-400 tick-blink">▍</span> waiting for the federation to start…
              </span>
            )}
            {logs.map((l, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-fog-600 shrink-0">{new Date(l.t).toLocaleTimeString([], { hour12: false })}</span>
                <span
                  className={cn(
                    l.level === "ok" && "text-signal-300",
                    l.level === "info" && "text-fog-400",
                    l.level === "warn" && "text-ember-300",
                    l.level === "priv" && "text-rose-300"
                  )}
                >
                  {l.level === "priv" && <IconLock width={11} height={11} className="inline mr-1 -mt-0.5" />}
                  {l.msg}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {result && (
          <Panel
            title="Run summary"
            sub={`${result.modelName} · ${(result.durationMs / 1000).toFixed(1)}s · stored in persistent memory`}
            delay={0}
            right={<Badge tone="lime">completed</Badge>}
            className="border-signal-500/30"
          >
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-signal-400 mb-2">Federated (privacy-preserving)</div>
                {[
                  ["Accuracy", `${(result.final.accuracy * 100).toFixed(2)}%`],
                  ["Precision", result.final.precision.toFixed(3)],
                  ["Recall", result.final.recall.toFixed(3)],
                  ["F1 score", result.final.f1.toFixed(3)],
                  ["AUC", result.final.auc.toFixed(3)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-line-soft text-[13px]">
                    <span className="text-fog-400">{k}</span>
                    <span className="font-mono text-fog-100">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400 mb-2">Centralized baseline (pooled data)</div>
                {result.centralizedFinal ? (
                  <>
                    {[
                      ["Accuracy", `${(result.centralizedFinal.accuracy * 100).toFixed(2)}%`],
                      ["Precision", result.centralizedFinal.precision.toFixed(3)],
                      ["Recall", result.centralizedFinal.recall.toFixed(3)],
                      ["F1 score", result.centralizedFinal.f1.toFixed(3)],
                      ["AUC", result.centralizedFinal.auc.toFixed(3)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1 border-b border-line-soft text-[13px]">
                        <span className="text-fog-400">{k}</span>
                        <span className="font-mono text-fog-100">{v}</span>
                      </div>
                    ))}
                    <p className="text-[11.5px] text-fog-500 mt-2.5 leading-relaxed">
                      Accuracy gap: <span className="font-mono text-fog-200">{((result.centralizedFinal.accuracy - result.final.accuracy) * 100).toFixed(2)} pts</span> — the
                      price of never centralizing {getDataset(result.datasetId).meta.nSamples.toLocaleString()} private rows.
                    </p>
                  </>
                ) : (
                  <span className="text-fog-500 text-[13px]">baseline unavailable</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" onClick={() => setPage("analytics")}>Generate predictions →</Button>
              <Button size="sm" variant="outline" onClick={() => setPage("privacy")}>Privacy report</Button>
              <Button size="sm" variant="outline" onClick={() => setQrRun(result)} className="border-signal-500/50 text-signal-300">
                <IconQrCode width={14} height={14} /> Generate QR Code
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>Train again</Button>
            </div>
          </Panel>
        )}
      </div>

      {/* QR Code Certificate Modal */}
      <QrCodeModal run={qrRun} open={qrRun !== null} onClose={() => setQrRun(null)} />
    </div>
  );
}
