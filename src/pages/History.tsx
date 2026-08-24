/* FedShield — training run history & model registry */
import { useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { getDatasetMeta } from "../lib/datasets";
import { modelToJson } from "../lib/flEngine";
import { requestPredict, requestRun } from "../lib/crosslink";
import type { RunResult } from "../lib/types";
import { LineChart } from "../components/charts";
import { Badge, Button, EmptyState, LockPill, Modal, Panel, cn } from "../components/ui";
import { IconChart, IconChevron, IconDownload, IconFlask, IconQrCode, IconSparkle, IconTrash } from "../components/icons";
import QrCodeModal from "../components/QrCodeModal";

export default function History() {
  const { runs, deleteRun, setPage, toast } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [qrRun, setQrRun] = useState<RunResult | null>(null);

  const download = (id: string) => {
    const run = runs.find((r) => r.id === id);
    if (!run) return;
    const blob = new Blob([modelToJson(run)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${run.modelName}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("success", "Model artifact downloaded — weights & metrics only, never data.");
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Training history"
        sub={`${runs.length} stored run${runs.length === 1 ? "" : "s"} · persisted locally · guest sessions flagged`}
        delay={0}
        right={isGuest ? <LockPill label="delete & export locked" /> : <Badge tone="signal">full access</Badge>}
      >
        {runs.length === 0 ? (
          <EmptyState
            title="No runs recorded yet"
            body="Completed federated training sessions appear here with full per-round telemetry and exportable model artifacts."
            action={
              <Button onClick={() => setPage("lab")}>
                <IconFlask width={15} height={15} /> Start training
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-line-soft">
            {runs.map((r, idx) => {
              const meta = getDatasetMeta(r.datasetId);
              const open = expanded === r.id;
              return (
                <div key={r.id} className={cn("transition-colors", open && "bg-ink-800/30")}>
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    <button
                      onClick={() => setExpanded(open ? null : r.id)}
                      className="w-6 h-6 rounded-md border border-line flex items-center justify-center text-fog-500 hover:text-signal-300 hover:border-signal-700 transition-colors shrink-0"
                    >
                      <IconChevron width={13} height={13} className={cn("transition-transform duration-200", open && "rotate-180")} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-fog-100">{r.modelName}</span>
                        {r.byGuest && <Badge tone="ember">guest run</Badge>}
                        <Badge tone="fog">{r.algo}</Badge>
                      </div>
                      <div className="text-[11.5px] font-mono text-fog-500 mt-0.5">
                        {meta.name} · {r.config.nClients} clients · {r.rounds.length} rounds · α={r.config.alpha} · ε {r.epsilonSpent.toFixed(1)} ·{" "}
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="hidden sm:block text-right shrink-0 mr-1">
                      <div className="font-mono text-[15px] text-signal-300">{(r.final.accuracy * 100).toFixed(1)}%</div>
                      <div className="text-[10px] font-mono text-fog-600">F1 {r.final.f1.toFixed(3)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="Generate QR Code for this training result"
                        onClick={() => setQrRun(r)}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-signal-400 hover:text-signal-300 hover:bg-signal-500/15 border border-signal-500/30 transition-colors"
                      >
                        <IconQrCode width={15} height={15} />
                      </button>
                      <button
                        title="Open in analytics"
                        onClick={() => {
                          requestRun(r.id);
                          setPage("analytics");
                        }}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-fog-500 hover:text-signal-300 hover:bg-signal-500/10 transition-colors"
                      >
                        <IconChart width={15} height={15} />
                      </button>
                      <button
                        title="Query in prediction console"
                        onClick={() => {
                          requestPredict(r.id);
                          setPage("predict");
                        }}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-fog-500 hover:text-signal-300 hover:bg-signal-500/10 transition-colors"
                      >
                        <IconSparkle width={15} height={15} />
                      </button>
                      {isGuest ? (
                        <span className="w-8 h-8 rounded-md flex items-center justify-center text-fog-700 cursor-not-allowed" title="Requires an account">
                          <IconDownload width={15} height={15} />
                        </span>
                      ) : (
                        <button
                          title="Download model artifact"
                          onClick={() => download(r.id)}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-fog-500 hover:text-signal-300 hover:bg-signal-500/10 transition-colors"
                        >
                          <IconDownload width={15} height={15} />
                        </button>
                      )}
                      {isGuest ? (
                        <span className="w-8 h-8 rounded-md flex items-center justify-center text-fog-700 cursor-not-allowed" title="Requires an account">
                          <IconTrash width={15} height={15} />
                        </span>
                      ) : (
                        <button
                          title="Delete run"
                          onClick={() => setToDelete(r.id)}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-fog-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                          <IconTrash width={15} height={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="px-5 pb-5 pt-1 grid lg:grid-cols-2 gap-5 reveal" style={{ ["--d" as string]: "0ms" }}>
                      <div className="rounded-lg border border-line-soft bg-ink-900/50 p-4">
                        <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">Round telemetry</div>
                        <LineChart
                          xs={r.rounds.map((x) => x.round)}
                          series={[
                            { name: "Acc %", color: "#1fc8b4", ys: r.rounds.map((x) => x.fed.accuracy * 100), area: true },
                            { name: "Centralized %", color: "#58b7f0", ys: r.rounds.map((x) => (x.centralized ? x.centralized.accuracy * 100 : 0)), dash: true },
                            { name: "ε cumulative", color: "#f0b454", ys: r.rounds.map((x) => x.epsilonCum) },
                          ]}
                          yFmt={(v) => v.toFixed(0)}
                          xFmt={(v) => `R${v}`}
                          height={190}
                          animate={false}
                        />
                      </div>
                      <div className="rounded-lg border border-line-soft bg-ink-900/50 p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500">Configuration & artifact</div>
                            <Button size="sm" variant="outline" onClick={() => setQrRun(r)}>
                              <IconQrCode width={14} height={14} /> Generate QR Code
                            </Button>
                          </div>
                          <pre className="text-[11px] font-mono text-fog-400 leading-relaxed overflow-x-auto max-h-[140px] overflow-y-auto">
{JSON.stringify({ algo: r.algo, rounds: r.config.rounds, clients: r.config.nClients, participation: r.config.participation, localEpochs: r.config.localEpochs, lr: r.config.learningRate, mu: r.algo === "fedprox" ? r.config.mu : undefined, alpha: r.config.alpha, dp: r.config.dp, epsilonPerRound: r.config.epsilonPerRound, clipNorm: r.config.clipNorm, secureAgg: r.config.secureAgg }, null, 2)}
                          </pre>
                        </div>
                        <div className="mt-3 pt-2 border-t border-line-soft">
                          <div className="text-[11px] font-mono text-fog-500">
                            weights[0:6] = <span className="text-signal-300">[{r.weights.slice(0, 6).map((w) => w.toFixed(3)).join(", ")}]</span> · bias ={" "}
                            <span className="text-signal-300">{r.bias.toFixed(3)}</span>
                          </div>
                          <div className="mt-1 text-[11px] font-mono text-fog-600">
                            artifact size {(modelToJson(r).length / 1024).toFixed(1)} KB · contains zero training rows
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {idx === runs.length - 1 && <div className="h-1" />}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title="Delete training run?">
        <p className="text-[13.5px] text-fog-300 leading-relaxed">
          This permanently removes the run record, its round telemetry and the global model weights from local storage. Exported artifacts already
          downloaded are unaffected.
        </p>
        <div className="flex gap-2.5 mt-5">
          <Button variant="outline" className="flex-1" onClick={() => setToDelete(null)}>
            Keep run
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              if (toDelete) {
                deleteRun(toDelete);
                toast("info", "Run deleted from history.");
              }
              setToDelete(null);
            }}
          >
            <IconTrash width={14} height={14} /> Delete permanently
          </Button>
        </div>
      </Modal>

      {/* QR Code Certificate Modal */}
      <QrCodeModal run={qrRun} open={qrRun !== null} onClose={() => setQrRun(null)} />
    </div>
  );
}
