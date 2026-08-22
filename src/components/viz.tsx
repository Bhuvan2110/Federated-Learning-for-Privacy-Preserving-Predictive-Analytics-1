/* FedShield — federated-learning visualizations
 *  • Pipeline  : the 8-stage FL workflow with live stage tracking
 *  • Topology  : server ↔ clients graph with animated update packets
 */
import type { Phase } from "../lib/types";
import {
  IconChart,
  IconCheck,
  IconDatabase,
  IconFlask,
  IconGrid,
  IconLogo,
  IconNodes,
  IconServer,
  IconShield,
} from "./icons";
import { cn } from "./ui";

/* ── Workflow pipeline ────────────────────────────────────── */

export const STAGES = [
  { key: "dataset", label: "Dataset", icon: IconDatabase },
  { key: "distribute", label: "Data Distribution", icon: IconGrid },
  { key: "clients", label: "Federated Clients", icon: IconNodes },
  { key: "local", label: "Local Training", icon: IconFlask },
  { key: "privacy", label: "Privacy Protection", icon: IconShield },
  { key: "agg", label: "Secure Aggregation", icon: IconServer },
  { key: "global", label: "Global Model", icon: IconLogo },
  { key: "predict", label: "Predictive Analytics", icon: IconChart },
] as const;

const PHASE_TO_STAGE: Record<Phase, number> = {
  idle: -1,
  distribute: 1,
  local: 3,
  mask: 4,
  aggregate: 5,
  eval: 6,
  done: 7,
};

export function phaseToStage(p: Phase): number {
  return PHASE_TO_STAGE[p];
}

