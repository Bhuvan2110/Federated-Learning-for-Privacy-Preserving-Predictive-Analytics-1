/* FedShield — Operations overview dashboard */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { getDataset, getDatasetMeta, partitionDataset, trainTestSplit } from "../lib/datasets";
import { PRIVACY_BUDGET } from "../lib/flEngine";
import type { RunResult } from "../lib/types";
import { LineChart, Sparkline } from "../components/charts";
import { Pipeline, Topology } from "../components/viz";
import { Badge, Button, KV, Panel, Ring, useTicker } from "../components/ui";
import { IconArrowRight, IconBolt, IconFlask, IconQrCode, IconShield } from "../components/icons";
import QrCodeModal from "../components/QrCodeModal";

function ago(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Overview() {
  const { runs, seeding, setPage } = useApp();
  const { user } = useAuth();
  const latest = runs[0] ?? null;
  const [qrRun, setQrRun] = useState<RunResult | null>(null);

  const topo = useMemo(() => {
    if (!latest) return null;
    const ds = getDataset(latest.datasetId);
    const [trainIdx] = trainTestSplit(ds);
    const { clients } = partitionDataset(ds, latest.config.nClients, latest.config.alpha, trainIdx, new Set());
    return clients;
  }, [latest]);

  const accSeries = useMemo(
    () => (latest ? latest.rounds.map((r) => r.fed.accuracy * 100) : []),
    [latest]
  );
  const accTick = useTicker(latest ? latest.final.accuracy * 100 : 0);

  if (!latest) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel h-[122px] animate-pulse" />
          ))}
        </div>
        <div className="panel p-10 text-center">
          {seeding ? (
            <>
              <div className="font-display font-semibold text-fog-200">Seeding the federation…</div>
              <p className="text-[13px] text-fog-500 mt-1 font-mono">
                running two silent federated trainings so the console is live on first load
              </p>
              <div className="mt-4 mx-auto w-40 h-1.5 rounded-full bg-ink-700 overflow-hidden">
                <div className="h-full w-1/2 bg-signal-500 animate-pulse" />
              </div>
            </>
          ) : (
            <>
              <div className="font-display font-semibold text-fog-200">No training runs yet</div>
              <p className="text-[13px] text-fog-500 mt-1">Launch the training lab to train your first privacy-preserving global model.</p>
              <Button className="mt-4" onClick={() => setPage("lab")}>
                <IconFlask width={15} height={15} /> Open Training Lab
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const meta = getDatasetMeta(latest.datasetId);
  const epsUsed = latest.epsilonSpent;
  const delta = accSeries.length > 1 ? accSeries[accSeries.length - 1] - accSeries[0] : 0;
  const sigma = latest.config.dp ? (2 * latest.config.clipNorm * Math.sqrt(2 * Math.log(1.25 / latest.config.delta))) / (Math.max(latest.config.epsilonPerRound, 0.01) * Math.max(2, Math.round(latest.config.participation * latest.config.nClients))) : 0;

  return (
    <div className="space-y-4">
      {/* stat row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="panel p-4 reveal flex flex-col justify-between min-h-[122px]" style={{ ["--d" as string]: "0ms" }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-fog-500">Global model accuracy</span>
            <IconBolt width={15} height={15} className="text-signal-400" />
          </div>
          <div className="font-display text-[30px] font-bold text-fog-50 leading-none mt-2">
            {accTick.toFixed(1)}<span className="text-[16px] text-fog-500">%</span>
          </div>
          <div className="flex items-end justify-between mt-2">
            <span className={`text-[11px] font-mono ${delta >= 0 ? "text-signal-400" : "text-rose-400"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} pts since round 1
            </span>
            <Sparkline values={accSeries} width={84} height={26} />
          </div>
        </div>

        <div className="panel p-4 reveal flex items-center gap-4 min-h-[122px]" style={{ ["--d" as string]: "70ms" }}>
          <Ring value={epsUsed} max={PRIVACY_BUDGET} size={86} stroke={8} color={epsUsed / PRIVACY_BUDGET > 0.75 ? "#f0b454" : "#1fc8b4"}>
            <span className="font-display font-bold text-[17px] text-fog-50">{epsUsed.toFixed(0)}</span>
            <span className="text-[9px] font-mono text-fog-500">/ {PRIVACY_BUDGET} ε</span>
          </Ring>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500">Privacy budget</div>
            <div className="text-[13px] text-fog-300 mt-1 leading-snug">
              {latest.config.dp ? `(ε,δ)-DP active · ${latest.config.epsilonPerRound} ε/round` : "DP disabled"}
            </div>
            <Badge tone={latest.config.dp ? "signal" : "fog"} className="mt-1.5">
              {latest.config.dp ? "protected" : "no noise"}
            </Badge>
          </div>
        </div>

        <div className="panel p-4 reveal flex flex-col justify-between min-h-[122px]" style={{ ["--d" as string]: "140ms" }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-fog-500">Federated clients</span>
            <Badge tone="sky">{latest.algo === "fedprox" ? "FedProx" : "FedAvg"}</Badge>
          </div>
          <div className="font-display text-[30px] font-bold text-fog-50 leading-none mt-2">
            {latest.config.nClients}
            <span className="text-[15px] text-fog-500 font-body font-normal ml-2">
              {Math.round(latest.config.participation * 100)}% participate
            </span>
          </div>
          <div className="text-[11px] font-mono text-fog-500 mt-2">
            non-IID α={latest.config.alpha} · {meta.name}
          </div>
        </div>

        <div className="panel p-4 reveal flex flex-col justify-between min-h-[122px]" style={{ ["--d" as string]: "210ms" }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-fog-500">Training rounds</span>
            <Badge tone={latest.status === "completed" ? "lime" : "ember"}>{latest.status}</Badge>
          </div>
          <div className="font-display text-[30px] font-bold text-fog-50 leading-none mt-2">
            {latest.rounds.length}
            <span className="text-[15px] text-fog-500 font-body font-normal ml-2">× {latest.config.localEpochs} epochs</span>
          </div>
          <div className="text-[11px] font-mono text-fog-500 mt-2">
            {(latest.durationMs / 1000).toFixed(1)}s wall · {ago(latest.createdAt)}
          </div>
        </div>
      </div>

      {/* charts row */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Panel
          className="lg:col-span-3"
          title="Convergence — federated vs centralized"
          sub={`${meta.name} · holdout test set (${meta.positiveRate > 0 ? "stratified 80/20" : ""}) · raw data never leaves clients`}
          delay={260}
          right={
            <Button size="sm" variant="outline" onClick={() => setQrRun(latest)} className="border-signal-500/40 text-signal-300">
              <IconQrCode width={14} height={14} /> Result QR Code
            </Button>
          }
        >
          <LineChart
            xs={latest.rounds.map((r) => r.round)}
            series={[
              { name: "Federated (private)", color: "#1fc8b4", ys: latest.rounds.map((r) => r.fed.accuracy * 100), area: true },
              { name: "Centralized (pooled, reference)", color: "#58b7f0", ys: latest.rounds.map((r) => (r.centralized ? r.centralized.accuracy * 100 : 0)), dash: true },
            ]}
            yFmt={(v) => `${v.toFixed(0)}%`}
            xFmt={(v) => `R${v}`}
            height={250}
          />
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Federation topology"
          sub="Only masked weight deltas traverse these links"
          delay={320}
        >
          {topo && (
            <Topology
              clients={topo.map((c) => ({ id: c.id, name: c.name, enabled: c.enabled, nSamples: c.nSamples }))}
              phase="idle"
              round={latest.rounds.length}
              secureAgg={latest.config.secureAgg}
              height={288}
            />
          )}
        </Panel>
      </div>

      {/* pipeline */}
      <Panel
        title="Federated learning workflow"
        sub="End-to-end pipeline executed by the FedShield engine each session"
        delay={380}
        right={<Badge tone="fog">last run: complete</Badge>}
      >
        <Pipeline active={8} />
      </Panel>

      {/* bottom row */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-3" title="Recent training runs" sub="Stored locally — exports available to authenticated users" delay={440} pad={false}
          right={
            <Button size="sm" variant="ghost" onClick={() => setPage("history")}>
              view all <IconArrowRight width={13} height={13} />
            </Button>
          }
        >
          <div className="divide-y divide-line-soft">
            {runs.slice(0, 4).map((r, i) => {
              const m = getDatasetMeta(r.datasetId);
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-800/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-ink-700/60 text-signal-400 flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-fog-100 font-medium truncate">{r.modelName}</div>
                    <div className="text-[11px] font-mono text-fog-500">
                      {m.name} · {r.algo} · {r.rounds.length} rounds · ε {r.epsilonSpent.toFixed(1)}
                    </div>
                  </div>
                  <button
                    title="Generate QR Code"
                    onClick={() => setQrRun(r)}
                    className="p-1.5 rounded-lg border border-line text-fog-400 hover:text-signal-300 hover:border-signal-500 transition-colors"
                  >
                    <IconQrCode width={14} height={14} />
                  </button>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[14px] text-signal-300">{(r.final.accuracy * 100).toFixed(1)}%</div>
                    <div className="text-[10.5px] font-mono text-fog-600">{ago(r.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="lg:col-span-2" title="Privacy posture" sub={`Signed in as ${user?.name ?? "guest"} · ${user?.role === "guest" ? "guest scope" : "full scope"}`} delay={500}>
          <KV k="Differential privacy" v={latest.config.dp ? `Gaussian · ε=${latest.config.epsilonPerRound}/rd` : "off"} />
          <KV k="Secure aggregation" v={latest.config.secureAgg ? "pairwise masks" : "off"} />
          <KV k="Update clipping" v={`C = ${latest.config.clipNorm.toFixed(1)}`} />
          <KV k="Noise scale σ" v={latest.config.dp ? sigma.toFixed(3) : "—"} />
          <KV k="Cumulative ε spent" v={`${epsUsed.toFixed(1)} / ${PRIVACY_BUDGET}`} />
          <KV k="Raw rows transmitted" v={<span className="text-signal-300">0 (by design)</span>} />
          <div className="mt-3.5 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setPage("privacy")}>
              <IconShield width={14} height={14} /> Privacy report
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setPage("lab")}>
              <IconFlask width={14} height={14} /> New run
            </Button>
          </div>
        </Panel>
      </div>

      {/* QR Code Modal */}
      <QrCodeModal run={qrRun} open={qrRun !== null} onClose={() => setQrRun(null)} />
    </div>
  );
}
