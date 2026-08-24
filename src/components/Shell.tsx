/* FedShield — application shell: sidebar, topbar, guest banner */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { useApp } from "../lib/store";
import { PRIVACY_BUDGET } from "../lib/flEngine";
import type { PageId } from "../lib/types";
import {
  IconChart,
  IconDatabase,
  IconFlask,
  IconGrid,
  IconHistory,
  IconLogo,
  IconLogout,
  IconMenu,
  IconNodes,
  IconPulse,
  IconShield,
  IconSparkle,
  IconX,
} from "./icons";
import { Badge, cn } from "./ui";
import Overview from "../pages/Overview";
import TrainingLab from "../pages/TrainingLab";
import Predicting from "../pages/Predicting";
import Clients from "../pages/Clients";
import Datasets from "../pages/Datasets";
import Privacy from "../pages/Privacy";
import Analytics from "../pages/Analytics";
import History from "../pages/History";
import VerifyPortal from "../pages/VerifyPortal";
import HealthCheck from "../pages/HealthCheck";

const NAV: { group: string; items: { id: PageId; label: string; icon: (p: { width: number; height: number }) => ReactNode }[] }[] = [
  {
    group: "Operations",
    items: [
      { id: "overview", label: "Overview", icon: (p) => <IconGrid {...p} /> },
      { id: "lab", label: "Training Lab", icon: (p) => <IconFlask {...p} /> },
      { id: "predict", label: "Prediction", icon: (p) => <IconSparkle {...p} /> },
      { id: "clients", label: "Clients", icon: (p) => <IconNodes {...p} /> },
      { id: "datasets", label: "Datasets", icon: (p) => <IconDatabase {...p} /> },
    ],
  },
  {
    group: "Governance & Health",
    items: [
      { id: "privacy", label: "Privacy Center", icon: (p) => <IconShield {...p} /> },
      { id: "analytics", label: "Analytics", icon: (p) => <IconChart {...p} /> },
      { id: "history", label: "History", icon: (p) => <IconHistory {...p} /> },
      { id: "health", label: "System Health", icon: (p) => <IconPulse {...p} /> },
    ],
  },
];

const TITLES: Record<PageId, { title: string; sub: string }> = {
  overview: { title: "Operations Overview", sub: "Global model health, privacy budget and federation activity" },
  lab: { title: "Federated Learning Lab", sub: "Configure, run and monitor privacy-preserving training rounds" },
  predict: { title: "Prediction Console", sub: "Query a field-specific trained model in natural language" },
  clients: { title: "Client Registry", sub: "The decentralized nodes that keep raw data on-premise" },
  datasets: { title: "Dataset Vault", sub: "Local-only data assets used by the federation" },
  privacy: { title: "Privacy Center", sub: "Differential privacy, secure aggregation and trade-off analysis" },
  analytics: { title: "Predictive Analytics", sub: "Inference with the trained global model — no raw data required" },
  history: { title: "Training History", sub: "Every federated run with telemetry and exportable artifacts" },
  health: { title: "System Health & Diagnostics", sub: "Automated API endpoint tests, engine convergence checks & step-by-step fix recommendations" },
};

