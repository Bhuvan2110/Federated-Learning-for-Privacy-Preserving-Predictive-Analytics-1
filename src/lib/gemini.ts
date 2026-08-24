/* ─────────────────────────────────────────────────────────────
 * FedShield — Google AI Studio (Gemini) assistant client & controller
 *
 *  • Google AI Studio REST endpoint (Gemini 2.5 Flash / Pro)
 *  • Website Navigation & Control Intent Resolver
 *  • Deep Dataset Knowledge & Page Explanations
 *  • Offline fallback knowledge base + session context
 * ───────────────────────────────────────────────────────────── */
import type { PageId, RunResult } from "./types";
import { listDatasets } from "./datasets";

export interface GeminiSettings {
  apiKey: string;
  model: string;
}

export interface AgentMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentContext {
  userName: string;
  mode: string;
  page: PageId;
  runs: RunResult[];
  customCount?: number;
}

const K_GEMINI = "fedshield.gemini";
const DEFAULT_KEY = "";

export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-1.5-flash",
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadGeminiSettings(): GeminiSettings {
  const stored = readJson<Partial<GeminiSettings>>(K_GEMINI, {});
  const env =
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return {
    apiKey: stored.apiKey ?? env.VITE_GEMINI_API_KEY ?? DEFAULT_KEY,
    model: stored.model ?? env.VITE_GEMINI_MODEL ?? "gemini-2.5-flash",
  };
}

export function saveGeminiSettings(s: GeminiSettings) {
  try {
    localStorage.setItem(K_GEMINI, JSON.stringify(s));
  } catch {
    /* session-only */
  }
}

/* ── Backward compatibility aliases ── */
export type QwenSettings = GeminiSettings;
export const QWEN_MODELS = GEMINI_MODELS;
export const loadQwenSettings = loadGeminiSettings;
export const saveQwenSettings = saveGeminiSettings;

/* ── Navigation Intent Resolver (Website Control) ────────────── */

export function resolveNavigationIntent(input: string): PageId | null {
  const text = input.toLowerCase().trim();
  
  if (/go to (training|lab)|open (training|lab)|show (training|lab)|start training/.test(text)) {
    return "lab";
  }
  if (/go to (dataset|datasets)|open (dataset|datasets)|show (dataset|datasets)|data vault/.test(text)) {
    return "datasets";
  }
  if (/go to (privacy|privacy center)|open (privacy|privacy center)|show privacy/.test(text)) {
    return "privacy";
  }
  if (/go to (history|runs)|open (history|runs)|show history|training history/.test(text)) {
    return "history";
  }
  if (/go to (prediction|predict)|open (prediction|predict)|show (prediction|predict)/.test(text)) {
    return "predict";
  }
  if (/go to (client|clients)|open (client|clients)|show (client|clients)|nodes/.test(text)) {
    return "clients";
  }
  if (/go to (analytics|metrics)|open (analytics|metrics)|show analytics/.test(text)) {
    return "analytics";
  }
  if (/go to (overview|dashboard|home)|open (overview|dashboard)|show overview/.test(text)) {
    return "overview";
  }
  
  return null;
}

/* ── System prompt (live platform context + full knowledge) ──── */

