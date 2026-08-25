/* ─────────────────────────────────────────────────────────────
 * FedShield — Authentication provider
 *
 * Implements the Appwrite Cloud Auth adapter (email/password,
 * Google OAuth, password reset, guest mode) with local fallback.
 * Project ID: project-sgp-6a8d39cc003c737ffa46
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
import { account, ID, OAuthProvider } from "./appwrite";

const K_USERS = "fedshield.users";
const K_SESSION = "fedshield.session";
const K_RESETS = "fedshield.resets";
const K_GOOGLE = "fedshield.googleAccounts";

/* ── Google accounts known to this device ──────────────────── */

export interface GoogleAccount {
  name: string;
  email: string;
  lastUsed: number;
}

const K_DELETED_GOOGLE = "fedshield.deletedGoogleAccounts";

export function getKnownGoogleAccounts(): GoogleAccount[] {
  return readJson<GoogleAccount[]>(K_GOOGLE, []);
}

export function getDeletedGoogleAccounts(): string[] {
  return readJson<string[]>(K_DELETED_GOOGLE, []);
}

export function rememberGoogleAccount(a: { name: string; email: string }) {
  const list = getKnownGoogleAccounts().filter(
    (x) => x.email.toLowerCase() !== a.email.toLowerCase()
  );
  list.unshift({ name: a.name, email: a.email.toLowerCase(), lastUsed: Date.now() });
  writeJson(K_GOOGLE, list.slice(0, 6));

  const del = getDeletedGoogleAccounts().filter((e) => e !== a.email.toLowerCase());
  writeJson(K_DELETED_GOOGLE, del);
}

export function removeGoogleAccount(email: string) {
  const clean = email.toLowerCase();
  const list = getKnownGoogleAccounts().filter((x) => x.email.toLowerCase() !== clean);
  writeJson(K_GOOGLE, list);

  const del = getDeletedGoogleAccounts();
  if (!del.includes(clean)) {
    del.push(clean);
    writeJson(K_DELETED_GOOGLE, del);
  }
}

export function restoreDefaultGoogleAccounts() {
  localStorage.removeItem(K_DELETED_GOOGLE);
}

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
  googleSignIn: (profile?: { name: string; email: string }) => Promise<void>;

}

