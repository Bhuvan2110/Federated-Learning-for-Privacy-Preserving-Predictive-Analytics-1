/* FedShield — Federated Learning for Privacy-Preserving Predictive Analytics */
import { AuthProvider, useAuth } from "./lib/auth";
import { AppProvider, useApp } from "./lib/store";
import AuthPage from "./pages/AuthPage";
import Shell from "./components/Shell";
import AgentWidget from "./components/AgentWidget";
import { ToastHost } from "./components/ui";
import { IconLogo } from "./components/icons";

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center grid-bg">
      <span className="w-14 h-14 rounded-2xl bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center animate-pulse">
        <IconLogo width={30} height={30} />
      </span>
      <div className="font-display font-bold text-lg text-fog-100 mt-4">FedShield</div>
      <div className="text-[11px] font-mono text-fog-500 mt-1 uppercase tracking-[0.18em]">restoring session…</div>
    </div>
  );
}

function Root() {
  const { mode, busy } = useAuth();
  const { toasts, dismissToast } = useApp();
  if (busy) return <Splash />;
  return (
    <>
      {mode === null ? (
        <AuthPage />
      ) : (
        <>
          <Shell />
          <AgentWidget />
        </>
      )}
      <ToastHost toasts={toasts} dismiss={dismissToast} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Root />
      </AppProvider>
    </AuthProvider>
  );
}
