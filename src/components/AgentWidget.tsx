/* FedShield — Google AI Studio Agent Widget (bottom-right side)
 * Powered by Google AI Studio API.
 * Includes Model Selector (Gemini 2.5 Flash, 2.5 Pro, 3.6 Flash, 3.5 Flash, 1.5 Flash, 1.5 Pro),
 * Voice Control (Speech-to-Text & Text-to-Speech), Direct Page Navigation,
 * Dataset Phase Summarizer, and Trained Models Summarizer. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useApp } from "../lib/store";
import {
  buildSystemPrompt,
  loadGeminiSettings,
  localAnswer,
  resolveNavigationIntent,
  saveGeminiSettings,
  streamGemini,
  summarizeDatasets,
  summarizeTrainedModels,
  GEMINI_MODELS,
} from "../lib/gemini";
import type { AgentMsg, GeminiSettings } from "../lib/gemini";
import { cn } from "./ui";
import { IconGear, IconKey, IconLogo, IconMic, IconSend, IconSparkle, IconStop, IconX } from "./icons";

const K_CHAT = "fedshield.agentChat";

interface UiMsg extends AgentMsg {
  id: string;
  streaming?: boolean;
  note?: string;
}

const SUGGESTIONS = [
  "📊 Summarize Datasets",
  "🤖 Summarize Trained Data",
  "📂 Open Datasets",
  "🔬 Open Training Lab",
  "🔮 Open Prediction",
  "🛡️ Open Privacy",
];

function renderRich(text: string) {
  return text.split("\n").map((line, i) => {
    const parts: (string | JSX.Element)[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = regex.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**"))
        parts.push(
          <strong key={k++} className="text-fog-50 font-semibold">
            {tok.slice(2, -2)}
          </strong>
        );
      else if (tok.startsWith("`"))
        parts.push(
          <code key={k++} className="px-1 py-0.5 rounded bg-ink-950 border border-line font-mono text-[11.5px] text-signal-300">
            {tok.slice(1, -1)}
          </code>
        );
      else parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
      last = m.index + tok.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <span key={i} className="block min-h-[1em]">
        {parts}
      </span>
    );
  });
}

export default function AgentWidget() {
  const { user } = useAuth();
  const { runs, page, setPage, seeding, customCount } = useApp();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<GeminiSettings>(() => loadGeminiSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState({ ...loadGeminiSettings() });
  const [speakAnswers, setSpeakAnswers] = useState(true);
  const [msgs, setMsgs] = useState<UiMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(K_CHAT) ?? "[]") as UiMsg[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const recognitionRef = useRef<unknown>(null);

  const hasKey = settings.apiKey.trim().length > 0;

  useEffect(() => {
    try {
      localStorage.setItem(K_CHAT, JSON.stringify(msgs.slice(-40).map((m) => ({ ...m, streaming: false }))));
    } catch {
      /* quota */
    }
  }, [msgs]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, open, busy]);

  const ctx = {
    userName: user?.name ?? "guest",
    userEmail: user?.email,
    mode: user?.role === "guest" ? "guest mode" : `${user?.provider ?? "email"} account`,
    page,
    runs,
    customCount,
  };

  // Text-to-Speech helper for speaking AI answers
  const speakText = useCallback(
    (text: string) => {
      if (!speakAnswers || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const clean = text.replace(/[*#`_$\\]/g, "").slice(0, 260);
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* speech synthesis best effort */
      }
    },
    [speakAnswers]
  );

  const switchModel = (newModel: string) => {
    const updated = { ...settings, model: newModel };
    saveGeminiSettings(updated);
    setSettings(updated);
  };

  const ask = useCallback(
    async (text: string) => {
      const rawText = text.trim();
      if (!rawText || busy || seeding) return;

      // Handle specific quick action prompts
      const lower = rawText.toLowerCase();

      // Check if dataset summary requested
      if (lower.includes("summarize dataset") || lower.includes("summarise dataset")) {
        setInput("");
        const summary = summarizeDatasets(user?.email);
        const userMsg: UiMsg = { id: `u${idRef.current++}`, role: "user", content: rawText };
        const botMsg: UiMsg = {
          id: `b${idRef.current++}`,
          role: "assistant",
          content: summary,
          note: `Google AI Studio · ${settings.model} (Datasets Phase Summary)`,
        };
        setMsgs((prev) => [...prev, userMsg, botMsg]);
        speakText("Here is the summary of all registered datasets in the platform.");
        return;
      }

      // Check if trained models summary requested
      if (lower.includes("summarize trained") || lower.includes("summarise trained") || lower.includes("summarize model")) {
        setInput("");
        const summary = summarizeTrainedModels(runs);
        const userMsg: UiMsg = { id: `u${idRef.current++}`, role: "user", content: rawText };
        const botMsg: UiMsg = {
          id: `b${idRef.current++}`,
          role: "assistant",
          content: summary,
          note: `Google AI Studio · ${settings.model} (Trained Models Summary)`,
        };
        setMsgs((prev) => [...prev, userMsg, botMsg]);
        speakText("Here is the summary of all trained models and federation runs.");
        return;
      }

      // Detect website control / navigation voice command
      const targetPage = resolveNavigationIntent(rawText);
      if (targetPage) {
        setPage(targetPage);
      }

      setInput("");
      const userMsg: UiMsg = { id: `u${idRef.current++}`, role: "user", content: rawText };
      const botId = `b${idRef.current++}`;
      setMsgs((prev) => [...prev, userMsg, { id: botId, role: "assistant", content: "", streaming: true }]);
      setBusy(true);

      const patch = (content: string, streaming: boolean, note?: string) =>
        setMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, content, streaming, note } : m)));

      const s = loadGeminiSettings();
      if (s.apiKey.trim()) {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const history: AgentMsg[] = [
          ...msgs.filter((m) => !m.streaming).map(({ role, content }) => ({ role, content })),
          { role: "user" as const, content: rawText },
        ];
        let acc = "";
        try {
          await streamGemini({
            settings: s,
            messages: [{ role: "system", content: buildSystemPrompt(ctx) } as AgentMsg, ...history],
            signal: ctrl.signal,
            onDelta: (d) => {
              acc += d;
              patch(acc, true);
            },
          });
          const noteText = targetPage
            ? `Google AI Studio · Navigated to ${targetPage}`
            : `Google AI Studio · ${s.model}`;
          patch(acc || "(empty response)", false, noteText);
          speakText(acc);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Request failed.";
          if (msg === "aborted") patch(acc || "— stopped —", false, "stopped");
          else {
            const fb = localAnswer(rawText, ctx);
            patch(fb, false, `AI Studio note: ${msg} (using local knowledge base)`);
            speakText(fb);
          }
        } finally {
          abortRef.current = null;
          setBusy(false);
        }
      } else {
        // Local knowledge base fallback
        await new Promise((r) => setTimeout(r, 400));
        if (abortRef.current?.signal.aborted) {
          patch("— stopped —", false);
        } else {
          const fb = localAnswer(rawText, ctx);
          const noteText = targetPage
            ? `Local Mode · Navigated to ${targetPage}`
            : "Google AI Studio local mode";
          patch(fb, false, noteText);
          speakText(fb);
        }
        setBusy(false);
      }
    },
    [busy, seeding, msgs, ctx, setPage, speakText, user, runs, settings.model]
  );

  const stop = () => {
    abortRef.current?.abort();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const saveSettings = () => {
    saveGeminiSettings(draft);
    setSettings(draft);
    setSettingsOpen(false);
  };

  const clearChat = () => setMsgs([]);

  // Voice Input (Speech-to-Text) handler
  const toggleVoiceInput = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is supported in Google Chrome, Microsoft Edge, and Safari.");
      return;
    }

    if (listening) {
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
      }
      setListening(false);
      return;
    }

    try {
      const rec = new (SpeechRecognition as new () => {
        continuous: false;
        interimResults: true;
        lang: string;
        start: () => void;
        stop: () => void;
        onstart: () => void;
        onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void;
        onend: () => void;
      })();

      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setListening(true);
      };

      rec.onresult = (e) => {
        const transcript = Array.from(e.results)
          .map((result) => result[0].transcript)
          .join("");
        setInput(transcript);
      };

      rec.onerror = () => {
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <>
      {/* Floating launcher positioned in BOTTOM-RIGHT side */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-xl shadow-black/50",
          open
            ? "bg-ink-800 border border-line text-fog-300 rotate-90"
            : "bg-signal-500 text-ink-950 hover:bg-signal-400 hover:scale-105 active:scale-95"
        )}
        title="Google AI Studio Voice & Controller Agent"
        aria-label="Toggle AI assistant"
      >
        {open ? <IconX width={22} height={22} /> : <IconSparkle width={24} height={24} />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-signal-400 border-2 border-ink-950 flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-ink-950" />
          </span>
        )}
        {!open && <span className="absolute inset-0 rounded-2xl border border-signal-500/60 animate-ping opacity-20 pointer-events-none" />}
      </button>

      {/* Panel positioned in BOTTOM-RIGHT side */}
      {open && (
        <div
          className="fixed bottom-[86px] right-5 z-50 w-[min(410px,calc(100vw-30px))] h-[min(600px,calc(100dvh-120px))] flex flex-col panel shadow-2xl shadow-black/70 reveal overflow-hidden"
          style={{ ["--d" as string]: "0ms" }}
        >
          {/* Header with Model Selector */}
          <header className="flex items-center gap-2 px-3.5 py-2.5 border-b border-line-soft bg-ink-900/80 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center shrink-0">
              <IconLogo width={17} height={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-[13.5px] text-fog-50 leading-none">Google AI Studio Agent</div>
              {/* Dynamic Model Dropdown */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-500 shrink-0" />
                <select
                  value={settings.model}
                  onChange={(e) => switchModel(e.target.value)}
                  className="bg-ink-950 border border-line-soft rounded px-1.5 py-0.5 text-[10px] font-mono text-signal-300 outline-none focus:border-signal-500 cursor-pointer"
                  title="Select Google AI Studio Model"
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Voice Speech Output Toggle */}
            <button
              onClick={() => {
                setSpeakAnswers(!speakAnswers);
                if (speakAnswers && typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
              }}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-[12px]",
                speakAnswers ? "bg-signal-500/20 text-signal-300 border border-signal-500/40" : "text-fog-500 hover:bg-ink-800"
              )}
              title={speakAnswers ? "Voice Answers Enabled (Click to Mute)" : "Voice Answers Muted (Click to Unmute)"}
            >
              {speakAnswers ? "🔊" : "🔇"}
            </button>

            <button
              onClick={() => {
                setDraft(loadGeminiSettings());
                setSettingsOpen((v) => !v);
              }}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                settingsOpen ? "bg-signal-500/15 text-signal-300" : "text-fog-500 hover:text-fog-200 hover:bg-ink-800"
              )}
              title="API Key & Assistant Settings"
            >
              <IconGear width={15} height={15} />
            </button>

            <button
              onClick={clearChat}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-fog-500 hover:text-rose-300 hover:bg-ink-800 transition-colors"
              title="Clear conversation"
            >
              <IconX width={14} height={14} />
            </button>
          </header>

          {/* Settings Sub-panel */}
          {settingsOpen && (
            <div className="px-4 py-3 border-b border-line-soft bg-ink-900/90 space-y-3 shrink-0 reveal" style={{ ["--d" as string]: "0ms" }}>
              <div>
                <label className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 flex items-center gap-1.5 mb-1">
                  <IconKey width={12} height={12} /> Google AI Studio API Key
                </label>
                <input
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  placeholder="AQ.… (Google AI Studio API Key)"
                  className="w-full bg-ink-950 border border-line rounded-lg px-3 py-1.5 text-[12px] font-mono text-fog-100 placeholder:text-fog-600 outline-none focus:border-signal-600"
                />
              </div>
              <div>
                <label className="block">
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 block mb-1">Google AI Studio Model</span>
                  <select
                    value={draft.model}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    className="w-full bg-ink-950 border border-line rounded-lg px-2.5 py-1.5 text-[12px] font-mono text-fog-200 outline-none focus:border-signal-600"
                  >
                    {GEMINI_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={saveSettings}
                  className="px-3 py-1 rounded-lg bg-signal-500 text-ink-950 text-[11.5px] font-semibold hover:bg-signal-400 transition-colors"
                >
                  Save Settings
                </button>
                <span className="text-[10px] font-mono text-fog-500">
                  Key: <code className="text-signal-300">AQ.Ab8R…</code>
                </span>
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3">
            {msgs.length === 0 && (
              <div className="text-center pt-5">
                <span className="inline-flex w-11 h-11 rounded-2xl bg-signal-500/10 border border-signal-500/35 text-signal-400 items-center justify-center mb-2.5">
                  <IconSparkle width={20} height={20} />
                </span>
                <p className="font-display font-semibold text-fog-100 text-[14px]">Google AI Studio Agent</p>
                <p className="text-[11.5px] text-fog-400 mt-1 leading-relaxed px-2">
                  Summarize uploaded datasets, analyze trained models, or navigate between pages using text or voice!
                </p>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[88%]", m.role === "user" && "text-right")}>
                  <div
                    className={cn(
                      "inline-block text-left rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                      m.role === "user"
                        ? "bg-signal-500/15 border border-signal-500/40 text-fog-100 rounded-br-sm"
                        : "bg-ink-800/90 border border-line text-fog-200 rounded-bl-sm"
                    )}
                  >
                    {m.content ? renderRich(m.content) : m.streaming ? <TypingDots /> : null}
                  </div>
                  {m.note && !m.streaming && (
                    <div className="text-[9.5px] font-mono text-fog-600 mt-1 px-1">{m.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Action Suggestions */}
          <div className="px-3 pb-2 flex gap-1 flex-wrap shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="px-2 py-0.5 rounded-full border border-line text-[10.5px] text-fog-400 hover:text-signal-300 hover:border-signal-600 transition-colors disabled:opacity-40 bg-ink-950/60"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input & Voice Controls */}
          <div className="p-3 border-t border-line-soft bg-ink-900/80 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                rows={1}
                placeholder={
                  listening
                    ? "Listening... speak command now..."
                    : hasKey
                    ? `Speak or type (${settings.model})…`
                    : "Speak or type command…"
                }
                className={cn(
                  "flex-1 resize-none bg-ink-950 border rounded-xl px-3 py-2 text-[12.5px] text-fog-100 placeholder:text-fog-600 outline-none transition-colors max-h-24",
                  listening ? "border-rose-500/80 bg-rose-500/5 placeholder:text-rose-400 font-medium" : "border-line focus:border-signal-600"
                )}
              />

              {/* Voice input button */}
              <button
                onClick={toggleVoiceInput}
                type="button"
                className={cn(
                  "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-all border",
                  listening
                    ? "bg-rose-500/20 border-rose-500/60 text-rose-300 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                    : "bg-ink-950 border-line text-fog-400 hover:text-signal-300 hover:border-signal-600"
                )}
                title={listening ? "Listening... click to stop" : "Voice input (Speak your command)"}
              >
                <IconMic width={15} height={15} />
              </button>

              {busy ? (
                <button
                  onClick={stop}
                  className="w-9 h-9 shrink-0 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center justify-center hover:bg-rose-500/25 transition-colors"
                  title="Stop response"
                >
                  <IconStop width={15} height={15} />
                </button>
              ) : (
                <button
                  onClick={() => ask(input)}
                  disabled={!input.trim()}
                  className="w-9 h-9 shrink-0 rounded-xl bg-signal-500 text-ink-950 flex items-center justify-center hover:bg-signal-400 transition-all disabled:opacity-35 disabled:pointer-events-none active:scale-95"
                  title="Send message"
                >
                  <IconSend width={15} height={15} />
                </button>
              )}
            </div>
            <div className="text-[9px] font-mono text-fog-600 mt-1.5 px-1 flex justify-between items-center">
              <span>
                {listening ? "🎙️ Listening…" : `Google AI Studio (${settings.model})`}
              </span>
              <span>{speakAnswers ? "🔊 Audio On" : "🔇 Muted"}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-signal-400 animate-bounce" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}
