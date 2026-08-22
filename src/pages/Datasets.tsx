/* FedShield — dataset management (local-only previews) */
import { useState } from "react";
import { useApp } from "../lib/store";
import { DATASETS, getDataset } from "../lib/datasets";
import { requestLab } from "../lib/crosslink";
import { Badge, Button, Modal, Panel, Ring } from "../components/ui";
import { IconDatabase, IconEye, IconFlask, IconShield } from "../components/icons";

export default function Datasets() {
  const { setPage, toast } = useApp();
  const [preview, setPreview] = useState<string | null>(null);
  const previewDs = preview ? getDataset(preview) : null;

  return (
    <div className="space-y-4">
      <div className="panel px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between reveal">
        <div>
          <h2 className="font-display font-semibold text-fog-50">Dataset vault</h2>
          <p className="text-[12.5px] text-fog-500 mt-0.5">
            All data is generated and held <span className="text-signal-300">inside this browser</span>. Previews render client-side; nothing is
            uploaded anywhere — which is exactly the guarantee federated learning extends to production silos.
          </p>
        </div>
        <Badge tone="signal" className="shrink-0">
          <IconShield width={12} height={12} /> local-only
        </Badge>
      </div>

      {DATASETS.map((d, idx) => {
        const ds = getDataset(d.id);
        return (
          <Panel
            key={d.id}
            delay={idx * 90}
            title={
              <span className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-signal-500/10 border border-signal-500/35 text-signal-400 flex items-center justify-center">
                  <IconDatabase width={16} height={16} />
                </span>
                {d.name}
              </span>
            }
            sub={d.description}
            right={<Badge tone="sky">{d.sector}</Badge>}
          >
            <div className="grid lg:grid-cols-[1fr_220px] gap-6">
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { k: "Rows", v: d.nSamples.toLocaleString() },
                    { k: "Features", v: String(d.features.length) },
                    { k: "Task", v: d.tag.split(" ")[0] },
                    { k: "Seed", v: `#${d.seed}` },
                  ].map((s) => (
                    <div key={s.k} className="rounded-md border border-line-soft bg-ink-900/50 px-3 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-fog-500">{s.k}</div>
                      <div className="font-mono text-[14px] text-fog-100 mt-0.5">{s.v}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">Feature schema</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.features.map((ft) => (
                    <span key={ft.key} className="px-2 py-1 rounded-md bg-ink-800/80 border border-line-soft text-[11.5px] font-mono text-fog-300 hover:border-signal-700 hover:text-signal-300 transition-colors cursor-default" title={`${ft.label} · range ${ft.min}–${ft.max}${ft.unit ? " " + ft.unit : ""}`}>
                      {ft.key}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-5">
                  <Button size="sm" onClick={() => { requestLab(d.id); setPage("lab"); toast("info", `${d.name} loaded into the Training Lab.`); }}>
                    <IconFlask width={14} height={14} /> Train in Lab
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPreview(d.id)}>
                    <IconEye width={14} height={14} /> Local preview
                  </Button>
                </div>
              </div>
              <div className="flex lg:flex-col items-center gap-4 lg:border-l lg:border-line-soft lg:pl-6">
                <Ring value={d.positiveRate} max={1} size={104} stroke={9} color="#e8798f">
                  <span className="font-display font-bold text-[19px] text-fog-50">{Math.round(d.positiveRate * 100)}%</span>
                  <span className="text-[9px] font-mono text-fog-500 uppercase">positive</span>
                </Ring>
                <div className="text-center lg:text-left">
                  <div className="text-[11px] font-mono text-fog-500">class balance</div>
                  <div className="flex lg:flex-col gap-1.5 mt-1.5 text-[12px] font-mono">
                    <span className="text-rose-300">■ {d.positiveLabel} {Math.round(d.positiveRate * 100)}%</span>
                    <span className="text-signal-300">■ {d.negativeLabel} {100 - Math.round(d.positiveRate * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        );
      })}

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={previewDs ? `Local preview — ${previewDs.meta.name}` : ""}
        width="max-w-3xl"
      >
        {previewDs && (
          <>
            <div className="flex items-center gap-2 mb-3 text-[12px] text-ember-300 font-mono">
              <IconShield width={13} height={13} /> rendered on-device · these rows never leave this browser tab
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-[12px] font-mono">
                <thead>
                  <tr className="bg-ink-800/70 text-fog-400">
                    <th className="px-3 py-2 text-left font-medium">label</th>
                    {previewDs.meta.features.map((ft) => (
                      <th key={ft.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {ft.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, i) => i * 97).map((rowIdx) => {
                    const y = previewDs.y[rowIdx];
                    return (
                      <tr key={rowIdx} className="border-t border-line-soft hover:bg-ink-800/40">
                        <td className={`px-3 py-2 whitespace-nowrap ${y === 1 ? "text-rose-300" : "text-signal-300"}`}>
                          {y === 1 ? previewDs.meta.positiveLabel : previewDs.meta.negativeLabel}
                        </td>
                        {previewDs.meta.features.map((ft, j) => (
                          <td key={ft.key} className="px-3 py-2 text-right text-fog-300 whitespace-nowrap">
                            {previewDs.raw[rowIdx * previewDs.meta.features.length + j].toFixed(ft.decimals)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-fog-500 mt-3">
              Showing 6 of {previewDs.meta.nSamples.toLocaleString()} rows. In a production federation this table would never exist on the server —
              clients would only expose schema metadata.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