export function buildSystemPrompt(ctx: AgentContext): string {
  const datasetsInfo = listDatasets()
    .map((d) => `• ${d.name} (${d.sector}): ${d.nSamples} rows, features: [${d.features.map((f) => f.key).join(", ")}]`)
    .join("\n");

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
    "You are the FedShield Copilot — an expert Google AI Studio voice & text agent embedded in the FedShield platform for Federated Learning with Privacy-Preserving Predictive Analytics.",
    "You can answer detailed questions, explain datasets, explain website pages, and control website navigation via voice commands.",
    "Web Navigation Control: You can navigate between pages: Overview, Training Lab, Prediction Console, Client Registry, Dataset Vault, Privacy Center, Predictive Analytics, and Training History.",
    `Session state — user: ${ctx.userName} (${ctx.mode}); active page: ${ctx.page}; ${ctx.runs.length} training run(s) stored. ${runSummary}`,
    "Available Platform Datasets:\n" + datasetsInfo,
    "Website Page Structure:\n" +
      "1. Overview: System stats, privacy budget, global model accuracy, convergence graph, client topology.\n" +
      "2. Training Lab: Configure FedAvg/FedProx, rounds, clients, Dirichlet α, DP noise ε, and run FL simulation.\n" +
      "3. Prediction: Query trained models with natural language or custom field inputs.\n" +
      "4. Clients: Decentralized hospital/bank edge nodes registry and node status toggle.\n" +
      "5. Datasets: Explore benchmark datasets or upload custom CSV datasets.\n" +
      "6. Privacy Center: Differential privacy (ε, δ)-DP math, gradient clipping C, noise scale σ, and trade-offs.\n" +
      "7. Analytics: Evaluation metrics, confusion matrix breakdown, ROC curve, precision/recall.\n" +
      "8. History: Audit history of completed runs, JSON weight artifact download, and scannable QR code certificates.",
    "Style: concise, clear, and encouraging. Perfect for text and voice-to-speech output.",
  ].join("\n");
}

/* ── Streaming call via Google AI Studio API ──────────────── */

export async function streamGemini(opts: {
  settings: GeminiSettings;
  messages: AgentMsg[];
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const { settings, messages, signal, onDelta } = opts;
  const apiKey = settings.apiKey.trim() || DEFAULT_KEY;
  const model = settings.model.trim() || "gemini-2.5-flash";

  const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const systemMsg = messages.find((m) => m.role === "system");
  const conversationMsgs = messages.filter((m) => m.role !== "system");

  const contents = conversationMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const reqBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  };

  if (systemMsg) {
    reqBody.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  let res: Response;
  try {
    res = await fetch(nativeUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });
  } catch (err) {
    if (signal.aborted) throw new Error("aborted");
    throw new Error("Network connection error to Google AI Studio.");
  }

  if (!res.ok) {
    const openaiUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
    try {
      res = await fetch(openaiUrl, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });
    } catch (err) {
      if (signal.aborted) throw new Error("aborted");
    }
  }

  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? "Google AI Studio API key error — click gear icon to update key."
        : res.status === 429
        ? "Rate limit hit — please wait a moment."
        : `Google AI Studio responded with HTTP ${res.status}.`;
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
        const geminiDelta = j.candidates?.[0]?.content?.parts?.[0]?.text;
        const openaiDelta = j.choices?.[0]?.delta?.content;
        const delta = geminiDelta ?? openaiDelta ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* skip partial frame */
      }
    }
  }
  return full;
}

export const streamQwen = streamGemini;

/* ── Comprehensive Knowledge Base ─────────────────────────── */

interface KbEntry {
  keys: string[];
  answer: (ctx: AgentContext) => string;
}

