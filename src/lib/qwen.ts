/* ─────────────────────────────────────────────────────────────
 * FedShield — Qwen3 assistant client
 *
 *  • OpenAI-compatible DashScope endpoint (Alibaba Cloud Qwen)
 *  • API key lives in localStorage or .env (VITE_QWEN_API_KEY) —
 *    never hard-coded in source
 *  • Streaming (SSE) with abort support
 *  • Offline fallback: a built-in knowledge base about federated
 *    learning + live platform state, so the assistant always answers
 * ───────────────────────────────────────────────────────────── */
import type { RunResult } from "./types";

export interface QwenSettings {
  apiKey: string;
  region: "intl" | "cn";
  model: string;
}

export interface AgentMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentContext {
  userName: string;
  mode: string;
  page: string;
  runs: RunResult[];
}

const K_QWEN = "fedshield.qwen";

export const QWEN_MODELS = [
  "qwen-plus",
  "qwen-turbo",
  "qwen-max",
  "qwen3-32b",
  "qwen3-14b",
  "qwen3-8b",
  "qwen3-4b",
];

const ENDPOINTS: Record<QwenSettings["region"], string> = {
  intl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  cn: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadQwenSettings(): QwenSettings {
  const stored = readJson<Partial<QwenSettings>>(K_QWEN, {});
  const env =
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return {
    apiKey: stored.apiKey ?? env.VITE_QWEN_API_KEY ?? "",
    region: stored.region ?? ((env.VITE_QWEN_REGION as QwenSettings["region"]) || "intl"),
    model: stored.model ?? env.VITE_QWEN_MODEL ?? "qwen-plus",
  };
}

export function saveQwenSettings(s: QwenSettings) {
  try {
    localStorage.setItem(K_QWEN, JSON.stringify(s));
  } catch {
    /* session-only */
  }
}

/* ── System prompt (live platform context) ────────────────── */

export function buildSystemPrompt(ctx: AgentContext): string {
  const latest = ctx.runs[0];
  const runSummary = latest
    ? `Latest training run: model "${latest.modelName}" on dataset ${latest.datasetId} using ${latest.algo.toUpperCase()}, ${
        latest.rounds.length
      } rounds, final accuracy ${(latest.final.accuracy * 100).toFixed(1)}%, F1 ${latest.final.f1.toFixed(
        3
      )}, AUC ${latest.final.auc.toFixed(3)}, ε spent ${latest.epsilonSpent.toFixed(1)} (DP ${
        latest.config.dp ? "enabled" : "disabled"
      }, secure aggregation ${latest.config.secureAgg ? "enabled" : "disabled"}).`
    : "No training runs have been executed yet in this session.";
  return [
    "You are the FedShield Copilot — an expert assistant embedded in the FedShield platform, a production-style web app for Federated Learning with Privacy-Preserving Predictive Analytics (a final-year university project).",
    "Answer questions about: federated learning (FedAvg, FedProx, non-IID data, communication rounds, partial participation), differential privacy (ε, δ, Gaussian mechanism, clipping, privacy budget, privacy-utility trade-off), secure aggregation, centralized vs federated ML, and how to use this platform (Training Lab, Prediction Console, Privacy Center, datasets, clients, guest mode).",
    "You have live access to the user's session state — use it when asked about their models or results.",
    `Session context — user: ${ctx.userName} (${ctx.mode}); current page: ${ctx.page}; ${ctx.runs.length} training run(s) stored. ${runSummary}`,
    "Style: concise, precise, technically accurate. Use short paragraphs or bullet points. When explaining math (e.g. σ = (2C/n)·√(2 ln(1.25/δ))/ε), write it inline. Never invent platform features that don't exist: the platform has Overview, Training Lab, Prediction, Clients, Datasets, Privacy Center, Analytics and History pages.",
  ].join("\n");
}

/* ── Streaming call ───────────────────────────────────────── */

export async function streamQwen(opts: {
  settings: QwenSettings;
  messages: AgentMsg[];
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const { settings, messages, signal, onDelta } = opts;
  const url = `${ENDPOINTS[settings.region]}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 700,
      }),
    });
  } catch (err) {
    if (signal.aborted) throw new Error("aborted");
    throw new Error("Network error — check your connection (DashScope must be reachable from this browser).");
  }
  if (!res.ok) {
    const hint =
      res.status === 401
        ? "Invalid API key — open the assistant settings (gear icon) and paste a valid DashScope key."
        : res.status === 429
        ? "Rate limit hit — wait a few seconds and try again."
        : res.status === 404
        ? `Model "${settings.model}" not available — try qwen-plus in the assistant settings.`
        : `DashScope responded with HTTP ${res.status}.`;
    throw new Error(hint);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming unsupported by this browser.");
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return full;
      try {
        const j = JSON.parse(payload);
        const delta: string = j.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* partial frame — skip */
      }
    }
  }
  return full;
}

/* ── Offline knowledge base (no API key needed) ───────────── */

interface KbEntry {
  keys: string[];
  answer: (ctx: AgentContext) => string;
}

const KB: KbEntry[] = [
  {
    keys: ["fedavg", "federated averaging", "how does federated learning work", "workflow", "aggregation"],
    answer: () =>
      "**How FedAvg works here** — each round: (1) the server broadcasts the global model wₜ; (2) each sampled client runs local SGD on its private rows for E epochs; (3) clients send only the weight delta Δwₖ (clipped to ‖Δwₖ‖ ≤ C); (4) the server computes the weighted average Δw = Σ (nₖ/n)·Δwₖ and updates wₜ₊₁ = wₜ + Δw. Raw data never leaves a client — you can verify this in the engine console: *raw rows transmitted: 0*.",
  },
  {
    keys: ["fedprox", "proximal", "heterogen"],
    answer: () =>
      "**FedProx** adds a proximal term μ/2·‖w − wₜ‖² to each client's local objective. It anchors drifting clients to the global model, which stabilizes training under strong non-IID data. Try it: Training Lab → set *Aggregation strategy* to FedProx and lower the Dirichlet α (e.g. 0.5) to create heavy label skew, then compare convergence against FedAvg.",
  },
  {
    keys: ["differential privacy", "epsilon", "gaussian", "noise", "privacy budget", "dp "],
    answer: () =>
      "**Differential privacy in FedShield** — every uploaded update is (1) clipped to L2 norm C, then (2) perturbed with Gaussian noise σ = (2C/n)·√(2 ln(1.25/δ))/ε per round. ε is the privacy budget: smaller ε → stronger privacy, more noise, slightly lower accuracy. The Privacy Center visualizes exactly this: drag ε and watch the noise distribution widen, and the trade-off frontier shows measured accuracy vs ε from your own runs.",
  },
  {
    keys: ["secure aggregation", "secagg", "mask"],
    answer: () =>
      "**Secure aggregation** — before uploading, each pair of clients (i, j) agrees on a shared random mask sᵢⱼ; client i adds Σⱼ sᵢⱼ to its update. Because masks cancel pairwise (Σᵢ Σⱼ sᵢⱼ = 0), the server learns only the *aggregate* — individual updates remain cryptographically hidden, even from the server. Toggle it in the Training Lab and watch the amber masking phase in the topology view.",
  },
  {
    keys: ["centralized", "baseline", "difference", "compare", "versus", "vs "],
    answer: (ctx) => {
      const r = ctx.runs[0];
      if (r && r.centralizedFinal)
        return `**Federated vs centralized** — centralized training pools all raw data on one server (simple, slightly higher accuracy: your last run got ${(
          r.centralizedFinal.accuracy * 100
        ).toFixed(1)}% centralized vs ${(r.final.accuracy * 100).toFixed(1)}% federated). Federated learning keeps raw rows on-device and transfers only noised model updates — essential under GDPR/HIPAA/bank-secrecy constraints. The gap you see is the *price of privacy*, usually 1–3 points with DP enabled.`;
      return "**Federated vs centralized** — centralized training pools all raw data on one server; federated learning trains on-device and shares only (clipped, noised, masked) model updates. Run a training session and the platform measures both on the same holdout set, so you can quantify the privacy-utility trade-off yourself.";
    },
  },
  {
    keys: ["non-iid", "non iid", "iid", "dirichlet", "skew"],
    answer: () =>
      "**Non-IID data** is the norm in real federations — each hospital/bank sees a skewed slice of the label distribution. FedShield simulates this with a Dirichlet(α) partition: lower α = stronger skew. Check the Clients page: each card shows its label balance and KL-divergence from the global distribution.",
  },
  {
    keys: ["guest", "demo mode", "skip"],
    answer: () =>
      "**Guest Mode** — 'Skip for now' grants full read + training access so you can demo the workflow instantly. What stays locked for guests: model/dataset exports, run deletion, and client-registry changes. Those require an email or Google account — a deliberate separation of trust tiers.",
  },
  {
    keys: ["api key", "qwen", "assistant", "agent", "configure"],
    answer: () =>
      "**Configuring me** — click the gear icon in this panel, paste a DashScope API key (Alibaba Cloud console → Model Studio → API-KEY), pick a region and model (qwen-plus is a good default), and save. Alternatively set VITE_QWEN_API_KEY in a .env file. Without a key I still answer from my built-in federated-learning knowledge base.",
  },
  {
    keys: ["predict", "prediction", "inference", "oracle"],
    answer: () =>
      "**Predictions** — open the Prediction page, pick a trained model from any field (Medical, Financial, Cybersecurity, Telecom, Energy), then either describe a case in plain language (e.g. *\"58yo, blood pressure 165, BMI 31\"*) or run a batch CSV. The console parses your text into the model's feature vector, flags any values it had to assume, and explains the result with top feature contributions.",
  },
  {
    keys: ["upload", "csv", "dataset", "my own data"],
    answer: () =>
      "**Using your own data** — Datasets page → *Upload CSV*. Pick the particular field (Medical, Financial, …), choose the label column (or auto-label by median threshold), and the rows are validated, z-score standardized and stored **locally in your browser only**. The dataset then appears in the Training Lab, and its trained model appears in that field's prediction registry.",
  },
  {
    keys: ["viva", "interview", "explain", "defense", "defend", "project about", "what is this"],
    answer: () =>
      "**Elevator pitch for your viva** — FedShield demonstrates that multiple organizations can jointly train a predictive model *without ever sharing raw data*: clients train locally, send differentially-private, securely-aggregated weight updates, and a server averages them (FedAvg/FedProx) into a global model. It measures the privacy-utility trade-off directly (federated vs centralized accuracy at each ε) and turns the resulting model into a field-specific prediction service. The stack: React + Tailwind frontend, a Firebase-compatible auth adapter, and an in-browser FL engine implementing DP-SGD-style clipping + Gaussian noise.",
  },
];

function scoreQuestion(q: string, entry: KbEntry): number {
  const s = q.toLowerCase();
  let score = 0;
  for (const k of entry.keys) if (s.includes(k)) score += k.length > 6 ? 2 : 1;
  return score;
}

export function localAnswer(question: string, ctx: AgentContext): string {
  const q = question.toLowerCase();
  const latest = ctx.runs[0];

  // Live-state questions first
  if (/(accuracy|accurate|how good|best model|my model|results?)/.test(q) && latest) {
    return `Your latest global model **${latest.modelName}** (${latest.algo.toUpperCase()}, ${
      latest.rounds.length
    } rounds) reached **${(latest.final.accuracy * 100).toFixed(1)}% accuracy**, F1 ${latest.final.f1.toFixed(
      3
    )}, AUC ${latest.final.auc.toFixed(3)} on the holdout set${
      latest.centralizedFinal
        ? ` — vs ${(latest.centralizedFinal.accuracy * 100).toFixed(1)}% for the centralized baseline`
        : ""
    }. ${ctx.runs.length} run(s) total are stored in History.`;
  }
  if (/(privacy|epsilon|ε|budget)/.test(q) && /(spend|spent|left|remaining|used|much)/.test(q) && latest) {
    return `This session has consumed **ε = ${latest.epsilonSpent.toFixed(1)}** of the 24 ε platform budget across ${
      latest.rounds.length
    } rounds (${latest.config.dp ? `${latest.config.epsilonPerRound} ε/round with DP enabled` : "DP was disabled for that run"}). Full ledger is on the Privacy Center page.`;
  }
  if (/(how many|number of).*(client|node)/.test(q) && latest) {
    return `The last federation enrolled **${latest.config.nClients} clients** with ${Math.round(
      latest.config.participation * 100
    )}% participation per round, split non-IID with Dirichlet α = ${latest.config.alpha}. See per-client label skew on the Clients page.`;
  }

  let best: KbEntry | null = null;
  let bestScore = 0;
  for (const e of KB) {
    const s = scoreQuestion(q, e);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  if (best) return best.answer(ctx);

  return `I can help with anything on this platform and the theory behind it — federated learning (FedAvg/FedProx), differential privacy (ε, δ, Gaussian noise), secure aggregation, non-IID data, centralized-vs-federated comparisons, and how to use each page. For open-ended questions beyond that, add a **Qwen API key** via the gear icon in this panel (or VITE_QWEN_API_KEY in .env) and I'll answer with the full Qwen3 model. Try: *"Explain the privacy-utility trade-off"* or *"What's my best model?"*`;
}
