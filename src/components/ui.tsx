/* FedShield — reusable UI primitives */
import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { Toast } from "../lib/types";
import { IconAlert, IconCheck, IconInfo, IconLock, IconX } from "./icons";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Animated number ──────────────────────────────────────── */

export function useTicker(value: number, duration = 650): number {
  const [v, setV] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const from = ref.current;
    if (from === value) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const cur = from + (value - from) * eased;
      ref.current = cur;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return v;
}

/* ── Button ───────────────────────────────────────────────── */

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger" | "amber";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-signal-500 text-ink-950 font-semibold hover:bg-signal-400 active:scale-[0.98] shadow-[0_0_24px_rgba(31,200,180,0.25)]",
    outline:
      "border border-line text-fog-200 hover:border-signal-600 hover:text-signal-300 active:scale-[0.98] bg-ink-850/40",
    ghost: "text-fog-300 hover:text-fog-50 hover:bg-ink-700/50 active:scale-[0.98]",
    danger:
      "bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25 active:scale-[0.98]",
    amber:
      "bg-ember-400/15 text-ember-300 border border-ember-400/40 hover:bg-ember-400/25 active:scale-[0.98]",
  };
  const sizes: Record<string, string> = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2 gap-2",
    lg: "text-[15px] px-5 py-2.5 gap-2",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

/* ── Panel ────────────────────────────────────────────────── */

export function Panel({
  title,
  sub,
  right,
  children,
  className,
  delay = 0,
  pad = true,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  pad?: boolean;
}) {
  return (
    <section className={cn("panel reveal", className)} style={{ ["--d" as string]: `${delay}ms` }}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line-soft">
          <div>
            {title && (
              <h3 className="font-display font-semibold text-[15px] text-fog-50 tracking-wide">{title}</h3>
            )}
            {sub && <p className="text-xs text-fog-500 mt-0.5">{sub}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/* ── Badge / pill ─────────────────────────────────────────── */

export function Badge({
  tone = "signal",
  children,
  className,
}: {
  tone?: "signal" | "ember" | "rose" | "sky" | "fog" | "lime";
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    signal: "text-signal-300 border-signal-500/40 bg-signal-500/10",
    ember: "text-ember-300 border-ember-400/40 bg-ember-400/10",
    rose: "text-rose-300 border-rose-400/40 bg-rose-500/10",
    sky: "text-sky-300 border-sky-400/40 bg-sky-500/10",
    fog: "text-fog-300 border-line bg-ink-700/40",
    lime: "text-lime-300 border-lime-400/40 bg-lime-400/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono font-medium uppercase tracking-wider",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function LockPill({ label = "Requires account" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-fog-500 font-mono">
      <IconLock width={12} height={12} /> {label}
    </span>
  );
}

/* ── Form field ───────────────────────────────────────────── */

export function Field({
  label,
  error,
  icon,
  right,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <label className="block text-left">
      <span className="block text-xs font-medium text-fog-400 mb-1.5 tracking-wide uppercase font-mono">
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-2.5 rounded-lg border bg-ink-900/80 px-3 transition-colors focus-within:border-signal-600",
          error ? "border-rose-500/60" : "border-line"
        )}
      >
        {icon && <span className="text-fog-500 shrink-0">{icon}</span>}
        <input
          className="w-full bg-transparent py-2.5 text-sm text-fog-50 placeholder:text-fog-600 outline-none"
          {...rest}
        />
        {right}
      </span>
      {error && <span className="block text-xs text-rose-300 mt-1.5">{error}</span>}
    </label>
  );
}

/* ── Toggle ───────────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative w-10 h-[22px] rounded-full transition-colors duration-200 shrink-0",
        checked ? "bg-signal-500" : "bg-ink-600",
        disabled && "opacity-40 cursor-not-allowed"
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "absolute top-[3px] w-4 h-4 rounded-full bg-ink-950 transition-all duration-200",
          checked ? "left-[21px]" : "left-[3px] bg-fog-300"
        )}
      />
    </button>
  );
}

/* ── Slider row ───────────────────────────────────────────── */

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className={cn(disabled && "opacity-40 pointer-events-none")}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] text-fog-300">{label}</span>
        <span className="font-mono text-[13px] text-signal-300">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-signal-500 h-1.5 cursor-pointer"
      />
      {hint && <p className="text-[11px] text-fog-600 mt-1">{hint}</p>}
    </div>
  );
}

/* ── Segmented control ────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-ink-900/70 p-0.5 gap-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150",
            value === o.value
              ? "bg-signal-500/15 text-signal-300 shadow-[inset_0_0_0_1px_rgba(31,200,180,0.35)]"
              : "text-fog-400 hover:text-fog-200"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Progress bar ─────────────────────────────────────────── */

export function ProgressBar({
  value,
  tone = "signal",
  className,
}: {
  value: number; // 0..1
  tone?: "signal" | "ember" | "rose" | "sky";
  className?: string;
}) {
  const tones: Record<string, string> = {
    signal: "bg-signal-500",
    ember: "bg-ember-400",
    rose: "bg-rose-400",
    sky: "bg-sky-400",
  };
  return (
    <div className={cn("h-1.5 rounded-full bg-ink-700 overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

/* ── Donut ring ───────────────────────────────────────────── */

export function Ring({
  value,
  max,
  size = 92,
  stroke = 8,
  color = "#1fc8b4",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1b2c47" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className={cn("relative panel w-full shadow-2xl shadow-black/60 reveal", width)}
        style={{ ["--d" as string]: "0ms" }}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h3 className="font-display font-semibold text-fog-50">{title}</h3>
          <button onClick={onClose} className="text-fog-500 hover:text-fog-200 transition-colors">
            <IconX />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ── Toasts ───────────────────────────────────────────────── */

export function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  const icons = {
    success: <IconCheck width={15} height={15} />,
    error: <IconAlert width={15} height={15} />,
    info: <IconInfo width={15} height={15} />,
    warn: <IconAlert width={15} height={15} />,
  };
  const colors = {
    success: "border-signal-500/50 text-signal-300",
    error: "border-rose-500/50 text-rose-300",
    info: "border-sky-400/50 text-sky-300",
    warn: "border-ember-400/50 text-ember-300",
  };
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-[min(92vw,380px)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "panel reveal flex items-start gap-2.5 px-4 py-3 border shadow-xl shadow-black/40",
            colors[t.kind]
          )}
        >
          <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
          <p className="text-[13px] text-fog-200 leading-snug flex-1">{t.msg}</p>
          <button onClick={() => dismiss(t.id)} className="text-fog-500 hover:text-fog-200 shrink-0">
            <IconX width={13} height={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────── */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-6">
      <div className="mx-auto w-12 h-12 rounded-xl border border-dashed border-line flex items-center justify-center text-fog-500 mb-4">
        <IconInfo />
      </div>
      <h4 className="font-display font-semibold text-fog-100">{title}</h4>
      <p className="text-[13px] text-fog-500 mt-1.5 max-w-sm mx-auto leading-relaxed">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ── Key/value row ────────────────────────────────────────── */

export function KV({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-line-soft last:border-0">
      <span className="text-[12px] text-fog-500">{k}</span>
      <span className={cn("text-[13px] text-fog-100 text-right", mono && "font-mono")}>{v}</span>
    </div>
  );
}