export function Pipeline({
  active,
  className,
}: {
  /** index of currently active stage; -1 = idle, 8 = all complete */
  active: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start overflow-x-auto pb-2", className)}>
      {STAGES.map((s, i) => {
        const state = active > 7 ? "done" : i < active ? "passed" : i === active ? "active" : "pending";
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-start shrink-0">
            {i > 0 && (
              <div className="relative w-6 sm:w-9 h-px mt-[21px] bg-line overflow-visible shrink-0">
                {state !== "pending" && (
                  <div className="absolute inset-0 bg-signal-600 animate-pulse" />
                )}
              </div>
            )}
            <div className="flex flex-col items-center w-[104px]">
              <div
                className={cn(
                  "relative w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300",
                  state === "active" &&
                    "border-signal-400 bg-signal-500/15 text-signal-300 pulse-dot shadow-[0_0_20px_rgba(31,200,180,0.3)]",
                  (state === "done" || state === "passed") && "border-signal-700 bg-signal-500/10 text-signal-400",
                  state === "pending" && "border-line bg-ink-850 text-fog-600"
                )}
              >
                <Icon width={19} height={19} />
                {(state === "done" || state === "passed") && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-signal-500 text-ink-950 flex items-center justify-center">
                    <IconCheck width={10} height={10} strokeWidth={3} />
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "mt-2 text-[10.5px] font-mono text-center leading-tight uppercase tracking-wide",
                  state === "active" ? "text-signal-300" : state === "pending" ? "text-fog-600" : "text-fog-400"
                )}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Network topology ─────────────────────────────────────── */

export interface TopoClient {
  id: string;
  name: string;
  enabled: boolean;
  nSamples: number;
}

const PHASE_COLOR: Record<Phase, string> = {
  idle: "#3a5078",
  distribute: "#58b7f0",
  local: "#1fc8b4",
  mask: "#f0b454",
  aggregate: "#e8798f",
  eval: "#58b7f0",
  done: "#1fc8b4",
};

export const PHASE_LABEL: Record<Phase, string> = {
  idle: "Federation idle",
  distribute: "Broadcasting global model wₜ",
  local: "Clients training on private data",
  mask: "Pairwise masks applied to updates",
  aggregate: "Aggregating masked Δw updates",
  eval: "Evaluating global model (server test set)",
  done: "Federation converged",
};

export function Topology({
  clients,
  phase,
  round,
  secureAgg,
  height = 400,
}: {
  clients: TopoClient[];
  phase: Phase;
  round: number;
  secureAgg: boolean;
  height?: number;
}) {
  const W = 560;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2 - 6;
  const R = 148;
  const color = PHASE_COLOR[phase];
  const inbound = phase === "aggregate" || phase === "mask";
  const outbound = phase === "distribute";
  const pos = clients.map((_, i) => {
    const a = (-90 + (360 / clients.length) * i) * (Math.PI / 180);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: height }}>
        <defs>
          <radialGradient id="serverGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1fc8b4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1fc8b4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={110} fill="url(#serverGlow)" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#16233a" strokeDasharray="2 7" />
        <g>
          <circle cx={cx} cy={cy} r={52} fill="none" stroke="#27395a" strokeDasharray="4 6">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${cx} ${cy}`}
              to={`360 ${cx} ${cy}`}
              dur="26s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {clients.map((c, i) => (
          <g key={c.id}>
            <line
              x1={cx}
              y1={cy}
              x2={pos[i].x}
              y2={pos[i].y}
              stroke={c.enabled ? (inbound || outbound ? color : "#1c2b44") : "#16233a"}
              strokeWidth={c.enabled ? 1.4 : 1}
              strokeDasharray={c.enabled ? undefined : "3 5"}
              opacity={c.enabled ? 0.85 : 0.5}
            />
          </g>
        ))}

        {/* packets */}
        {(inbound || outbound) &&
          clients.map((c, i) => {
            if (!c.enabled) return null;
            const from = outbound ? `${cx},${cy}` : `${pos[i].x},${pos[i].y}`;
            const to = outbound ? `${pos[i].x},${pos[i].y}` : `${cx},${cy}`;
            return (
              <g key={`p-${c.id}-${phase}-${round}`}>
                <circle r={4} fill={color} opacity={0.9}>
                  <animateMotion
                    path={`M ${from} L ${to}`}
                    dur="1.5s"
                    begin={`${(i % 6) * 0.18}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle r={7.5} fill={color} opacity={0.22}>
                  <animateMotion
                    path={`M ${from} L ${to}`}
                    dur="1.5s"
                    begin={`${(i % 6) * 0.18}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })}

        {/* server */}
        <g>
          <circle cx={cx} cy={cy} r={36} fill="#0d1829" stroke={color} strokeWidth={1.6} style={{ transition: "stroke .4s" }} />
          <circle cx={cx} cy={cy - 7} r={3.4} fill={color} />
          <circle cx={cx - 9} cy={cy + 7} r={2.8} fill={color} opacity={0.8} />
          <circle cx={cx + 9} cy={cy + 7} r={2.8} fill={color} opacity={0.8} />
          <path
            d={`M${cx - 2.6} ${cy - 4.6} L${cx - 7} ${cy + 4.6} M${cx + 2.6} ${cy - 4.6} L${cx + 7} ${cy + 4.6} M${cx - 6} ${cy + 7} H${cx + 6}`}
            stroke={color}
            strokeWidth={1.2}
            opacity={0.8}
          />
          <text x={cx} y={cy + 58} textAnchor="middle" fontSize={11} fill="#a9bcd6" fontFamily="JetBrains Mono, monospace">
            FL SERVER · FedShield
          </text>
          {secureAgg && (phase === "mask" || phase === "aggregate") && (
            <text x={cx} y={cy + 73} textAnchor="middle" fontSize={9.5} fill="#f0b454" fontFamily="JetBrains Mono, monospace">
              Σ masks = 0 → updates unreadable
            </text>
          )}
        </g>

        {/* clients */}
        {clients.map((c, i) => (
          <g key={c.id} opacity={c.enabled ? 1 : 0.4}>
            <circle
              cx={pos[i].x}
              cy={pos[i].y}
              r={23}
              fill="#0d1829"
              stroke={c.enabled ? "#17a394" : "#27395a"}
              strokeWidth={1.4}
              strokeDasharray={c.enabled ? undefined : "3 4"}
            />
            {phase === "local" && c.enabled && (
              <circle cx={pos[i].x} cy={pos[i].y} r={23} fill="none" stroke="#1fc8b4" strokeWidth={1.4}>
                <animate attributeName="r" values="23;31" dur="1.3s" begin={`${(i % 5) * 0.2}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="1.3s" begin={`${(i % 5) * 0.2}s`} repeatCount="indefinite" />
              </circle>
            )}
            <text
              x={pos[i].x}
              y={pos[i].y + 3.5}
              textAnchor="middle"
              fontSize={10.5}
              fill={c.enabled ? "#7fe8da" : "#5c7194"}
              fontFamily="JetBrains Mono, monospace"
              fontWeight={600}
            >
              {c.name.replace("Client ", "C-")}
            </text>
            <text
              x={pos[i].x}
              y={pos[i].y + 38}
              textAnchor="middle"
              fontSize={8.5}
              fill="#5c7194"
              fontFamily="JetBrains Mono, monospace"
            >
              {c.nSamples.toLocaleString()} rows
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-center gap-2.5 text-[11px] font-mono" style={{ color }}>
        <span className="relative flex w-2 h-2">
          {phase !== "idle" && (
            <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: color }} />
          )}
          <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: color }} />
        </span>
        <span style={{ transition: "color .3s" }}>{PHASE_LABEL[phase]}</span>
        {round > 0 && phase !== "idle" && phase !== "done" && (
          <span className="text-fog-500">· round {round}</span>
        )}
      </div>
    </div>
  );
}
