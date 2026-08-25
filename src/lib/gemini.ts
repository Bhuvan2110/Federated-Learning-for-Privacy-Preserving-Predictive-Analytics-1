/* ─────────────────────────────────────────────────────────────
 * FedShield — Google AI Studio (Gemini) assistant client & controller
 *
 *  • Google AI Studio REST endpoint (Gemini 2.5 Flash / Pro)
 *  • Website Navigation & Control Intent Resolver
 *  • Deep Dataset & Trained Model Summarization
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
  userEmail?: string;
  mode: string;
  page: PageId;
  runs: RunResult[];
  customCount?: number;
}

const K_GEMINI = "fedshield.gemini";
export const DEFAULT_KEY = "";

export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
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
  const keyCandidate = stored.apiKey || env.VITE_GEMINI_API_KEY || "";
  return {
    apiKey: keyCandidate.trim(),
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

/* ── Dataset & Trained Model Summarizers ─────────────────────── */

export function summarizeDatasets(userEmail?: string): string {
  const dsList = listDatasets(userEmail);
  if (dsList.length === 0) {
    return "No datasets are currently registered in the Dataset Vault.";
  }

  const lines = [
    `### 📊 Dataset Phase Summary (${dsList.length} Datasets Available)\n`,
  ];

  dsList.forEach((d, idx) => {
    const isCustom = d.id.startsWith("custom-");
    lines.push(
      `**${idx + 1}. ${d.name}** (\`${d.id}\`)` +
        (isCustom ? " — *Uploaded Custom CSV*" : ` — *${d.sector}*`)
    );
    lines.push(`• **Tag/Task**: ${d.tag}`);
    lines.push(`• **Sample Size**: ${d.nSamples.toLocaleString()} rows`);
    lines.push(`• **Positive Rate**: ${(d.positiveRate * 100).toFixed(1)}% (${d.positiveLabel} vs ${d.negativeLabel})`);
    lines.push(
      `• **Feature Schema (${d.features.length})**: ${d.features.map((f) => f.label).join(", ")}`
    );
    lines.push(`• **Description**: ${d.description}\n`);
  });

  return lines.join("\n");
}