const KB: KbEntry[] = [
  {
    keys: ["cardio", "cardiovascular", "heart", "blood pressure"],
    answer: () =>
      `**Cardiovascular Risk Dataset (\`cardio\`):**
• **Sector**: Healthcare / Clinical Cardiology
• **Sample Count**: 1,000 clinical records across 4 hospital nodes
• **Key Features**: Age, Systolic BP, Total Cholesterol, BMI, Fasting Glucose, Smoking Status, Heart Rate
• **Target**: Cardiovascular Disease Risk (0: Normal, 1: High Risk)
• **Federation Setup**: Simulates hospital sites with heterogeneous patient demographics. Hospital A has older high-risk cohorts, while Hospital B has screening cohorts.`,
  },
  {
    keys: ["credit", "financial", "loan", "bank", "credit score"],
    answer: () =>
      `**Credit Default Risk Dataset (\`credit\`):**
• **Sector**: Financial Services / Banking Consortium
• **Sample Count**: 1,200 applicant profiles across 4 banking institutions
• **Key Features**: Annual Income, Credit Score, Debt-to-Income (DTI), Loan Amount, Employment Length, Revolving Utilization
• **Target**: Default Probability (0: Creditworthy, 1: High Default Risk)
• **Federation Setup**: Banks train a global credit model without sharing sensitive borrower financial statements.`,
  },
  {
    keys: ["icu", "sepsis", "hospital", "critical care"],
    answer: () =>
      `**ICU Sepsis Early Warning Dataset (\`icu\`):**
• **Sector**: Critical Care / Emergency Medicine
• **Sample Count**: 850 ICU vital monitoring records
• **Key Features**: Heart Rate, Respiratory Rate, Temperature, White Blood Cell Count, Lactate Level, Mean Arterial Pressure
• **Target**: Sepsis Onset (0: Stable, 1: High Risk Sepsis)
• **Federation Setup**: Real-time early warning model aggregated across regional ICU networks.`,
  },
  {
    keys: ["churn", "telecom", "customer"],
    answer: () =>
      `**Customer Churn Dataset (\`churn\`):**
• **Sector**: Telecom & Subscription Services
• **Sample Count**: 1,500 subscriber profiles across 5 regional operators
• **Key Features**: Tenure Months, Monthly Charges, Total Charges, Support Tickets, Contract Length
• **Target**: Subscription Cancellation (0: Retained, 1: Churn Risk).`,
  },
  {
    keys: ["smartgrid", "energy", "grid", "voltage"],
    answer: () =>
      `**Smart Grid Outage Dataset (\`smartgrid\`):**
• **Sector**: Energy & Public Utilities
• **Sample Count**: 900 substation grid sensor readings
• **Key Features**: Voltage Fluctuation, Transformer Temp, Peak Load Ratio, Harmonic Distortion
• **Target**: Failure Risk (0: Normal, 1: Outage Risk).`,
  },
  {
    keys: ["pages", "explain website", "features", "navigation", "overview", "lab", "privacy", "analytics", "history"],
    answer: (ctx) =>
      `**FedShield Platform Navigation Guide:**
1. **Overview** (\`overview\`): Operations dashboard showing global accuracy, privacy budget spent (ε), and node topology.
2. **Training Lab** (\`lab\`): Configure & run FedAvg/FedProx training rounds, Dirichlet α skew, DP noise, and secure aggregation.
3. **Prediction** (\`predict\`): Natural language query and custom input inference console.
4. **Clients** (\`clients\`): Manage decentralized hospital/bank client nodes.
5. **Datasets** (\`datasets\`): Explore pre-loaded datasets or upload custom CSV datasets.
6. **Privacy Center** (\`privacy\`): Differential Privacy (ε, δ)-DP math, clipping bound C, noise scale σ.
7. **Analytics** (\`analytics\`): Confusion matrices, ROC curves, and precision-recall trade-offs.
8. **History** (\`history\`): View past training runs, export model JSON weights, and generate scannable QR code certificates.

*Currently viewing: \`${ctx.page}\`*`,
  },
  {
    keys: ["fedavg", "federated averaging"],
    answer: (ctx) =>
      `**Federated Averaging (FedAvg)** aggregates local weights $w_i^t$ into global weights $w^{t+1} = \\sum_{i=1}^K \\frac{n_i}{N} w_i^t$. Raw training rows never leave client devices.

*Session state:* ${ctx.runs.length} run(s) recorded.`,
  },
];

export function localAnswer(question: string, ctx: AgentContext): string {
  const q = question.toLowerCase();
  for (const entry of KB) {
    if (entry.keys.some((k) => q.includes(k))) {
      return entry.answer(ctx);
    }
  }
  return `**Google AI Studio Copilot Response:**

I am connected to the **FedShield Federated Analytics Platform**.

• **Active Page**: \`${ctx.page}\`
• **User**: ${ctx.userName} (${ctx.mode})
• **Runs in session**: ${ctx.runs.length}

You can ask me to:
• **"Go to Training Lab"** or **"Show Datasets"** (Voice/text navigation)
• **"Explain cardio dataset"** or **"Explain credit dataset"**
• **"Explain the website pages"**
• **"Explain differential privacy and FedAvg"**`;
}
