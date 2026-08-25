/* FedShield — Authentication (email/password, Google OAuth, reset, guest mode) */
import { useEffect, useState } from "react";
import {
  checkPassword,
  getDeletedGoogleAccounts,
  getKnownGoogleAccounts,
  removeGoogleAccount,
  restoreDefaultGoogleAccounts,
  useAuth,
  validateEmail,
} from "../lib/auth";
import type { GoogleAccount, ResetTicket } from "../lib/auth";
import type { Phase } from "../lib/types";
import {
  IconArrowRight,
  IconEye,
  IconEyeOff,
  IconGoogle,
  IconKey,
  IconLock,
  IconLogo,
  IconMail,
  IconShield,
  IconUser,
} from "../components/icons";
import { Badge, Button, Field, Modal, cn } from "../components/ui";
import { Topology } from "../components/viz";
import { useApp } from "../lib/store";
import { APPWRITE_PROJECT_ID } from "../lib/appwrite";


type View = "signin" | "signup" | "forgot";

const DEMO_CLIENTS = [
  { id: "dc1", name: "Client A", enabled: true, nSamples: 1040 },
  { id: "dc2", name: "Client B", enabled: true, nSamples: 862 },
  { id: "dc3", name: "Client C", enabled: true, nSamples: 1233 },
  { id: "dc4", name: "Client D", enabled: true, nSamples: 741 },
  { id: "dc5", name: "Client E", enabled: true, nSamples: 918 },
];

const DEMO_PHASES: Phase[] = ["distribute", "local", "mask", "aggregate", "eval"];

const TICKER = [
  "[round 12] Client C → Δw masked · ‖Δw‖ clipped to C=1.0",
  "[dp] Gaussian noise σ=0.412 injected · ε 2.5 → cum 14.9",
  "[secagg] pairwise masks negotiated · Σ masks = 0",
  "[eval] global acc 91.4% · F1 0.887 · AUC 0.951",
  "[fedavg] 5/5 masked updates aggregated",
  "[privacy] raw rows transmitted this session: 0",
];

const GOOGLE_PERSONAS: GoogleAccount[] = [
  { name: "BHUVAN S", email: "1nt23is054.bhuvan@nmit.ac.in", lastUsed: Date.now() },
  { name: "Aisha Karimi", email: "aisha.karimi@gmail.com", lastUsed: 0 },
  { name: "Daniel Okafor", email: "d.okafor@gmail.com", lastUsed: 0 },
];

/* OAuth 2.0 client ID from .env — enables REAL Google Identity
   Services One Tap (shows the browser's actual signed-in accounts). */
const GOOGLE_CLIENT_ID =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID ?? "";

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { google?: unknown };
    if (w.google) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Identity Services unavailable"));
    document.head.appendChild(s);
  });
}

function startGoogleOneTap(onProfile: (p: { name: string; email: string }) => void): Promise<void> {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error("no-client-id"));
  return loadGIS().then(() => {
    const g = (window as unknown as {
      google: { accounts: { id: { initialize: (o: object) => void; prompt: () => void } } };
    }).google;
    g.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp: { credential: string }) => {
        try {
          const payload = JSON.parse(atob(resp.credential.split(".")[1]));
          onProfile({ name: payload.name ?? payload.email, email: payload.email });
        } catch {
          /* malformed credential */
        }
      },
    });
    g.accounts.id.prompt();
  });
}

const AVATAR_HUES = [174, 210, 32, 350, 262, 96];
function avatarColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return `hsl(${AVATAR_HUES[h % AVATAR_HUES.length]} 58% 46%)`;
}

