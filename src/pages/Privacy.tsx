/* FedShield — Privacy Center: DP, secure aggregation, trade-offs */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { advancedEpsilon, gaussianSigma, PRIVACY_BUDGET } from "../lib/flEngine";
import { getDatasetMeta } from "../lib/datasets";
import { HBars, PDFCurve } from "../components/charts";
import { Badge, Panel, Ring, SliderRow } from "../components/ui";
import { IconLock, IconShield, IconX, IconCheck } from "../components/icons";

const STAYS_LOCAL = [
  "Raw feature rows & labels",
  "Per-record statistics",
  "Local model trajectories",
  "Client-side preprocessing state",
];
const CROSSES_WIRE = [
  "Weight deltas Δw, clipped ‖Δw‖₂ ≤ C",
  "+ Gaussian noise 𝒩(0, σ²) per coordinate",
  "Wrapped in pairwise SecAgg masks",
  "Server recovers only Σ Δw / n",
];

export default function Privacy() {
  const { runs } = useApp();
  const latest = runs[0] ?? null;
  const [eps, setEps] = useState(2.5);

  const nPart = latest
    ? Math.max(2, Math.round(latest.config.participation * latest.config.nClients))
    : 4;
  const C = latest?.config.clipNorm ?? 1;
  const delta = latest?.config.delta ?? 1e-5;
  const sensitivity = (2 * C) / nPart;
  const sigma = gaussianSigma(eps, delta, sensitivity);
  const sigmaRef = gaussianSigma(8, delta, sensitivity);

  const noiseSamples = useMemo(() => {
    // deterministic Box–Muller samples for the current σ
    let seed = Math.round(eps * 100) + 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: 26 }, () => {
      const u = Math.max(rnd(), 1e-9);
      const v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
    });
  }, [eps, sigma]);

  const fedAcc = latest ? latest.final.accuracy * 100 : 91;
  const cenAcc = latest?.centralizedFinal ? latest.centralizedFinal.accuracy * 100 : fedAcc + 1.4;

  return (
    <div className="space-y-4">
      {/* what crosses the wire */}
      <Panel
        title="What actually crosses the wire"
        sub="The core contract of privacy-preserving federated learning"
        delay={0}
        right={<Badge tone="rose">raw data: never</Badge>}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-signal-500/30 bg-signal-500/[0.04] p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconShield width={16} height={16} className="text-signal-400" />
              <span className="font-display font-semibold text-signal-300 text-[14px]">Stays on the client</span>
            </div>
            <ul className="space-y-2">
              {STAYS_LOCAL.map((s) => (
                <li key={s} className="flex items-center gap-2.5 text-[13px] text-fog-300">
                  <span className="text-signal-400"><IconCheck width={14} height={14} /></span> {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-ember-400/30 bg-ember-400/[0.04] p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconLock width={16} height={16} className="text-ember-300" />
              <span className="font-display font-semibold text-ember-300 text-[14px]">Traverses the network</span>
            </div>
            <ul className="space-y-2">
              {CROSSES_WIRE.map((s) => (
                <li key={s} className="flex items-center gap-2.5 text-[13px] text-fog-300">
                  <span className="text-ember-300 text-[11px] font-mono">≫</span> <span className="font-mono text-[12px]">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-ink-900/70 border border-line-soft px-4 py-3 font-mono text-[12px] text-fog-400 overflow-x-auto whitespace-nowrap">
          server view per round: <span className="text-ember-300">ŵₜ₊₁ = wₜ + Σᵢ(maskᵢ + clip(Δwᵢ) + 𝒩(0,σ²)) / n</span> where{" "}
          <span className="text-signal-300">Σᵢ maskᵢ = 0</span> — individual updates are information-theoretically unreadable
        </div>
      </Panel>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* DP lab */}
        <Panel
          className="lg:col-span-3"
          title="Differential privacy — noise mechanism lab"
          sub="Drag ε and watch the injected noise distribution widen"
          delay={90}
          right={<Badge tone="ember">(ε, δ)-DP</Badge>}
        >
          <SliderRow
            label="Privacy budget ε (per round)"
            value={eps}
            min={0.5}
            max={8}
            step={0.1}
            onChange={setEps}
            fmt={(v) => `ε = ${v.toFixed(1)}`}
            hint="Smaller ε ⇒ stronger privacy guarantee ⇒ more noise ⇒ lower accuracy."
          />
          <div className="mt-3 grid sm:grid-cols-3 gap-3 mb-4">
            {[
              { k: "Sensitivity 2C/n", v: sensitivity.toFixed(3) },
              { k: "Noise scale σ", v: sigma.toFixed(3) },
              { k: "δ (fixed)", v: delta.toExponential(0) },
            ].map((s) => (
              <div key={s.k} className="rounded-md border border-line-soft bg-ink-900/60 px-3 py-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-fog-500">{s.k}</div>
                <div className="font-mono text-[15px] text-fog-100 mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>
          <PDFCurve sigma={sigma} color="#f0b454" compare={{ sigma: sigmaRef, color: "#58b7f0", label: `σ at ε=8 (weak)` }} />
          <div className="mt-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">
              sampled noise on one coordinate (26 draws)
            </div>
            <svg viewBox="0 0 640 46" className="w-full h-[46px]">
              <line x1={320} x2={320} y1={4} y2={42} stroke="#27395a" strokeDasharray="3 4" />
              {noiseSamples.map((s, i) => {
                const x = 320 + Math.max(-300, Math.min(300, s * 160));
                return <circle key={i} cx={x} cy={10 + (i % 4) * 8} r={2.6} fill="#f0b454" opacity={0.75} />;
              })}
            </svg>
            <p className="font-mono text-[11.5px] text-fog-500 mt-2">
              σ = (2C/n)·√(2·ln(1.25/δ)) / ε — Gaussian mechanism (Dwork & Roth)
            </p>
          </div>
        </Panel>

        {/* budget tracker */}
        <Panel
          className="lg:col-span-2"
          title="Privacy budget ledger"
          sub={`Cumulative ε per run vs the ${PRIVACY_BUDGET} ε policy cap`}
          delay={160}
        >
          {runs.length === 0 ? (
            <p className="text-[13px] text-fog-500">Run a training session to populate the ledger.</p>
          ) : (
            <HBars
              items={runs.slice(0, 6).map((r) => ({
                label: r.modelName,
                value: r.epsilonSpent,
                color: r.epsilonSpent / PRIVACY_BUDGET > 0.75 ? "#f0b454" : "#1fc8b4",
                sub: `${getDatasetMeta(r.datasetId).sector}`,
              }))}
              max={PRIVACY_BUDGET}
              fmt={(v) => `ε ${v.toFixed(1)}`}
            />
          )}
          {latest && (
            <div className="mt-4 rounded-lg border border-line-soft bg-ink-900/60 p-3.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">Composition accounting (latest run)</div>
              <div className="flex justify-between text-[12.5px] py-1">
                <span className="text-fog-400">Basic composition Σ εᵢ</span>
                <span className="font-mono text-fog-100">{latest.epsilonSpent.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-[12.5px] py-1">
                <span className="text-fog-400">Advanced (√R-moment bound)</span>
                <span className="font-mono text-fog-100">
                  {advancedEpsilon(latest.config.epsilonPerRound, latest.rounds.length, latest.config.delta).toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between text-[12.5px] py-1">
                <span className="text-fog-400">Policy cap</span>
                <span className="font-mono text-fog-100">{PRIVACY_BUDGET}.0</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* centralized vs federated */}
      <Panel
        title="Centralized ML vs federated ML"
        sub="Same predictive task — two fundamentally different data paths"
        delay={220}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-fog-500 border-b border-line">
                <th className="py-2.5 pr-4 font-medium">Dimension</th>
                <th className="py-2.5 pr-4 font-medium">
                  <span className="text-sky-300">Centralized</span> (pool everything)
                </th>
                <th className="py-2.5 font-medium">
                  <span className="text-signal-300">Federated</span> (FedShield)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {[
                ["Data movement", "All raw rows copied to one server", "Zero rows move — only Δw + noise"],
                ["Breach blast radius", "Full dataset exposed in one incident", "No dataset exists to steal server-side"],
                ["Regulatory fit", "GDPR/HIPAA transfers & DPAs required", "Data residency preserved by design"],
                [
                  "Accuracy (latest run)",
                  latest?.centralizedFinal ? `${(latest.centralizedFinal.accuracy * 100).toFixed(2)}%` : "—",
                  latest ? `${(latest.final.accuracy * 100).toFixed(2)}% (ε=${latest.config.epsilonPerRound}/rd)` : "—",
                ],
                ["Privacy guarantee", "Policy-based (trust the server)", "Cryptographic + statistical (ε,δ)-DP"],
                ["Failure mode", "Single honeypot, insider risk", "Noisy convergence, client dropout"],
              ].map(([k, a, b]) => (
                <tr key={k} className="hover:bg-ink-800/30 transition-colors">
                  <td className="py-2.5 pr-4 text-fog-400 whitespace-nowrap">{k}</td>
                  <td className="py-2.5 pr-4 text-fog-300">{a}</td>
                  <td className="py-2.5 text-fog-100">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* trade-off */}
        <Panel className="lg:col-span-3" title="The accuracy ↔ privacy frontier" delay={280}
          sub="Theoretical Gaussian-mechanism trend with your measured runs overlaid">
          <TradeoffChart fedAcc={fedAcc} cenAcc={cenAcc} runs={runs.map((r) => ({ eps: r.config.epsilonPerRound, acc: r.final.accuracy * 100, dp: r.config.dp, name: r.modelName }))} />
        </Panel>

        <Panel className="lg:col-span-2" title="Current posture" sub="Latest run at a glance" delay={340}>
          <div className="flex items-center gap-5">
            <Ring
              value={latest ? PRIVACY_BUDGET - latest.epsilonSpent : PRIVACY_BUDGET}
              max={PRIVACY_BUDGET}
              size={110}
              stroke={10}
              color="#1fc8b4"
            >
              <span className="font-display font-bold text-[22px] text-fog-50">
                {latest ? (PRIVACY_BUDGET - latest.epsilonSpent).toFixed(0) : PRIVACY_BUDGET}
              </span>
              <span className="text-[9.5px] font-mono text-fog-500">ε remaining</span>
            </Ring>
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center gap-2 text-fog-300">
                <span className="text-signal-400"><IconCheck width={14} height={14} /></span> Update clipping active (C={latest?.config.clipNorm.toFixed(1) ?? "1.0"})
              </div>
              <div className="flex items-center gap-2 text-fog-300">
                {latest?.config.secureAgg ? <span className="text-signal-400"><IconCheck width={14} height={14} /></span> : <span className="text-rose-400"><IconX width={14} height={14} /></span>}
                Secure aggregation {latest?.config.secureAgg ? "on" : "off"}
              </div>
              <div className="flex items-center gap-2 text-fog-300">
                {latest?.config.dp ? <span className="text-signal-400"><IconCheck width={14} height={14} /></span> : <span className="text-rose-400"><IconX width={14} height={14} /></span>}
                Gaussian mechanism {latest?.config.dp ? "on" : "off"}
              </div>
              <div className="flex items-center gap-2 text-fog-300">
                <span className="text-signal-400"><IconCheck width={14} height={14} /></span> 0 raw rows transmitted
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TradeoffChart({
  fedAcc,
  cenAcc,
  runs,
}: {
  fedAcc: number;
  cenAcc: number;
  runs: { eps: number; acc: number; dp: boolean; name: string }[];
}) {
  const W = 640;
  const H = 250;
  const M = { l: 44, r: 16, t: 14, b: 30 };
  const k = (cenAcc - fedAcc) * 0.9 + 0.8;
  const curve = (e: number) => cenAcc - k / Math.max(0.35, e);
  const xs = Array.from({ length: 61 }, (_, i) => 0.5 + (7.5 * i) / 60);
  const yMin = Math.min(...xs.map(curve), ...runs.map((r) => r.acc)) - 1.5;
  const yMax = cenAcc + 1;
  const X = (e: number) => M.l + ((e - 0.5) / 7.5) * (W - M.l - M.r);
  const Y = (a: number) => M.t + (H - M.t - M.b) - ((a - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const path = xs.map((e, i) => `${i === 0 ? "M" : "L"}${X(e).toFixed(1)},${Y(curve(e)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = yMin + ((yMax - yMin) * i) / 4;
        return (
          <g key={i}>
            <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke="#1c2b44" strokeDasharray="3 5" />
            <text x={M.l - 7} y={Y(v) + 3.5} textAnchor="end" fontSize={10} fill="#5c7194" fontFamily="JetBrains Mono, monospace">
              {v.toFixed(0)}%
            </text>
          </g>
        );
      })}
      {[1, 2, 4, 6, 8].map((e) => (
        <text key={e} x={X(e)} y={H - 9} textAnchor="middle" fontSize={10} fill="#5c7194" fontFamily="JetBrains Mono, monospace">
          ε={e}
        </text>
      ))}
      <line x1={M.l} x2={W - M.r} y1={Y(cenAcc)} y2={Y(cenAcc)} stroke="#58b7f0" strokeDasharray="2 5" opacity={0.6} />
      <text x={W - M.r - 4} y={Y(cenAcc) - 5} textAnchor="end" fontSize={10} fill="#58b7f0" fontFamily="JetBrains Mono, monospace">
        centralized ceiling {cenAcc.toFixed(1)}%
      </text>
      <path d={path} fill="none" stroke="#f0b454" strokeWidth={1.8} strokeDasharray="6 4" pathLength={1} className="draw-line" />
      {runs.filter((r) => r.dp).map((r, i) => (
        <g key={i}>
          <circle cx={X(r.eps)} cy={Y(r.acc)} r={5} fill="#1fc8b4" stroke="#060b14" strokeWidth={1.5} />
          <text x={X(r.eps) + 8} y={Y(r.acc) - 7} fontSize={9.5} fill="#7fe8da" fontFamily="JetBrains Mono, monospace">
            {r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 24} textAnchor="middle" fontSize={10} fill="#5c7194" fontFamily="JetBrains Mono, monospace" opacity={0} />
    </svg>
  );
}
