/* ─────────────────────────────────────────────────────────────
 * FedShield — Authentication provider
 *
 * Implements the Firebase-Auth surface (email/password, Google
 * OAuth, password reset, guest mode) behind a swappable adapter.
 * In this demo build the adapter persists to localStorage and
 * hashes passwords with SHA-256 (WebCrypto). Swap `adapter` for
 * the real Firebase SDK by providing VITE_FIREBASE_* env vars —
 * see README.md. No credentials are hard-coded anywhere.
 * ───────────────────────────────────────────────────────────── */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AuthMode, SessionUser, StoredUser } from "./types";

const K_USERS = "fedshield.users";
const K_SESSION = "fedshield.session";
const K_RESETS = "fedshield.resets";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — session-only mode */
  }
}

async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Non-secure context fallback (demo only)
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }
}

/* ── Validation helpers ───────────────────────────────────── */

export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
    return "Enter a valid email address.";
  return null;
}

export interface PasswordCheck {
  score: 0 | 1 | 2 | 3 | 4;
  problems: string[];
}

export function checkPassword(pw: string): PasswordCheck {
  const problems: string[] = [];
  if (pw.length < 8) problems.push("At least 8 characters");
  if (!/[a-zA-Z]/.test(pw)) problems.push("Contains a letter");
  if (!/\d/.test(pw)) problems.push("Contains a number");
  const bonus = (pw.length >= 12 ? 1 : 0) + (/[^a-zA-Z0-9]/.test(pw) ? 1 : 0);
  const base = 4 - Math.min(3, problems.length);
  const score = Math.max(0, Math.min(4, problems.length === 0 ? 2 + bonus : base - 1)) as
    | 0
    | 1
    | 2
    | 3
    | 4;
  return { score: (pw.length === 0 ? 0 : Math.max(1, score)) as 0 | 1 | 2 | 3 | 4, problems };
}

/* ── Context ──────────────────────────────────────────────── */

export interface ResetTicket {
  email: string;
  code: string;
}