export default function Shell() {
  const { user, logout } = useAuth();
  const { page, setPage, runs } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const isGuest = user?.role === "guest";
  const latest = runs[0] ?? null;

  // Listen for ?verifyRun= URL parameter to display the Verification Portal
  const [verifyRunId, setVerifyRunId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("verifyRun");
    }
    return null;
  });

  useEffect(() => {
    const handleUrlChange = () => {
      if (typeof window !== "undefined") {
        const p = new URLSearchParams(window.location.search);
        setVerifyRunId(p.get("verifyRun"));
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, []);

  const verifyRunTarget = verifyRunId ? runs.find((r) => r.id === verifyRunId) || latest : null;

  const t = verifyRunTarget
    ? { title: "Model Verification Portal", sub: `Verifiable Audit Certificate for ${verifyRunTarget.modelName}` }
    : TITLES[page];

  const clearVerify = () => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", window.location.pathname);
    }
    setVerifyRunId(null);
    setPage("overview");
  };

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map((g) => (
        <div key={g.group} className="mb-5">
          <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-fog-600">{g.group}</div>
          {g.items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (verifyRunId) clearVerify();
                setPage(item.id);
                setDrawer(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150 mb-0.5 group",
                !verifyRunId && page === item.id
                  ? "bg-signal-500/12 text-signal-300 shadow-[inset_2px_0_0_#1fc8b4]"
                  : "text-fog-400 hover:text-fog-100 hover:bg-ink-800/60"
              )}
            >
              <span className={cn("transition-colors", !verifyRunId && page === item.id ? "text-signal-400" : "text-fog-500 group-hover:text-fog-300")}>
                {item.icon({ width: 17, height: 17 })}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  const userCard = (
    <div className="px-3 pb-4">
      <div className="rounded-lg border border-line bg-ink-900/70 p-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center font-display font-bold text-[13px] shrink-0",
              isGuest ? "bg-ember-400/15 text-ember-300 border border-ember-400/40" : "bg-signal-500/15 text-signal-300 border border-signal-500/40"
            )}
          >
            {isGuest ? "G" : (user?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-fog-100 truncate">{user?.name}</div>
            <div className="text-[10.5px] font-mono text-fog-500 truncate">{isGuest ? "demo session · read-only scope" : user?.email}</div>
          </div>
          <button onClick={logout} title="Sign out" className="text-fog-500 hover:text-rose-300 transition-colors shrink-0">
            <IconLogout width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );

  const pageEl = verifyRunTarget ? (
    <VerifyPortal run={verifyRunTarget} onBack={clearVerify} />
  ) : (
    {
      overview: <Overview />,
      lab: <TrainingLab />,
      predict: <Predicting />,
      clients: <Clients />,
      datasets: <Datasets />,
      privacy: <Privacy />,
      analytics: <Analytics />,
      history: <History />,
      health: <HealthCheck />,
    }[page]
  );

  return (
    <div className="min-h-screen grid-bg">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(700px 480px at 12% -4%, rgba(31,200,180,0.07), transparent 60%), radial-gradient(640px 480px at 100% 108%, rgba(240,180,84,0.05), transparent 60%)",
        }}
      />

      {/* sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-[232px] border-r border-line-soft bg-ink-900/80 backdrop-blur-sm z-30">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line-soft shrink-0">
          <span className="w-9 h-9 rounded-xl bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center">
            <IconLogo width={20} height={20} />
          </span>
          <div>
            <div className="font-display font-bold text-[16px] text-fog-50 leading-none">FedShield</div>
            <div className="text-[9px] font-mono text-fog-500 uppercase tracking-[0.16em] mt-1">FL Analytics</div>
          </div>
        </div>
        {nav}
        {userCard}
      </aside>

      {/* drawer (mobile) */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-950/80" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] flex flex-col bg-ink-900 border-r border-line reveal" style={{ ["--d" as string]: "0ms" }}>
            <div className="flex items-center justify-between px-4 h-14 border-b border-line-soft">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center">
                  <IconLogo width={18} height={18} />
                </span>
                <span className="font-display font-bold text-fog-50">FedShield</span>
              </div>
              <button onClick={() => setDrawer(false)} className="text-fog-500 hover:text-fog-200">
                <IconX />
              </button>
            </div>
            {nav}
            {userCard}
          </aside>
        </div>
      )}

      {/* main column */}
      <div className="lg:pl-[232px] relative">
        <header className="sticky top-0 z-20 border-b border-line-soft bg-ink-950/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
            <button onClick={() => setDrawer(true)} className="lg:hidden text-fog-400 hover:text-fog-100">
              <IconMenu width={20} height={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display font-bold text-[17px] text-fog-50 leading-tight truncate">{t.title}</h1>
              <p className="text-[11.5px] text-fog-500 truncate hidden sm:block">{t.sub}</p>
            </div>

            {latest && (
              <button onClick={() => setPage("privacy")} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line hover:border-signal-700 transition-colors" title="Privacy budget — open Privacy Center">
                <span className={cn("w-1.5 h-1.5 rounded-full", latest.epsilonSpent / PRIVACY_BUDGET > 0.75 ? "bg-ember-400" : "bg-signal-500")} />
                <span className="font-mono text-[12px] text-fog-300">
                  ε {latest.epsilonSpent.toFixed(1)}<span className="text-fog-600">/{PRIVACY_BUDGET}</span>
                </span>
              </button>
            )}
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line font-mono text-[11px] text-fog-400">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-signal-500 opacity-60 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-signal-500" />
              </span>
              engine ready
            </span>

            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-lg border border-line hover:border-ink-500 transition-colors">
                <span
                  className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center font-display font-bold text-[12px]",
                    isGuest ? "bg-ember-400/15 text-ember-300" : "bg-signal-500/15 text-signal-300"
                  )}
                >
                  {isGuest ? "G" : (user?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-[12px] font-medium text-fog-200 leading-none">{user?.name}</span>
                  <span className={cn("block text-[9.5px] font-mono uppercase tracking-wider mt-0.5 leading-none", isGuest ? "text-ember-300" : "text-fog-500")}>
                    {isGuest ? "guest mode" : user?.provider === "google" ? "google oauth" : "email auth"}
                  </span>
                </span>
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 mt-2 w-60 panel z-20 p-2 reveal shadow-xl shadow-black/50" style={{ ["--d" as string]: "0ms" }}>
                    <div className="px-3 py-2.5 border-b border-line-soft mb-1">
                      <div className="text-[13px] font-semibold text-fog-100">{user?.name}</div>
                      <div className="text-[11px] font-mono text-fog-500 mt-0.5">{user?.email}</div>
                      <div className="mt-1.5">
                        {isGuest ? <Badge tone="ember">guest · demo scope</Badge> : <Badge tone="signal">{user?.provider} · {user?.role}</Badge>}
                      </div>
                    </div>
                    {isGuest && (
                      <p className="px-3 py-2 text-[11.5px] text-fog-500 leading-relaxed">
                        Guests explore everything but exports, deletions and the client registry stay locked.
                      </p>
                    )}
                    <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-fog-300 hover:bg-rose-500/10 hover:text-rose-300 transition-colors">
                      <IconLogout width={15} height={15} /> {isGuest ? "Exit Guest Mode" : "Sign out"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {isGuest && (
            <div className="px-4 sm:px-6 py-2 bg-ember-400/[0.07] border-t border-ember-400/25 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-ember-300">
                <IconShield width={13} height={13} /> Guest / Demo Mode
              </span>
              <span className="text-[11.5px] text-fog-400">
                Full read + training access. Model exports, run deletion and registry changes require an account.
              </span>
              <button onClick={logout} className="ml-auto text-[11.5px] font-mono text-signal-300 hover:text-signal-200 underline decoration-signal-700 underline-offset-2 shrink-0">
                create account →
              </button>
            </div>
          )}
        </header>

        <main className="px-4 sm:px-6 py-5 max-w-[1440px] mx-auto" key={verifyRunId ?? page}>
          {pageEl}
        </main>

        <footer className="px-6 py-5 text-center text-[11px] font-mono text-fog-600">
          FedShield · Federated Learning for Privacy-Preserving Predictive Analytics · final-year project build · raw data never leaves the client
        </footer>
      </div>
    </div>
  );
}
