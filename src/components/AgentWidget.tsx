/* FedShield — Google AI Studio Agent Widget (bottom-left)
 * Includes Voice Control (Speech-to-Text & Text-to-Speech), Website Navigation
 * Execution, and Deep Dataset / Page Explanations. */
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
  "Go to Training Lab",
  "Explain cardio dataset",
  "Explain credit dataset",
  "Open Privacy Center",
  "Explain website pages",
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

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy || seeding) return;

      // Detect website control / navigation voice command
      const targetPage = resolveNavigationIntent(question);
      if (targetPage) {
        setPage(targetPage);
      }

      setInput("");
      const userMsg: UiMsg = { id: `u${idRef.current++}`, role: "user", content: question };
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
          { role: "user" as const, content: question },
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
            const fb = localAnswer(question, ctx);
            patch(fb, false, `AI Studio note: ${msg} (using local knowledge base)`);
            speakText(fb);
          }
        } finally {
          abortRef.current = null;
          setBusy(false);
        }
      } else {
        // Local knowledge base fallback
        await new Promise((r) => setTimeout(r, 550));
        if (abortRef.current?.signal.aborted) {
          patch("— stopped —", false);
        } else {
          const fb = localAnswer(question, ctx);
          const noteText = targetPage
            ? `Local Mode · Navigated to ${targetPage}`
            : "Google AI Studio local mode";
          patch(fb, false, noteText);
          speakText(fb);
        }
        setBusy(false);
      }
    },
    [busy, seeding, msgs, ctx, setPage, speakText]
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
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-5 left-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-xl shadow-black/50",
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

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-[86px] left-5 z-50 w-[min(384px,calc(100vw-40px))] h-[min(580px,calc(100dvh-130px))] flex flex-col panel shadow-2xl shadow-black/60 reveal overflow-hidden"
          style={{ ["--d" as string]: "0ms" }}
        >
          {/* header */}
          <header className="flex items-center gap-2.5 px-4 py-3 border-b border-line-soft bg-ink-900/60 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-signal-500/12 border border-signal-500/40 text-signal-400 flex items-center justify-center shrink-0">
              <IconLogo width={17} height={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-[14px] text-fog-50 leading-none">Google AI Studio Agent</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn("w-1.5 h-1.5 rounded-full", hasKey ? "bg-signal-500" : "bg-ember-400")} />
                <span className="text-[10.5px] font-mono text-fog-500 truncate">
                  {hasKey ? `Voice Controller · ${settings.model}` : "local knowledge mode"}
                </span>
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
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-[13px]",
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
              className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors", settingsOpen ? "bg-signal-500/15 text-signal-300" : "text-fog-500 hover:text-fog-200 hover:bg-ink-800")}
              title="Assistant settings / API key"
            >
              <IconGear width={16} height={16} />
            </button>
            <button onClick={clearChat} className="w-8 h-8 rounded-lg flex items-center justify-center text-fog-500 hover:text-rose-300 hover:bg-ink-800 transition-colors" title="Clear conversation">
              <IconX width={15} height={15} />
            </button>
          </header>

          {/* settings */}
          {settingsOpen && (
            <div className="px-4 py-3.5 border-b border-line-soft bg-ink-900/80 space-y-3 shrink-0 reveal" style={{ ["--d" as string]: "0ms" }}>
              <div>
                <label className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 flex items-center gap-1.5 mb-1.5">
                  <IconKey width={12} height={12} /> Google AI Studio API Key
                </label>
                <input
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  placeholder="AQ.…  (Google AI Studio API Key)"
                  className="w-full bg-ink-950 border border-line rounded-lg px-3 py-2 text-[12.5px] font-mono text-fog-100 placeholder:text-fog-600 outline-none focus:border-signal-600"
                />
              </div>
              <div>
                <label className="block">
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500 block mb-1.5">Gemini Model</span>
                  <select
                    value={draft.model}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    className="w-full bg-ink-950 border border-line rounded-lg px-2.5 py-2 text-[12.5px] font-mono text-fog-200 outline-none focus:border-signal-600"
                  >
                    {GEMINI_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveSettings}
                  className="px-3 py-1.5 rounded-lg bg-signal-500 text-ink-950 text-[12px] font-semibold hover:bg-signal-400 transition-colors"
                >
                  Save key
                </button>
                <span className="text-[10.5px] font-mono text-fog-600 leading-snug">
                  Get keys at <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-signal-400 underline">aistudio.google.com</a>
                </span>
              </div>
            </div>
          )}

          {/* messages */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
            {msgs.length === 0 && (
              <div className="text-center pt-6">
                <span className="inline-flex w-12 h-12 rounded-2xl bg-signal-500/10 border border-signal-500/35 text-signal-400 items-center justify-center mb-3">
                  <IconSparkle width={22} height={22} />
                </span>
                <p className="font-display font-semibold text-fog-100 text-[14.5px]">Voice Control & AI Assistant</p>
                <p className="text-[12px] text-fog-500 mt-1 leading-relaxed px-4">
                  Speak or type to navigate website pages, explain datasets (Cardio, Credit, ICU, Churn), or control training runs.
                </p>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[86%]", m.role === "user" && "text-right")}>
                  <div
                    className={cn(
                      "inline-block text-left rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed",
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

          {/* suggestions */}
          <div className="px-4 pb-2 flex gap-1.5 flex-wrap shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="px-2.5 py-1 rounded-full border border-line text-[11px] text-fog-400 hover:text-signal-300 hover:border-signal-700 transition-colors disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>

          {/* input */}
          <div className="p-3 border-t border-line-soft bg-ink-900/60 shrink-0">
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
                    ? `Speak/Type command (${settings.model})…`
                    : "Speak/Type website command…"
                }
                className={cn(
                  "flex-1 resize-none bg-ink-950 border rounded-xl px-3.5 py-2.5 text-[13px] text-fog-100 placeholder:text-fog-600 outline-none transition-colors max-h-28",
                  listening ? "border-rose-500/80 bg-rose-500/5 placeholder:text-rose-400 font-medium" : "border-line focus:border-signal-600"
                )}
              />

              {/* Voice input button */}
              <button
                onClick={toggleVoiceInput}
                type="button"
                className={cn(
                  "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all border",
                  listening
                    ? "bg-rose-500/20 border-rose-500/60 text-rose-300 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                    : "bg-ink-950 border-line text-fog-400 hover:text-signal-300 hover:border-signal-600"
                )}
                title={listening ? "Listening... click to stop" : "Voice input (Speak your command)"}
              >
                <IconMic width={16} height={16} />
              </button>

              {busy ? (
                <button onClick={stop} className="w-10 h-10 shrink-0 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center justify-center hover:bg-rose-500/25 transition-colors" title="Stop generating & speaking">
                  <IconStop width={16} height={16} />
                </button>
              ) : (
                <button
                  onClick={() => ask(input)}
                  disabled={!input.trim()}
                  className="w-10 h-10 shrink-0 rounded-xl bg-signal-500 text-ink-950 flex items-center justify-center hover:bg-signal-400 transition-all disabled:opacity-35 disabled:pointer-events-none active:scale-95"
                  title="Send message"
                >
                  <IconSend width={16} height={16} />
                </button>
              )}
            </div>
            <div className="text-[9.5px] font-mono text-fog-600 mt-1.5 px-1 flex justify-between items-center">
              <span>
                {listening
                  ? "🎙️ Voice recognition active"
                  : hasKey
                  ? `Google AI Studio Controller (${settings.model})`
                  : "Local Voice Mode"}
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