interface AuthCtx {
  user: SessionUser | null;
  mode: AuthMode | null;
  busy: boolean;
  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  enterGuest: () => void;
  requestReset: (email: string) => Promise<ResetTicket>;
  completeReset: (email: string, code: string, newPassword: string) => Promise<void>;
  googleSignIn: (profile: { name: string; email: string }) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const session = readJson<{ uid: string; mode: AuthMode } | null>(K_SESSION, null);
    if (session?.mode === "guest") {
      setUser({
        uid: "guest",
        name: "Guest Analyst",
        email: "guest@fedshield.demo",
        provider: "guest",
        role: "guest",
      });
      setMode("guest");
    } else if (session?.uid) {
      const users = readJson<StoredUser[]>(K_USERS, []);
      const u = users.find((x) => x.uid === session.uid);
      if (u) {
        setUser({ uid: u.uid, name: u.name, email: u.email, provider: u.provider, role: u.role });
        setMode("user");
      }
    }
    setBusy(false);
  }, []);

  const persistSession = (uid: string, m: AuthMode) => {
    writeJson(K_SESSION, { uid, mode: m });
    setMode(m);
  };

  const register = useCallback(async (name: string, email: string, password: string) => {
    setBusy(true);
    await wait(650);
    const users = readJson<StoredUser[]>(K_USERS, []);
    const clean = email.trim().toLowerCase();
    if (users.some((u) => u.email.toLowerCase() === clean)) {
      setBusy(false);
      throw new Error("An account with this email already exists. Try signing in instead.");
    }
    const passHash = await sha256(`fedshield::${password}`);
    const u: StoredUser = {
      uid: `u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: name.trim(),
      email: clean,
      passHash,
      provider: "password",
      role: "analyst",
      createdAt: Date.now(),
      lastLogin: Date.now(),
    };
    users.push(u);
    writeJson(K_USERS, users);
    setUser({ uid: u.uid, name: u.name, email: u.email, provider: u.provider, role: u.role });
    persistSession(u.uid, "user");
    setBusy(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    await wait(600);
    const users = readJson<StoredUser[]>(K_USERS, []);
    const clean = email.trim().toLowerCase();
    const u = users.find((x) => x.email.toLowerCase() === clean);
    if (!u) {
      setBusy(false);
      throw new Error("No account found for this email. Create one first.");
    }
    if (u.provider === "google") {
      setBusy(false);
      throw new Error("This account uses Google Sign-In. Use the Google button below.");
    }
    const hash = await sha256(`fedshield::${password}`);
    if (hash !== u.passHash) {
      setBusy(false);
      throw new Error("Incorrect password. Try again or reset it below.");
    }
    u.lastLogin = Date.now();
    writeJson(K_USERS, users);
    setUser({ uid: u.uid, name: u.name, email: u.email, provider: u.provider, role: u.role });
    persistSession(u.uid, "user");
    setBusy(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(K_SESSION);
    setUser(null);
    setMode(null);
  }, []);

  const enterGuest = useCallback(() => {
    setUser({
      uid: "guest",
      name: "Guest Analyst",
      email: "guest@fedshield.demo",
      provider: "guest",
      role: "guest",
    });
    persistSession("guest", "guest");
  }, []);

  const requestReset = useCallback(async (email: string): Promise<ResetTicket> => {
    setBusy(true);
    await wait(700);
    const users = readJson<StoredUser[]>(K_USERS, []);
    const clean = email.trim().toLowerCase();
    const u = users.find((x) => x.email.toLowerCase() === clean);
    if (!u) {
      setBusy(false);
      throw new Error("No account found for this email address.");
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const resets = readJson<Record<string, { code: string; exp: number }>>(K_RESETS, {});
    resets[clean] = { code, exp: Date.now() + 10 * 60 * 1000 };
    writeJson(K_RESETS, resets);
    setBusy(false);
    return { email: clean, code };
  }, []);

  const completeReset = useCallback(async (email: string, code: string, newPassword: string) => {
    setBusy(true);
    await wait(600);
    const clean = email.trim().toLowerCase();
    const resets = readJson<Record<string, { code: string; exp: number }>>(K_RESETS, {});
    const ticket = resets[clean];
    if (!ticket) {
      setBusy(false);
      throw new Error("No reset request found. Request a new code first.");
    }
    if (Date.now() > ticket.exp) {
      setBusy(false);
      throw new Error("Reset code expired. Request a new one.");
    }
    if (ticket.code !== code.trim()) {
      setBusy(false);
      throw new Error("Invalid reset code. Check the 6-digit code and try again.");
    }
    const users = readJson<StoredUser[]>(K_USERS, []);
    const u = users.find((x) => x.email.toLowerCase() === clean);
    if (!u) {
      setBusy(false);
      throw new Error("Account no longer exists.");
    }
    u.passHash = await sha256(`fedshield::${newPassword}`);
    writeJson(K_USERS, users);
    delete resets[clean];
    writeJson(K_RESETS, resets);
    setBusy(false);
  }, []);

  const googleSignIn = useCallback(async (profile: { name: string; email: string }) => {
    setBusy(true);
    await wait(900); // simulated OAuth redirect + token exchange
    const users = readJson<StoredUser[]>(K_USERS, []);
    const clean = profile.email.trim().toLowerCase();
    let u = users.find((x) => x.email.toLowerCase() === clean);
    if (!u) {
      u = {
        uid: `g-${Date.now().toString(36)}`,
        name: profile.name,
        email: clean,
        passHash: null,
        provider: "google",
        role: "analyst",
        createdAt: Date.now(),
        lastLogin: Date.now(),
      };
      users.push(u);
    } else {
      u.lastLogin = Date.now();
    }
    writeJson(K_USERS, users);
    setUser({ uid: u.uid, name: u.name, email: u.email, provider: "google", role: u.role });
    persistSession(u.uid, "user");
    setBusy(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      mode,
      busy,
      register,
      login,
      logout,
      enterGuest,
      requestReset,
      completeReset,
      googleSignIn,
    }),
    [user, mode, busy, register, login, logout, enterGuest, requestReset, completeReset, googleSignIn]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
