/* FedShield — hand-rolled SVG chart components (no chart lib dependency) */
import { useEffect, useMemo, useRef, useState } from "react";

export interface ChartSeries {
  name: string;
  color: string;
  ys: number[];
  dash?: boolean;
  area?: boolean;
}

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.max(260, cw));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ── Line chart with hover crosshair ──────────────────────── */

export function LineChart({
  series,
  xs,
  height = 240,
  yFmt = (v) => v.toFixed(2),
  xFmt = (v) => String(v),
  yDomain,
  legend = true,
  animate = true,
}: {
  series: ChartSeries[];
  xs: number[];
  height?: number;
  yFmt?: (v: number) => string;
  xFmt?: (v: number) => string;
  yDomain?: [number, number];
  legend?: boolean;
  animate?: boolean;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const M = { top: 14, right: 14, bottom: 26, left: 46 };
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;

  const { yMin, yMax } = useMemo(() => {
    if (yDomain) return { yMin: yDomain[0], yMax: yDomain[1] };
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series)
      for (const v of s.ys) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    if (!isFinite(lo)) {
      lo = 0;
      hi = 1;
    }
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.12;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [series, yDomain]);

  const n = xs.length;
  if (n === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center text-[13px] text-fog-600 font-mono" style={{ height }}>
        awaiting training data…
      </div>
    );
  }
  const X = (i: number) => M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTickIdx = Array.from(
    new Set(
      Array.from({ length: Math.min(6, n) }, (_, i) =>
        Math.round((i / Math.max(1, Math.min(6, n) - 1)) * (n - 1))
      )
    )
  );

  const onMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = (px - M.left) / iw;
    const idx = Math.round(ratio * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={M.left} x2={width - M.right} y1={Y(t)} y2={Y(t)} stroke="#1c2b44" strokeDasharray="3 5" strokeWidth={1} />
            <text x={M.left - 8} y={Y(t) + 3.5} textAnchor="end" fontSize={10} fill="#5c7194" fontFamily="JetBrains Mono, monospace">
              {yFmt(t)}
            </text>
          </g>
        ))}
        {xTickIdx.map((i) => (
          <text key={i} x={X(i)} y={height - 8} textAnchor="middle" fontSize={10} fill="#5c7194" fontFamily="JetBrains Mono, monospace">
            {xFmt(xs[i])}
          </text>
        ))}
        {series.map((s, si) => {
          if (s.ys.length === 0) return null;
          const path = s.ys.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              {s.area && (
                <path
                  d={`${path} L${X(s.ys.length - 1).toFixed(1)},${(M.top + ih).toFixed(1)} L${X(0).toFixed(1)},${(M.top + ih).toFixed(1)} Z`}
                  fill={s.color}
                  opacity={0.09}
                />
              )}
              <path
                key={`${animate}-${s.ys.length}`}
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash ? "5 5" : undefined}
                pathLength={s.dash ? undefined : 1}
                className={s.dash ? undefined : animate ? "draw-line" : undefined}
                strokeLinecap="round"
              />
            </g>
          );
        })}
        {hover !== null && hover < n && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={M.top} y2={M.top + ih} stroke="#3a5078" strokeWidth={1} />
            {series.map((s, si) =>
              s.ys[hover] !== undefined ? (
                <circle key={si} cx={X(hover)} cy={Y(s.ys[hover])} r={3.6} fill={s.color} stroke="#060b14" strokeWidth={1.5} />
              ) : null
            )}
          </g>
        )}
      </svg>
      {hover !== null && hover < n && (
        <div
          className="absolute pointer-events-none panel px-3 py-2 text-[11px] font-mono z-10 shadow-xl"
          style={{
            left: Math.min(Math.max(X(hover) - 70, 4), width - 150),
            top: M.top,
            minWidth: 140,
          }}
        >
          <div className="text-fog-500 mb-1">{xFmt(xs[hover])}</div>
          {series.map((s, si) =>
            s.ys[hover] !== undefined ? (
              <div key={si} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-fog-400">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="text-fog-100">{yFmt(s.ys[hover])}</span>
              </div>
            ) : null
          )}
        </div>
      )}
      {legend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 px-1">
          {series.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[11px] text-fog-400 font-mono">
              <span
                className="w-3 h-[3px] rounded inline-block"
                style={{ background: s.color, opacity: s.dash ? 0.7 : 1 }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Vertical bars ────────────────────────────────────────── */

export function VBars({
  items,
  height = 160,
  fmt = (v) => String(v),
}: {
  items: { label: string; value: number; color?: string }[];
  height?: number;
  fmt?: (v: number) => string;
}) {
  const [ref, width] = useWidth();
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  const bw = Math.min(46, (width - 40) / items.length - 12);
  return (
    <div ref={ref}>
      <svg width={width} height={height}>
        {items.map((it, i) => {
          const x = 20 + (i + 0.5) * ((width - 40) / items.length) - bw / 2;
          const h = (it.value / max) * (height - 44);
          const y = height - 24 - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={Math.max(2, h)} rx={3} fill={it.color ?? "#1fc8b4"} opacity={0.85}>
                <title>{`${it.label}: ${fmt(it.value)}`}</title>
              </rect>
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="#a9bcd6" fontFamily="JetBrains Mono, monospace">
                {fmt(it.value)}
              </text>
              <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize={9.5} fill="#5c7194" fontFamily="JetBrains Mono, monospace">
                {it.label.length > 9 ? it.label.slice(0, 8) + "…" : it.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Horizontal bars ──────────────────────────────────────── */

export function HBars({
  items,
  fmt = (v) => v.toFixed(2),
  max: maxProp,
}: {
  items: { label: string; value: number; color?: string; sub?: string }[];
  fmt?: (v: number) => string;
  max?: number;
}) {
  const max = maxProp ?? Math.max(...items.map((i) => Math.abs(i.value)), 1e-9);
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i}>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[12px] text-fog-300 truncate pr-2">
              {it.label}
              {it.sub && <span className="text-fog-600 ml-1.5 font-mono text-[10px]">{it.sub}</span>}
            </span>
            <span className="font-mono text-[12px] text-fog-100">{fmt(it.value)}</span>
          </div>
          <div className="h-[7px] rounded-full bg-ink-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (Math.abs(it.value) / max) * 100)}%`,
                background: it.color ?? "#1fc8b4",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Sparkline ────────────────────────────────────────────── */

export function Sparkline({
  values,
  color = "#1fc8b4",
  width = 110,
  height = 34,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2)
    return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map(
    (v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`
  );
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.9} />
      <circle
        cx={width}
        cy={height - 3 - ((values[values.length - 1] - min) / span) * (height - 6)}
        r={2.4}
        fill={color}
      />
    </svg>
  );
}

/* ── Probability-density curve (noise mechanisms) ─────────── */

export function PDFCurve({
  sigma,
  kind = "gaussian",
  height = 150,
  color = "#f0b454",
  compare,
}: {
  sigma: number;
  kind?: "gaussian" | "laplace";
  height?: number;
  color?: string;
  compare?: { sigma: number; color: string; label: string };
}) {
  const [ref, width] = useWidth();
  const W = 4; // domain ±W
  const pdf = (x: number, s: number, k: "gaussian" | "laplace") =>
    k === "gaussian"
      ? Math.exp(-(x * x) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI))
      : Math.exp(-Math.abs(x) / s) / (2 * s);
  const build = (s: number, k: "gaussian" | "laplace") => {
    const pts: string[] = [];
    const steps = 120;
    let peak = 0;
    const ys: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = -W + (2 * W * i) / steps;
      const y = pdf(x, Math.max(0.15, s), k);
      ys.push(y);
      if (y > peak) peak = y;
    }
    for (let i = 0; i <= steps; i++) {
      const px = (i / steps) * (width - 30) + 15;
      const py = height - 22 - (ys[i] / (peak * 1.15)) * (height - 40);
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return pts;
  };
  const main = build(sigma, kind);
  const cmp = compare ? build(compare.sigma, kind) : null;
  const cmpColor = compare?.color ?? "#58b7f0";
  const cmpLabel = compare?.label ?? "";
  const cmpSigma = compare?.sigma ?? 0;
  return (
    <div ref={ref}>
      <svg width={width} height={height}>
        <line x1={15} x2={width - 15} y1={height - 22} y2={height - 22} stroke="#1c2b44" />
        <line x1={width / 2} x2={width / 2} y1={12} y2={height - 22} stroke="#27395a" strokeDasharray="3 5" />
        <text x={width / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="#5c7194" fontFamily="JetBrains Mono, monospace">
          0 (true update)
        </text>
        {cmp && (
          <>
            <polygon points={`15,${height - 22} ${cmp.join(" ")} ${width - 15},${height - 22}`} fill={cmpColor} opacity={0.06} />
            <polyline points={cmp.join(" ")} fill="none" stroke={cmpColor} strokeWidth={1.4} strokeDasharray="5 4" opacity={0.8} />
          </>
        )}
        <polygon points={`15,${height - 22} ${main.join(" ")} ${width - 15},${height - 22}`} fill={color} opacity={0.13} />
        <polyline points={main.join(" ")} fill="none" stroke={color} strokeWidth={2} />
      </svg>
      {compare && (
        <div className="flex gap-4 text-[11px] font-mono text-fog-400 px-2">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded inline-block" style={{ background: color }} /> σ = {sigma.toFixed(2)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded inline-block" style={{ background: compare.color }} /> {compare.label}
          </span>
        </div>
      )}
    </div>
  );
}