const Ctx = createContext<AuthCtx | null>(null);

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;

    // Check Appwrite active session first
    (async () => {
      try {
        const apUser = await account.get();
        if (active && apUser) {
          const u: SessionUser = {
            uid: apUser.$id,
            name: apUser.name || apUser.email?.split("@")[0] || "Appwrite User",
            email: apUser.email || "user@appwrite.cloud",
            provider: "password",
            role: "analyst",
          };
          setUser(u);
          writeJson(K_SESSION, { ...u, mode: "user" });
          setMode("user");
          setBusy(false);
          return;
        }
      } catch {
        /* Not logged into Appwrite session */
      }

      if (!active) return;

      // Local session check fallback
      const session = readJson<(SessionUser & { mode: AuthMode }) | null>(K_SESSION, null);
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
        setUser({
          uid: session.uid,
          name: session.name || "Authenticated Analyst",
          email: session.email || "user@fedshield.demo",
          provider: session.provider || "google",
          role: session.role || "analyst",
        });
        setMode("user");
      }
      setBusy(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const persistSession = (u: SessionUser, m: AuthMode) => {
    writeJson(K_SESSION, { ...u, mode: m });
    setMode(m);
  };

  const register = useCallback(async (name: string, email: string, password: string) => {
    setBusy(true);
    const clean = email.trim().toLowerCase();

    // 1. Try Appwrite registration first
    try {
      const apUser = await account.create(ID.unique(), clean, password, name.trim());
      try {
        await account.createEmailPasswordSession(clean, password);
      } catch {
        /* session created or already logged in */
      }
      const u: SessionUser = {
        uid: apUser.$id,
        name: name.trim() || apUser.name || clean.split("@")[0],
        email: clean,
        provider: "password",
        role: "analyst",
      };
      setUser(u);
      persistSession(u, "user");
      setBusy(false);
      return;
    } catch (apErr: unknown) {
      console.warn("Appwrite register fallback:", apErr);
    }

    // 2. Fallback local storage registration
    const users = readJson<StoredUser[]>(K_USERS, []);
    if (users.some((u) => u.email.toLowerCase() === clean)) {
      setBusy(false);
      throw new Error("An account with this email already exists.");
    }
    const passHash = await sha256(`fedshield::${password}`);
    const stored: StoredUser = {
      uid: `u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: name.trim(),
      email: clean,
      passHash,
      provider: "password",
      role: "analyst",
      createdAt: Date.now(),
      lastLogin: Date.now(),
    };
    users.push(stored);
    writeJson(K_USERS, users);
    const u: SessionUser = { uid: stored.uid, name: stored.name, email: stored.email, provider: stored.provider, role: stored.role };
    setUser(u);
    persistSession(u, "user");
    setBusy(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    const clean = email.trim().toLowerCase();

    // 1. Try Appwrite login first
    try {
      await account.createEmailPasswordSession(clean, password);
      const apUser = await account.get();
      const u: SessionUser = {
        uid: apUser.$id,
        name: apUser.name || clean.split("@")[0],
        email: apUser.email || clean,
        provider: "password",
        role: "analyst",
      };
      setUser(u);
      persistSession(u, "user");
      setBusy(false);
      return;
    } catch (apErr: unknown) {
      console.warn("Appwrite login fallback:", apErr);
    }

    // 2. Fallback local storage login
    const users = readJson<StoredUser[]>(K_USERS, []);
    const stored = users.find((x) => x.email.toLowerCase() === clean);
    if (!stored) {
      setBusy(false);
      throw new Error("No account found for this email address. Create one first.");
    }
    if (stored.provider === "google") {
      setBusy(false);
      throw new Error("This account uses Google Sign-In. Use the Google button below.");
    }
    const hash = await sha256(`fedshield::${password}`);
    if (hash !== stored.passHash) {
      setBusy(false);
      throw new Error("Incorrect password. Try again or reset it below.");
    }
    stored.lastLogin = Date.now();
    writeJson(K_USERS, users);
    const u: SessionUser = { uid: stored.uid, name: stored.name, email: stored.email, provider: stored.provider, role: stored.role };
    setUser(u);
    persistSession(u, "user");
    setBusy(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession("current");
    } catch {
      /* Appwrite session delete fallback */
    }
    localStorage.removeItem(K_SESSION);
    setUser(null);
    setMode(null);
  }, []);

  const enterGuest = useCallback(async () => {
    try {
      await account.createAnonymousSession();
    } catch {
      /* Appwrite anonymous session fallback */
    }
    const guestUser: SessionUser = {
      uid: "guest",
      name: "Guest Analyst",
      email: "guest@fedshield.demo",
      provider: "guest",
      role: "guest",
    };
    setUser(guestUser);
    persistSession(guestUser, "guest");
  }, []);

  const requestReset = useCallback(async (email: string): Promise<ResetTicket> => {
    setBusy(true);
    const clean = email.trim().toLowerCase();

    try {
      await account.createRecovery(clean, `${window.location.origin}/reset-password`);
    } catch {
      /* Appwrite recovery fallback */
    }

    const users = readJson<StoredUser[]>(K_USERS, []);
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

  const googleSignIn = useCallback(async (profile?: { name: string; email: string }) => {
    setBusy(true);
    if (profile) {
      rememberGoogleAccount(profile);
    }

    const clean = profile?.email?.trim().toLowerCase() || "user@google.com";
    const displayName = profile?.name || clean.split("@")[0] || "Google User";
    const users = readJson<StoredUser[]>(K_USERS, []);
    let stored = users.find((x) => x.email.toLowerCase() === clean);
    if (!stored) {
      stored = {
        uid: `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
        name: displayName,
        email: clean,
        passHash: null,
        provider: "google",
        role: "analyst",
        createdAt: Date.now(),
        lastLogin: Date.now(),
      };
      users.push(stored);
    } else {
      stored.lastLogin = Date.now();
    }
    writeJson(K_USERS, users);

    const u: SessionUser = {
      uid: stored.uid,
      name: stored.name,
      email: stored.email,
      provider: "google",
      role: stored.role,
    };

    // ALWAYS persist user and session BEFORE OAuth redirect so the user stays in Dashboard!
    setUser(u);
    persistSession(u, "user");

    // Attempt Appwrite OAuth2 session binding
    try {
      account.createOAuth2Session(
        OAuthProvider.Google,
        window.location.origin,
        window.location.origin
      );
    } catch (apErr) {
      console.warn("Appwrite OAuth redirect error:", apErr);
    } finally {
      setBusy(false);
    }
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
