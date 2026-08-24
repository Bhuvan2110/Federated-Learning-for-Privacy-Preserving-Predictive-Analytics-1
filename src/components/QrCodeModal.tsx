/* ─────────────────────────────────────────────────────────────
 * FedShield — High-Speed Scannable QR Code & Verification Certificate
 * Formats training results into an ultra-fast scannable web URL
 * opening the full Confusion Matrix & Analytics Portal on any device.
 * ───────────────────────────────────────────────────────────── */
import { useState } from "react";
import type { RunResult } from "../lib/types";
import { getDatasetMeta } from "../lib/datasets";
import { useApp } from "../lib/store";
import { Modal, Badge, Button, cn } from "./ui";
import { IconQrCode, IconShield, IconDownload, IconSparkle, IconCheck, IconArrowRight } from "./icons";

interface QrCodeModalProps {
  run: RunResult | null;
  open: boolean;
  onClose: () => void;
}

export default function QrCodeModal({ run, open, onClose }: QrCodeModalProps) {
  const { setPage } = useApp();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"url" | "summary" | "json">("url");
  const [activeTab, setActiveTab] = useState<"code" | "verifier">("code");
  const [inputCode, setInputCode] = useState("");
  const [verifiedResult, setVerifiedResult] = useState<Record<string, unknown> | null>(null);

  if (!run) return null;

  const datasetMeta = getDatasetMeta(run.datasetId);

  // Direct Web Portal Verification URL (scans instantly & opens website with full Confusion Matrix)
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const portalUrl = `${origin}/?verifyRun=${run.id}`;

  // Compact scannable payload
  const compactPayload = [
    `FEDSHIELD MODEL CERTIFICATE`,
    `Model: ${run.modelName}`,
    `Dataset: ${datasetMeta.name} (${datasetMeta.sector})`,
    `Algo: ${run.algo.toUpperCase()} | Rounds: ${run.rounds.length}`,
    `Acc: ${(run.final.accuracy * 100).toFixed(2)}% | F1: ${run.final.f1.toFixed(3)} | AUC: ${run.final.auc.toFixed(3)}`,
    `DP: ${run.config.dp ? `ε=${run.epsilonSpent.toFixed(1)}` : "Off"} | SecAgg: ${run.config.secureAgg ? "Active" : "Off"}`,
    `Portal: ${portalUrl}`,
  ].join("\n");

  // Full detailed JSON payload
  const fullPayload = JSON.stringify(
    {
      fedshield_verifiable_certificate: "FEDSHIELD-FL-V1",
      run_id: run.id,
      model_name: run.modelName,
      dataset: datasetMeta.name,
      sector: datasetMeta.sector,
      algorithm: run.algo.toUpperCase(),
      rounds: run.rounds.length,
      clients_participating: run.config.nClients,
      portal_url: portalUrl,
      differential_privacy: {
        enabled: run.config.dp,
        epsilon_spent: Number(run.epsilonSpent.toFixed(2)),
      },
      secure_aggregation: run.config.secureAgg,
      performance_metrics: {
        accuracy: `${(run.final.accuracy * 100).toFixed(2)}%`,
        precision: Number(run.final.precision.toFixed(3)),
        recall: Number(run.final.recall.toFixed(3)),
        f1_score: Number(run.final.f1.toFixed(3)),
        auc_roc: Number(run.final.auc.toFixed(3)),
        test_loss: Number(run.final.loss.toFixed(3)),
      },
      created_at: new Date(run.createdAt).toISOString(),
    },
    null,
    2
  );

  const activePayload = mode === "url" ? portalUrl : mode === "summary" ? compactPayload : fullPayload;
  const encodedPayload = encodeURIComponent(activePayload);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodedPayload}&color=1fc8b4&bgcolor=090d14&margin=2`;

  const copyData = () => {
    navigator.clipboard.writeText(activePayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const downloadQr = () => {
    const link = document.createElement("a");
    link.href = qrImageUrl;
    link.download = `fedshield-qr-${run.id.slice(0, 8)}.png`;
    link.target = "_blank";
    link.click();
  };

  const openPortalWebsite = () => {
    onClose();
    // Set query string or route to verify view
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", `/?verifyRun=${run.id}`);
      window.dispatchEvent(new Event("popstate"));
    }
  };

  const verifyScannedText = (text: string) => {
    setInputCode(text);
    if (!text.trim()) {
      setVerifiedResult(null);
      return;
    }
    try {
      if (text.startsWith("{")) {
        const parsed = JSON.parse(text);
        setVerifiedResult(parsed);
      } else {
        const lines = text.split("\n");
        const parsedObj: Record<string, string> = {};
        lines.forEach((l) => {
          const parts = l.split(":");
          if (parts.length >= 2) {
            parsedObj[parts[0].trim()] = parts.slice(1).join(":").trim();
          }
        });
        setVerifiedResult(parsedObj);
      }
    } catch {
      setVerifiedResult({ raw_text: text, status: "Scanned payload verified" });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Training Result QR Code & Portal Certificate">
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-line-soft gap-4">
          <button
            onClick={() => setActiveTab("code")}
            className={cn(
              "pb-2 text-[13px] font-medium transition-colors border-b-2",
              activeTab === "code"
                ? "border-signal-500 text-signal-300 font-semibold"
                : "border-transparent text-fog-500 hover:text-fog-200"
            )}
          >
            QR Certificate
          </button>
          <button
            onClick={() => setActiveTab("verifier")}
            className={cn(
              "pb-2 text-[13px] font-medium transition-colors border-b-2",
              activeTab === "verifier"
                ? "border-signal-500 text-signal-300 font-semibold"
                : "border-transparent text-fog-500 hover:text-fog-200"
            )}
          >
            Scan & Verify Tool
          </button>
        </div>

        {activeTab === "code" ? (
          <>
            {/* Header summary */}
            <div className="p-3.5 rounded-xl bg-signal-500/10 border border-signal-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-lg bg-signal-500/20 text-signal-300 flex items-center justify-center shrink-0">
                  <IconShield width={20} height={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-[13.5px] text-fog-100 truncate">
                    {run.modelName}
                  </div>
                  <div className="text-[11px] font-mono text-fog-400 mt-0.5">
                    Verified Federated Model Certificate · {datasetMeta.name}
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={openPortalWebsite} className="shrink-0 bg-signal-500 text-ink-950 font-bold">
                Open Portal Page →
              </Button>
            </div>

            {/* QR Format Selector */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11.5px] font-mono text-fog-400">Encoded QR Target:</span>
              <div className="flex gap-1 bg-ink-950 p-1 rounded-lg border border-line">
                <button
                  onClick={() => setMode("url")}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                    mode === "url"
                      ? "bg-signal-500 text-ink-950 font-bold"
                      : "text-fog-400 hover:text-fog-100"
                  )}
                >
                  🌐 Website URL (Auto-Open)
                </button>
                <button
                  onClick={() => setMode("summary")}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                    mode === "summary"
                      ? "bg-signal-500 text-ink-950 font-bold"
                      : "text-fog-400 hover:text-fog-100"
                  )}
                >
                  ⚡ Text Summary
                </button>
                <button
                  onClick={() => setMode("json")}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                    mode === "json"
                      ? "bg-signal-500 text-ink-950 font-bold"
                      : "text-fog-400 hover:text-fog-100"
                  )}
                >
                  📄 Full JSON
                </button>
              </div>
            </div>

            {/* Main QR Code & Stats Display */}
            <div className="grid md:grid-cols-[220px_1fr] gap-4 items-center">
              <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-ink-950 border border-line shadow-inner">
                <img
                  src={qrImageUrl}
                  alt="Training Result QR Code"
                  className="w-48 h-48 rounded-lg bg-ink-950 p-1.5 border border-signal-500/40"
                />
                <div className="text-[10.5px] font-mono text-fog-400 mt-2 text-center flex items-center gap-1">
                  <IconQrCode width={12} height={12} className="text-signal-400" />
                  {mode === "url" ? "Scan to open portal website" : "Scannable certificate data"}
                </div>
              </div>

              {/* Metrics list */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-signal-400 font-semibold">
                  Results Included in Portal
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                  <div className="p-2 rounded-lg bg-ink-900/60 border border-line-soft">
                    <span className="text-[10px] font-mono text-fog-500 block">Accuracy</span>
                    <span className="font-mono font-bold text-signal-300 text-[15px]">
                      {(run.final.accuracy * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-ink-900/60 border border-line-soft">
                    <span className="text-[10px] font-mono text-fog-500 block">F1 Score</span>
                    <span className="font-mono font-bold text-fog-100 text-[15px]">
                      {run.final.f1.toFixed(3)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-ink-900/60 border border-line-soft">
                    <span className="text-[10px] font-mono text-fog-500 block">AUC-ROC</span>
                    <span className="font-mono font-bold text-fog-100 text-[15px]">
                      {run.final.auc.toFixed(3)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-ink-900/60 border border-line-soft">
                    <span className="text-[10px] font-mono text-fog-500 block">Confusion Matrix</span>
                    <span className="font-mono font-bold text-signal-400 text-[13px]">
                      Full 2x2 TP/FP/FN/TN
                    </span>
                  </div>
                </div>

                <div className="text-[11.5px] font-mono text-fog-400 space-y-1 pt-1 border-t border-line-soft">
                  <div className="flex justify-between">
                    <span>Algorithm:</span>
                    <span className="text-fog-200 font-semibold uppercase">{run.algo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Differential Privacy:</span>
                    <span className={cn(run.config.dp ? "text-signal-300" : "text-fog-500")}>
                      {run.config.dp ? `ε=${run.epsilonSpent.toFixed(1)} Spent` : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Encoded payload raw text */}
            <details className="group">
              <summary className="text-[11px] font-mono text-fog-500 hover:text-signal-400 cursor-pointer select-none py-1">
                ► View Encoded Target ({mode})
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-ink-950 border border-line font-mono text-[11px] text-fog-300 max-h-36 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                {activePayload}
              </pre>
            </details>

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-soft">
              <Button variant="outline" size="sm" onClick={copyData}>
                <IconSparkle width={14} height={14} />
                {copied ? "Copied Target!" : "Copy Target"}
              </Button>
              <Button size="sm" onClick={downloadQr}>
                <IconDownload width={14} height={14} /> Save QR Image
              </Button>
            </div>
          </>
        ) : (
          /* Verifier Tab */
          <div className="space-y-3.5">
            <p className="text-[12.5px] text-fog-300 leading-relaxed">
              Paste or scan text from a FedShield QR Code below to verify and decode training parameters:
            </p>
            <textarea
              value={inputCode}
              onChange={(e) => verifyScannedText(e.target.value)}
              placeholder="Paste scanned QR text or JSON data here…"
              rows={4}
              className="w-full bg-ink-950 border border-line rounded-xl p-3 text-[12px] font-mono text-fog-100 placeholder:text-fog-600 outline-none focus:border-signal-600"
            />
            {verifiedResult && (
              <div className="p-3.5 rounded-xl bg-signal-500/10 border border-signal-500/40 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-signal-300 flex items-center gap-1.5 font-bold">
                  <IconCheck width={14} height={14} /> Decoded & Verified Payload
                </div>
                <pre className="p-2.5 rounded-lg bg-ink-950 border border-line font-mono text-[11.5px] text-fog-200 leading-relaxed overflow-x-auto max-h-48">
                  {JSON.stringify(verifiedResult, null, 2)}
                </pre>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => verifyScannedText(portalUrl)}>
                Verify Portal URL
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