export function summarizeTrainedModels(runs: RunResult[]): string {
  const completed = runs.filter((r) => r.status === "completed");
  if (completed.length === 0) {
    return "No trained models have been completed yet. Open the Training Lab to execute a federated training run!";
  }

  const lines = [
    `### 🤖 Trained Models & Federation Summary (${completed.length} Model${completed.length === 1 ? "" : "s"})\n`,
  ];

  completed.forEach((r, idx) => {
    lines.push(`**${idx + 1}. ${r.modelName}** (\`${r.id}\`)`);
    lines.push(`• **Dataset**: ${r.datasetId}`);
    lines.push(`• **Strategy/Algorithm**: ${r.algo.toUpperCase()}`);
    lines.push(
      `• **Performance**: Accuracy ${(r.final.accuracy * 100).toFixed(1)}% · F1 ${r.final.f1.toFixed(3)} · AUC ${r.final.auc.toFixed(3)}`
    );
    lines.push(
      `• **Federation Parameters**: ${r.config.nClients} client nodes · ${r.rounds.length} rounds · Dirichlet α=${r.config.alpha}`
    );
    lines.push(
      `• **Privacy & Security**: ${
        r.config.dp
          ? `(ε,δ)-DP Enabled (ε spent ${r.epsilonSpent.toFixed(1)}, clip norm C=${r.config.clipNorm})`
          : "No DP noise"
      } · ${r.config.secureAgg ? "Secure Aggregation active" : "Standard aggregation"}`
    );
    lines.push(`• **Trained At**: ${new Date(r.createdAt).toLocaleString()}\n`);
  });

  return lines.join("\n");
}

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
  const datasetsSummary = summarizeDatasets(ctx.userEmail);
  const modelsSummary = summarizeTrainedModels(ctx.runs);

  return [
    "You are the FedShield Copilot — an expert Google AI Studio voice & text agent embedded in the FedShield platform for Federated Learning with Privacy-Preserving Predictive Analytics.",
    "You can answer detailed questions, summarize datasets, summarize trained models, explain website pages, and control website navigation via voice & text commands.",
    "Web Navigation Control: You can navigate directly to pages: Overview, Training Lab, Prediction Console, Client Registry, Dataset Vault, Privacy Center, Predictive Analytics, and Training History.",
    `Active Session — User: ${ctx.userName} (${ctx.mode}); Active Page: ${ctx.page}; ${ctx.runs.length} total training run(s) stored.`,
    "\n--- LIVE DATASETS PHASE INVENTORY ---",
    datasetsSummary,
    "\n--- LIVE TRAINED MODELS INVENTORY ---",
    modelsSummary,
    "\nWebsite Page Structure:",
    "1. Overview: System stats, privacy budget, global model accuracy, convergence graph, client topology.",
    "2. Training Lab: Configure FedAvg/FedProx, rounds, clients, Dirichlet α, DP noise ε, and run FL simulation.",
    "3. Prediction: Single prediction (natural language & feature sliders) & Multiple predictions (batch CSV inference).",
    "4. Clients: Decentralized hospital/bank edge nodes registry and node status toggle.",
    "5. Datasets: Explore benchmark datasets or upload custom CSV datasets.",
    "6. Privacy Center: Differential privacy (ε, δ)-DP math, gradient clipping C, noise scale σ, and trade-offs.",
    "7. Analytics: Evaluation metrics, confusion matrix breakdown, ROC curve, precision/recall.",
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
        ? "Google AI Studio API key error — check your API key."
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

/* ── Comprehensive Local Knowledge Base Fallback ─────────── */

interface KbEntry {
  keys: string[];
  answer: (ctx: AgentContext) => string;
}

const KB: KbEntry[] = [
  {
    keys: ["summarize dataset", "dataset summary", "datasets phase", "uploaded dataset"],
    answer: (ctx) => summarizeDatasets(ctx.userEmail),
  },
  {
    keys: ["summarize trained", "trained dataset", "trained data", "model summary", "trained model"],
    answer: (ctx) => summarizeTrainedModels(ctx.runs),
  },
  {
    keys: ["cardio", "cardiovascular", "heart", "blood pressure"],
    answer: () =>
      `**Cardiovascular Risk Dataset (\`cardio\`):**
• **Sector**: Healthcare / Clinical Cardiology
• **Sample Count**: 6,000 clinical records across 4 hospital nodes
• **Key Features**: Age, Systolic BP, Total Cholesterol, BMI, Fasting Glucose, Smoking Status, Heart Rate
• **Target**: Cardiovascular Disease Risk (0: Normal, 1: High Risk)`,
  },
  {
    keys: ["credit", "financial", "loan", "bank", "credit score"],
    answer: () =>
      `**Credit Default Risk Dataset (\`credit\`):**
• **Sector**: Financial Services / Banking Consortium
• **Sample Count**: 5,000 applicant profiles across 4 banking institutions
• **Key Features**: Annual Income, Credit Score, Debt-to-Income (DTI), Loan Amount, Employment Length, Revolving Utilization
• **Target**: Default Probability (0: Creditworthy, 1: High Default Risk)`,
  },
  {
    keys: ["pages", "explain website", "features", "navigation", "overview", "lab", "privacy", "analytics", "history", "health"],
    answer: (ctx) =>
      `**FedShield Platform Navigation Guide:**
1. **Overview** (\`overview\`): Operations dashboard showing global accuracy, privacy budget spent (ε), and node topology.
2. **Training Lab** (\`lab\`): Configure & run FedAvg/FedProx training rounds, Dirichlet α skew, DP noise, and secure aggregation.
3. **Prediction** (\`predict\`): Natural language & feature sliders for single prediction + batch CSV inference for multiple predictions.
4. **Clients** (\`clients\`): Manage decentralized hospital/bank client nodes.
5. **Datasets** (\`datasets\`): Explore pre-loaded datasets or upload custom CSV datasets.
6. **Privacy Center** (\`privacy\`): Differential Privacy (ε, δ)-DP math, clipping bound C, noise scale σ.
7. **Analytics** (\`analytics\`): Confusion matrices, ROC curves, and precision-recall trade-offs.
8. **History** (\`history\`): View past training runs, export model JSON weights, and generate scannable QR code certificates.

*Currently viewing: \`${ctx.page}\`*`,
  },
];

export function localAnswer(question: string, ctx: AgentContext): string {
  const q = question.toLowerCase();

  if (/summariz(e|ing)\s+(all\s+)?dataset/.test(q) || /dataset\s+summary/.test(q)) {
    return summarizeDatasets(ctx.userEmail);
  }
  if (/summariz(e|ing)\s+(trained|model|run)/.test(q) || /trained\s+data/.test(q)) {
    return summarizeTrainedModels(ctx.runs);
  }

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
• **"Summarize Datasets"** — summarize all datasets in the dataset phase.
• **"Summarize Trained Models"** — summarize all trained models and performance.
• **"Open Datasets"** / **"Open Training Lab"** — direct navigation.
• **"Explain cardio dataset"** / **"Explain credit dataset"**`;
}