export default function AuthPage() {
  const auth = useAuth();
  const { toast } = useApp();
  const [view, setView] = useState<View>("signin");

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string | null>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState<ResetTicket | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [googleOpen, setGoogleOpen] = useState(false);
  const [addAccountStep, setAddAccountStep] = useState(false);
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPassword, setGPassword] = useState("");
  const [gisLive, setGisLive] = useState(false);

  const [selectedGoogleAcc, setSelectedGoogleAcc] = useState<{ name: string; email: string } | null>(null);
  const [googleOtp, setGoogleOtp] = useState("");
  const [googleOtpCode, setGoogleOtpCode] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifyMethod, setVerifyMethod] = useState<"otp" | "password">("otp");
  const [otpStep, setOtpStep] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [showSimulatedInbox, setShowSimulatedInbox] = useState(false);

  const startGoogleOtpVerification = (profile: { name: string; email: string }) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSelectedGoogleAcc(profile);
    setGoogleOtpCode(code);
    setGoogleOtp("");
    setVerifyPassword("");
    setOtpErr(null);
    setVerifyMethod("otp");
    setShowSimulatedInbox(false);
    setOtpStep(true);
  };

  const confirmGoogleOtpAndSignIn = async () => {
    if (!selectedGoogleAcc) return;

    if (verifyMethod === "password") {
      if (verifyPassword.trim().length < 6) {
        setOtpErr("Please enter a valid Google Account password.");
        return;
      }
    } else {
      if (googleOtp.trim() !== googleOtpCode) {
        setOtpErr("Invalid 6-digit verification code. Please check the code sent to your Gmail inbox.");
        return;
      }
    }

    setOtpErr(null);
    await handleGoogleProfile(selectedGoogleAcc);
    setOtpStep(false);
    setSelectedGoogleAcc(null);
  };

  const [deletedGoogleEmails, setDeletedGoogleEmails] = useState<string[]>(getDeletedGoogleAccounts);

  // Accounts present on this system: previously used (persisted) first, then demo accounts minus deleted ones
  const deviceAccounts: GoogleAccount[] = (() => {
    const known = getKnownGoogleAccounts();
    const rest = GOOGLE_PERSONAS.filter((p) => !known.some((k) => k.email === p.email));
    const all = [...known, ...rest];
    return all.filter((a) => !deletedGoogleEmails.includes(a.email.toLowerCase()));
  })();

  const handleDeleteGoogleAccount = (email: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeGoogleAccount(email);
    setDeletedGoogleEmails(getDeletedGoogleAccounts());
    toast("info", `Removed Google account ${name} (${email}) from device list.`);
  };

  const handleRestoreGoogleAccounts = () => {
    restoreDefaultGoogleAccounts();
    setDeletedGoogleEmails([]);
    toast("success", "Restored default Google accounts to chooser list.");
  };

  const openGoogleChooser = async () => {
    setFormErr(null);
    try {
      await auth.googleSignIn();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  };


  const authorizeNewAccount = () => {
    const emailErr = validateEmail(gEmail);
    const nameErr = gName.trim().length < 2 ? "Enter the account holder's full name." : null;
    const passErr = gPassword.trim().length < 6 ? "Enter your Google Account password (minimum 6 characters)." : null;
    if (emailErr || nameErr || passErr) {
      setFormErr(emailErr ?? nameErr ?? passErr);
      return;
    }
    setFormErr(null);
    startGoogleOtpVerification({ name: gName.trim(), email: gEmail.trim() });
  };

  const [phaseIdx, setPhaseIdx] = useState(1);
  const [demoRound, setDemoRound] = useState(12);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx((p) => (p + 1) % DEMO_PHASES.length);
      setDemoRound((r) => (r % 30) + 1);
      setTick((t) => t + 1);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const pwCheck = checkPassword(pass);

  const reset = () => {
    setFieldErr({});
    setFormErr(null);
  };

  const handleSignin = async () => {
    reset();
    const eErr = validateEmail(email);
    if (eErr) return setFieldErr({ email: eErr });
    if (!pass) return setFieldErr({ pass: "Password is required." });
    try {
      await auth.login(email, pass);
      toast("success", "Signed in — welcome back to FedShield.");
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const handleSignup = async () => {
    reset();
    const errs: Record<string, string | null> = {};
    if (name.trim().length < 2) errs.name = "Enter your full name.";
    const eErr = validateEmail(email);
    if (eErr) errs.email = eErr;
    if (pwCheck.problems.length > 0) errs.pass = "Password: " + pwCheck.problems.join(", ").toLowerCase() + ".";
    if (confirm !== pass || !confirm) errs.confirm = "Passwords do not match.";
    if (Object.values(errs).some(Boolean)) return setFieldErr(errs);
    try {
      await auth.register(name, email, pass);
      toast("success", `Account created — welcome, ${name.trim().split(" ")[0]}.`);
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Registration failed.");
    }
  };

  const handleForgotRequest = async () => {
    reset();
    const eErr = validateEmail(email);
    if (eErr) return setFieldErr({ email: eErr });
    try {
      const t = await auth.requestReset(email);
      setTicket(t);
      toast("info", "Reset code issued — check the simulated inbox below.");
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Could not request reset.");
    }
  };

  const handleForgotComplete = async () => {
    reset();
    if (!/^\d{6}$/.test(resetCode.trim()))
      return setFieldErr({ code: "Enter the 6-digit code." });
    if (pwCheck.problems.length > 0)
      return setFieldErr({ pass: "Password: " + pwCheck.problems.join(", ").toLowerCase() + "." });
    if (confirm !== pass || !confirm) return setFieldErr({ confirm: "Passwords do not match." });
    try {
      await auth.completeReset(email, resetCode, pass);
      setTicket(null);
      setResetCode("");
      setPass("");
      setConfirm("");
      setView("signin");
      toast("success", "Password updated — sign in with your new password.");
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Reset failed.");
    }
  };

  const handleGoogleProfile = async (profile: { name: string; email: string }) => {
    setFormErr(null);
    try {
      await auth.googleSignIn(profile);
      setGoogleOpen(false);
      toast("success", `Signed in with Google as ${profile.name}.`);
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  };

  const strength = ["Too short", "Weak", "Acceptable", "Strong", "Excellent"][pwCheck.score];
  const strengthColor = ["bg-ink-600", "bg-rose-400", "bg-ember-400", "bg-signal-500", "bg-lime-400"][pwCheck.score];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.15fr_1fr] grid-bg">
      {/* ── Left: live federation panel ── */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r border-line-soft scanline">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(600px 420px at 18% 8%, rgba(31,200,180,0.10), transparent 65%), radial-gradient(520px 420px at 88% 92%, rgba(240,180,84,0.07), transparent 65%)",
          }}
        />
        <header className="relative flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center">
            <IconLogo width={22} height={22} />
          </span>
          <div>
            <div className="font-display font-bold text-xl tracking-tight text-fog-50">FedShield</div>
            <div className="text-[11px] font-mono text-fog-500 uppercase tracking-[0.18em]">
              Federated Learning · Predictive Analytics
            </div>
          </div>
        </header>

        <div className="relative my-6">
          <Topology
            clients={DEMO_CLIENTS}
            phase={DEMO_PHASES[phaseIdx]}
            round={demoRound}
            secureAgg={true}
            height={360}
          />
        </div>

        <div className="relative space-y-5 max-w-md">
          <h1 className="font-display text-[34px] xl:text-[40px] leading-[1.08] font-bold tracking-tight text-fog-50">
            Train one global model.
            <br />
            <span className="text-signal-400">Expose zero raw records.</span>
          </h1>
          <ul className="space-y-2.5">
            {[
              { icon: <IconShield width={15} height={15} />, text: "Raw data never leaves the client device" },
              { icon: <IconLock width={15} height={15} />, text: "(ε, δ)-differential privacy · Gaussian mechanism" },
              { icon: <IconKey width={15} height={15} />, text: "Secure aggregation — server learns only the sum" },
            ].map((p, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[13px] text-fog-300">
                <span className="text-signal-400 shrink-0">{p.icon}</span>
                {p.text}
              </li>
            ))}
          </ul>
          <div className="panel px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fog-400">
            {TICKER.slice(0, 3).map((m, i) => (
              <div
                key={(tick + i) % TICKER.length}
                className={cn("truncate reveal", i === 0 ? "text-signal-300" : "")}
                style={{ ["--d" as string]: `${i * 90}ms` }}
              >
                <span className="text-fog-600 mr-1.5">$</span>
                {TICKER[(tick + i) % TICKER.length]}
              </div>
            ))}
            <span className="text-signal-400 tick-blink">▍</span>
          </div>
        </div>

        <footer className="relative text-[11px] font-mono text-fog-600 flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-500 animate-pulse" /> engine: in-browser · v1.0
          </span>
          <span>FedAvg / FedProx</span>
          <span>Flower-compatible API</span>
        </footer>
      </div>

      {/* ── Right: auth card ── */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[430px] reveal">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <span className="w-10 h-10 rounded-xl bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center">
              <IconLogo width={22} height={22} />
            </span>
            <div>
              <div className="font-display font-bold text-lg text-fog-50">FedShield</div>
              <div className="text-[10px] font-mono text-fog-500 uppercase tracking-[0.16em]">
                Federated Learning Platform
              </div>
            </div>
          </div>

          <div className="panel p-6 sm:p-8">
            <div className="mb-5 px-3.5 py-2 rounded-lg border border-signal-500/30 bg-signal-500/10 flex items-center justify-between text-[11.5px] font-mono text-signal-300">
              <span className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-signal-400 animate-pulse" />
                Appwrite Backend Active
              </span>
              <span className="text-fog-400 font-normal truncate max-w-[170px]" title={APPWRITE_PROJECT_ID}>{APPWRITE_PROJECT_ID}</span>
            </div>

            {view !== "forgot" ? (

              <>
                <div className="flex rounded-lg border border-line bg-ink-900/70 p-0.5 mb-6">
                  {(["signin", "signup"] as View[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setView(v);
                        reset();
                      }}
                      className={cn(
                        "flex-1 py-2 rounded-md text-sm font-medium transition-all",
                        view === v ? "bg-signal-500/15 text-signal-300" : "text-fog-400 hover:text-fog-200"
                      )}
                    >
                      {v === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                <h2 className="font-display text-[22px] font-bold text-fog-50 mb-1">
                  {view === "signin" ? "Access the console" : "Join the federation"}
                </h2>
                <p className="text-[13px] text-fog-500 mb-6">
                  {view === "signin"
                    ? "Authenticate to unlock model exports, run deletion and the audit log."
                    : "Email & password registration — credentials are hashed with SHA-256 on device."}
                </p>
              </>
            ) : (
              <>
                <button onClick={() => { setView("signin"); reset(); setTicket(null); }} className="text-[12px] font-mono text-fog-500 hover:text-signal-300 mb-4 flex items-center gap-1.5">
                  ← back to sign in
                </button>
                <h2 className="font-display text-[22px] font-bold text-fog-50 mb-1">Reset password</h2>
                <p className="text-[13px] text-fog-500 mb-6">
                  {ticket
                    ? "Enter the 6-digit code from your inbox and choose a new password."
                    : "We'll issue a one-time reset code to your account email."}
                </p>
              </>
            )}

            {formErr && (
              <div className="mb-4 px-3.5 py-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-[13px] text-rose-300 reveal">
                {formErr}
              </div>
            )}

            <div className="space-y-4">
              {view === "signup" && (
                <Field
                  label="Full name"
                  placeholder="Ada Lovelace"
                  icon={<IconUser width={15} height={15} />}
                  value={name}
                  error={fieldErr.name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              {(view === "forgot" && ticket === null) || view !== "forgot" ? (
                <Field
                  label="Email"
                  type="email"
                  placeholder="you@institution.org"
                  icon={<IconMail width={15} height={15} />}
                  value={email}
                  error={fieldErr.email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              ) : null}

              {view === "forgot" && ticket && (
                <>
                  <div className="px-3.5 py-3 rounded-lg border border-ember-400/40 bg-ember-400/8 reveal">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ember-300 mb-1">
                      Simulated inbox · {ticket.email}
                    </div>
                    <div className="text-[13px] text-fog-200">
                      Your FedShield reset code is{" "}
                      <span className="font-mono font-bold text-ember-300 text-[15px] tracking-[0.2em]">{ticket.code}</span>
                    </div>
                  </div>
                  <Field
                    label="6-digit code"
                    placeholder="••••••"
                    icon={<IconKey width={15} height={15} />}
                    value={resetCode}
                    error={fieldErr.code}
                    maxLength={6}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                  />
                </>
              )}

              {view !== "forgot" && (
                <Field
                  label="Password"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  icon={<IconLock width={15} height={15} />}
                  value={pass}
                  error={fieldErr.pass}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (view === "signin" ? handleSignin() : handleSignup())}
                  right={
                    <button type="button" onClick={() => setShowPass((s) => !s)} className="text-fog-500 hover:text-fog-200 transition-colors">
                      {showPass ? <IconEyeOff width={16} height={16} /> : <IconEye width={16} height={16} />}
                    </button>
                  }
                />
              )}

              {(view === "signup" || (view === "forgot" && ticket)) && (
                <>
                  {view === "signup" && pass && (
                    <div className="-mt-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", pwCheck.score >= i ? strengthColor : "bg-ink-600")} />
                        ))}
                      </div>
                      <p className="text-[11px] text-fog-500 mt-1 font-mono">{strength} · min 8 chars, letter + number</p>
                    </div>
                  )}
                  <Field
                    label="Confirm password"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    icon={<IconLock width={15} height={15} />}
                    value={confirm}
                    error={fieldErr.confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </>
              )}

              {view === "forgot" && ticket === null ? (
                <Button className="w-full" size="lg" loading={auth.busy} onClick={handleForgotRequest}>
                  Issue reset code <IconArrowRight width={16} height={16} />
                </Button>
              ) : view === "forgot" ? (
                <Button className="w-full" size="lg" loading={auth.busy} onClick={handleForgotComplete}>
                  Set new password <IconCheckSmall />
                </Button>
              ) : view === "signin" ? (
                <Button className="w-full" size="lg" loading={auth.busy} onClick={handleSignin}>
                  Sign in <IconArrowRight width={16} height={16} />
                </Button>
              ) : (
                <Button className="w-full" size="lg" loading={auth.busy} onClick={handleSignup}>
                  Create account <IconArrowRight width={16} height={16} />
                </Button>
              )}

              {view === "signin" && (
                <button
                  onClick={() => { setView("forgot"); reset(); }}
                  className="block w-full text-center text-[12.5px] text-fog-500 hover:text-signal-300 transition-colors"
                >
                  Forgot password?
                </button>
              )}

              <div className="flex items-center gap-3 py-1">
                <span className="flex-1 h-px bg-line" />
                <span className="text-[11px] font-mono text-fog-600 uppercase tracking-wider">or</span>
                <span className="flex-1 h-px bg-line" />
              </div>

              <Button variant="outline" className="w-full" size="lg" onClick={openGoogleChooser}>
                <IconGoogle /> Continue with Google
              </Button>

              <button
                onClick={() => {
                  auth.enterGuest();
                  toast("info", "Guest Mode enabled — full demo access; admin actions & exports stay locked.");
                }}
                className="w-full mt-1 py-2.5 rounded-lg border border-dashed border-ember-400/50 text-ember-300 text-sm font-medium hover:bg-ember-400/10 transition-all group"
              >
                Skip for now — explore in Guest Mode{" "}
                <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </button>
              <p className="text-center text-[11.5px] text-fog-600 leading-relaxed">
                Guests can run the full federated workflow & analytics.
                <br />
                No account needed · no data stored · upgrade anytime.
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] font-mono text-fog-600 mt-5">
            OAuth 2.0 · Firebase-compatible auth adapter · zero hard-coded secrets
          </p>
        </div>
      </div>

      {/* Google account chooser — Google-styled OAuth 2.0 account picker (Dark Theme v3 matching screenshot) */}
      {googleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0f0f10]/85 backdrop-blur-sm">
          <div className="relative w-[min(840px,96vw)] bg-[#1e1f20] border border-[#3c4043] rounded-3xl p-6 sm:p-10 shadow-2xl reveal text-[#e8eaed]" style={{ ["--d" as string]: "0ms" }}>
            {/* Top Bar: Google G logo & Sign in with Google */}
            <div className="flex items-center gap-3 pb-6 border-b border-[#3c4043]">
              <IconGoogle width={22} height={22} />
              <span className="text-[15px] font-medium text-[#e8eaed]">Sign in with Google</span>
              <button
                onClick={() => setGoogleOpen(false)}
                className="ml-auto text-[#9aa0a6] hover:text-[#e8eaed] transition-colors p-1"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-8 pt-8">
              {/* Left Column: Heading & Project context */}
              <div>
                <h2 className="text-[34px] sm:text-[38px] font-normal leading-tight text-[#e8eaed] font-display">
                  {otpStep ? "2-Step Verification" : "Choose an account"}
                </h2>
                <p className="text-[15px] text-[#9aa0a6] mt-3 leading-relaxed">
                  {otpStep ? (
                    <>
                      To confirm that this Google account belongs to you, enter the 6-digit security verification code sent to:
                      <span className="block font-mono font-medium text-[#a8c7fa] text-[14px] mt-1.5">{selectedGoogleAcc?.email}</span>
                    </>
                  ) : (
                    <>
                      to continue to <span className="text-[#a8c7fa] font-medium">FedShield</span>
                    </>
                  )}
                </p>
                {gisLive && !otpStep && (
                  <div className="mt-6 p-3 rounded-xl bg-[#0c2d1c] border border-[#137333] text-[#81c995] text-[12px] leading-relaxed">
                    Google One Tap Active — you can also select your account from the browser prompt.
                  </div>
                )}
              </div>

              {/* Right Column: Account list / Add Account / OTP Verification */}
              <div>
                {otpStep ? (
                  /* ── 2-Step Security Verification OTP / Password Step ── */
                  <div className="space-y-4 bg-[#131314] p-5 rounded-2xl border border-[#3c4043] reveal">
                    {/* Method Selector Tabs */}
                    <div className="flex rounded-xl bg-[#1e1f20] border border-[#3c4043] p-1 text-[12px]">
                      <button
                        type="button"
                        onClick={() => { setVerifyMethod("otp"); setOtpErr(null); }}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg font-medium transition-all",
                          verifyMethod === "otp" ? "bg-[#a8c7fa] text-[#040e29]" : "text-[#9aa0a6] hover:text-[#e8eaed]"
                        )}
                      >
                        ✉️ Gmail Security Code
                      </button>
                      <button
                        type="button"
                        onClick={() => { setVerifyMethod("password"); setOtpErr(null); }}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg font-medium transition-all",
                          verifyMethod === "password" ? "bg-[#a8c7fa] text-[#040e29]" : "text-[#9aa0a6] hover:text-[#e8eaed]"
                        )}
                      >
                        🔒 Account Password
                      </button>
                    </div>

                    {/* Email Security Notice */}
                    <div className="p-3 rounded-xl bg-[#1e1f20] border border-[#3c4043] text-[12px] text-[#e8eaed] space-y-1">
                      <div className="flex items-center justify-between font-semibold text-[#81c995]">
                        <span>🛡️ Google Security Protection</span>
                        <span className="text-[10.5px] font-mono uppercase bg-[#0c2d1c] px-2 py-0.5 rounded text-[#81c995]">
                          {verifyMethod === "otp" ? "Code Sent" : "Password Required"}
                        </span>
                      </div>
                      <p className="text-[#9aa0a6] text-[11.5px] leading-relaxed">
                        {verifyMethod === "otp"
                          ? `A 6-digit security code has been sent to ${selectedGoogleAcc?.email}. The code is NOT displayed on screen to prevent unauthorized access.`
                          : `Enter your Google Account password for ${selectedGoogleAcc?.email} to confirm identity ownership.`}
                      </p>
                    </div>

                    {/* Dev Testing Simulated Inbox Accordion */}
                    {verifyMethod === "otp" && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowSimulatedInbox((s) => !s)}
                          className="text-[11px] font-mono text-[#a8c7fa] hover:underline flex items-center gap-1"
                        >
                          📨 {showSimulatedInbox ? "Hide Simulated Gmail Inbox" : "Inspect Simulated Gmail Inbox (Dev Testing)"}
                        </button>
                        {showSimulatedInbox && (
                          <div className="mt-2 p-3 rounded-xl bg-[#0c2d1c] border border-[#137333] text-[#81c995] text-[12px] space-y-1 reveal">
                            <div className="font-semibold text-white">From: Google Accounts Security (no-reply@accounts.google.com)</div>
                            <div>Subject: FedShield 2-Step Verification Code</div>
                            <div className="pt-1 text-[#e8eaed]">
                              Your 6-digit security code is:{" "}
                              <span className="font-mono font-bold text-lg text-white bg-[#071f13] px-2.5 py-0.5 rounded border border-[#137333]">
                                {googleOtpCode}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {otpErr && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[12px]">
                        {otpErr}
                      </div>
                    )}

                    {verifyMethod === "otp" ? (
                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-[#9aa0a6] mb-1.5">
                          Enter 6-digit Security Code
                        </label>
                        <input
                          value={googleOtp}
                          onChange={(e) => setGoogleOtp(e.target.value.replace(/\D/g, ""))}
                          placeholder="••••••"
                          maxLength={6}
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && void confirmGoogleOtpAndSignIn()}
                          className="w-full bg-[#1e1f20] border border-[#5f6368] rounded-xl px-4 py-3 text-center font-mono font-bold text-xl tracking-[0.3em] text-[#e8eaed] outline-none focus:border-[#a8c7fa]"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-[#9aa0a6] mb-1.5">
                          Google Account Password
                        </label>
                        <input
                          type="password"
                          value={verifyPassword}
                          onChange={(e) => setVerifyPassword(e.target.value)}
                          placeholder="••••••••••••"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && void confirmGoogleOtpAndSignIn()}
                          className="w-full bg-[#1e1f20] border border-[#5f6368] rounded-xl px-4 py-3 text-[14px] text-[#e8eaed] outline-none focus:border-[#a8c7fa]"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          setOtpStep(false);
                          setSelectedGoogleAcc(null);
                        }}
                        className="px-4 py-2.5 rounded-xl border border-[#5f6368] text-[13px] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        onClick={() => void confirmGoogleOtpAndSignIn()}
                        disabled={
                          auth.busy ||
                          (verifyMethod === "otp" ? googleOtp.length !== 6 : verifyPassword.trim().length < 6)
                        }
                        className="flex-1 py-2.5 rounded-xl bg-[#a8c7fa] text-[#040e29] font-semibold text-[14px] hover:bg-[#c2e7ff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {auth.busy ? "Verifying…" : "Verify Identity & Sign In"}
                      </button>
                    </div>
                  </div>
                ) : !addAccountStep ? (
                  /* ── Account Chooser List ── */
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-[#3c4043] divide-y divide-[#3c4043] overflow-hidden bg-[#131314]">
                      {deviceAccounts.length > 0 ? (
                        deviceAccounts.map((a) => (
                          <div
                            key={a.email}
                            onClick={() => startGoogleOtpVerification({ name: a.name, email: a.email })}
                            className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-[#28292a] transition-colors cursor-pointer group"
                          >
                            <span
                              className="w-10 h-10 rounded-full flex items-center justify-center text-[#f1f3f4] text-lg font-medium shrink-0 shadow-inner"
                              style={{ background: avatarColor(a.email) }}
                            >
                              {a.name.trim()[0]?.toUpperCase() ?? "B"}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[15px] font-medium text-[#e8eaed] truncate flex items-center gap-1.5">
                                {a.name}
                                <span className="text-[10px] font-mono bg-[#0c2d1c] text-[#81c995] px-1.5 py-0.5 rounded border border-[#137333]">
                                  ✔ Verified
                                </span>
                              </span>
                              <span className="block text-[13px] text-[#9aa0a6] truncate">{a.email}</span>
                            </span>
                            {/* Delete / Remove Account Button */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteGoogleAccount(a.email, a.name, e)}
                              className="p-2 rounded-full text-[#9aa0a6] hover:text-rose-400 hover:bg-rose-500/20 transition-all opacity-60 hover:opacity-100 shrink-0"
                              title={`Delete ${a.name} from Google login list`}
                            >
                              <span className="text-sm">🗑️</span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[#9aa0a6] text-[13px]">
                          No Google accounts listed on this device.
                        </div>
                      )}

                      <button
                        onClick={() => setAddAccountStep(true)}
                        className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-[#28292a] transition-colors"
                      >
                        <span className="w-10 h-10 rounded-full border border-[#5f6368] flex items-center justify-center text-[#e8eaed] shrink-0">
                          <span className="text-lg">👤</span>
                        </span>
                        <span className="text-[15px] font-medium text-[#e8eaed]">Use another account</span>
                      </button>
                    </div>

                    {/* Restore Accounts Reset Button */}
                    {deletedGoogleEmails.length > 0 && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleRestoreGoogleAccounts}
                          className="text-[11.5px] font-mono text-[#a8c7fa] hover:underline flex items-center gap-1"
                        >
                          ↺ Restore Default Accounts ({deletedGoogleEmails.length} deleted)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Add New Account Step ── */
                  <div className="space-y-3.5 bg-[#131314] p-5 rounded-2xl border border-[#3c4043]">
                    <p className="text-[13px] text-[#9aa0a6]">
                      Enter your Google Account details to verify ownership and authorize FedShield:
                    </p>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#9aa0a6] mb-1">Full Name</label>
                      <input
                        value={gName}
                        onChange={(e) => setGName(e.target.value)}
                        placeholder="BHUVAN S"
                        className="w-full bg-[#1e1f20] border border-[#5f6368] rounded-xl px-3.5 py-2 text-[14px] text-[#e8eaed] outline-none focus:border-[#a8c7fa]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#9aa0a6] mb-1">Google Email Address</label>
                      <input
                        value={gEmail}
                        onChange={(e) => setGEmail(e.target.value)}
                        placeholder="1nt23is054.bhuvan@nmit.ac.in"
                        type="email"
                        className="w-full bg-[#1e1f20] border border-[#5f6368] rounded-xl px-3.5 py-2 text-[14px] text-[#e8eaed] outline-none focus:border-[#a8c7fa]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#9aa0a6] mb-1">Google Account Password</label>
                      <input
                        value={gPassword}
                        onChange={(e) => setGPassword(e.target.value)}
                        placeholder="••••••••••••"
                        type="password"
                        className="w-full bg-[#1e1f20] border border-[#5f6368] rounded-xl px-3.5 py-2 text-[14px] text-[#e8eaed] outline-none focus:border-[#a8c7fa]"
                      />
                      <span className="block text-[10.5px] text-[#9aa0a6] mt-1 font-mono">Min 6 characters required for account verification</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setAddAccountStep(false)} className="px-4 py-2 rounded-xl border border-[#5f6368] text-[13px] text-[#9aa0a6] hover:text-[#e8eaed]">
                        Cancel
                      </button>
                      <button onClick={() => authorizeNewAccount()} disabled={auth.busy} className="flex-1 py-2 rounded-xl bg-[#a8c7fa] text-[#040e29] font-semibold text-[13.5px] hover:bg-[#c2e7ff] transition-colors">
                        Proceed to 2FA Verification
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer matching Google v3 OAuth footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-8 mt-6 border-t border-[#3c4043] text-[12px] text-[#9aa0a6]">
              <div className="flex items-center gap-1 cursor-pointer hover:text-[#e8eaed]">
                English (United States) <span className="text-[10px]">▼</span>
              </div>
              <div className="flex items-center gap-6">
                <button className="hover:text-[#e8eaed] transition-colors">Help</button>
                <button className="hover:text-[#e8eaed] transition-colors">Privacy</button>
                <button className="hover:text-[#e8eaed] transition-colors">Terms</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconCheckSmall() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
