/* FedShield — dataset management (local-only previews + CSV upload by field) */
import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import {
  DOMAINS,
  getDataset,
  isCustom,
  listDatasets,
  registerCustomDataset,
  removeCustomDataset,
} from "../lib/datasets";
import { analyzeColumns, buildCustomDataset, parseCSV } from "../lib/csv";
import { requestLab } from "../lib/crosslink";
import type { CustomDatasetDef, Domain } from "../lib/types";
import { Badge, Button, LockPill, Modal, Panel, Ring, cn } from "../components/ui";
import { IconDatabase, IconEye, IconFlask, IconShield, IconTrash, IconUpload } from "../components/icons";

export default function Datasets() {
  const { setPage, toast, customCount, bumpCustom, runs } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const previewDs = preview ? getDataset(preview) : null;

  const datasets = useMemo(() => listDatasets(), [customCount, uploadOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryDelete = (id: string, name: string) => {
    const referenced = runs.some((r) => r.datasetId === id);
    if (referenced) {
      toast("error", `“${name}” backs a stored training run — keep it or delete those runs first.`);
      return;
    }
    removeCustomDataset(id);
    bumpCustom();
    toast("info", `Removed uploaded dataset “${name}”.`);
  };

  return (
    <div className="space-y-4">
      <div className="panel px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between reveal">
        <div>
          <h2 className="font-display font-semibold text-fog-50">Dataset vault</h2>
          <p className="text-[12.5px] text-fog-500 mt-0.5">
            All data is generated or uploaded and held <span className="text-signal-300">inside this browser</span>. Uploaded CSVs are standardized
            on-device and assigned to a particular field (medical, financial, …) — nothing is transmitted anywhere.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone="signal">
            <IconShield width={12} height={12} /> local-only
          </Badge>
          <Button size="sm" onClick={() => setUploadOpen(true)} disabled={isGuest} title={isGuest ? "Create an account to upload datasets" : undefined}>
            <IconUpload width={14} height={14} /> Upload CSV
          </Button>
          {isGuest && <LockPill label="upload locked" />}
        </div>
      </div>

      {datasets.map((d, idx) => {
        const ds = getDataset(d.id);
        const custom = isCustom(d.id);
        return (
          <Panel
            key={d.id}
            delay={idx * 70}
            title={
              <span className="flex items-center gap-2.5">
                <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", custom ? "bg-ember-400/10 border-ember-400/35 text-ember-300" : "bg-signal-500/10 border-signal-500/35 text-signal-400")}>
                  <IconDatabase width={16} height={16} />
                </span>
                {d.name}
              </span>
            }
            sub={d.description}
            right={
              <span className="flex items-center gap-1.5">
                {custom && <Badge tone="ember">uploaded</Badge>}
                <Badge tone="sky">{d.sector}</Badge>
                {custom &&
                  (isGuest ? (
                    <LockPill label="" />
                  ) : (
                    <button onClick={() => tryDelete(d.id, d.name)} title="Remove uploaded dataset" className="text-fog-500 hover:text-rose-300 transition-colors ml-1">
                      <IconTrash width={15} height={15} />
                    </button>
                  ))}
              </span>
            }
          >
            <div className="grid lg:grid-cols-[1fr_220px] gap-6">
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { k: "Rows", v: d.nSamples.toLocaleString() },
                    { k: "Features", v: String(d.features.length) },
                    { k: "Task", v: d.tag.split(" ")[0] },
                    { k: custom ? "Source" : "Seed", v: custom ? "CSV upload" : `#${d.seed}` },
                  ].map((s) => (
                    <div key={s.k} className="rounded-md border border-line-soft bg-ink-900/50 px-3 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-fog-500">{s.k}</div>
                      <div className="font-mono text-[14px] text-fog-100 mt-0.5 truncate">{s.v}</div>
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

      <PreviewModal ds={previewDs} onClose={() => setPreview(null)} />
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={(def) => { registerCustomDataset(def); bumpCustom(); toast("success", `“${def.meta.name}” registered under ${def.meta.sector} — train it in the Lab.`); }} />
    </div>
  );
}

function PreviewModal({ ds, onClose }: { ds: ReturnType<typeof getDataset> | null; onClose: () => void }) {
  return (
    <Modal open={ds !== null} onClose={onClose} title={ds ? `Local preview — ${ds.meta.name}` : ""} width="max-w-3xl">
      {ds && (
        <>
          <div className="flex items-center gap-2 mb-3 text-[12px] text-ember-300 font-mono">
            <IconShield width={13} height={13} /> rendered on-device · these rows never leave this browser tab
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[12px] font-mono">
              <thead>
                <tr className="bg-ink-800/70 text-fog-400">
                  <th className="px-3 py-2 text-left font-medium">label</th>
                  {ds.meta.features.map((ft) => (
                    <th key={ft.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">{ft.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, i) => i * 97).map((rowIdx) => {
                  const y = ds.y[rowIdx];
                  return (
                    <tr key={rowIdx} className="border-t border-line-soft hover:bg-ink-800/40">
                      <td className={`px-3 py-2 whitespace-nowrap ${y === 1 ? "text-rose-300" : "text-signal-300"}`}>
                        {y === 1 ? ds.meta.positiveLabel : ds.meta.negativeLabel}
                      </td>
                      {ds.meta.features.map((ft, j) => (
                        <td key={ft.key} className="px-3 py-2 text-right text-fog-300 whitespace-nowrap">
                          {ds.raw[rowIdx * ds.meta.features.length + j].toFixed(ft.decimals)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px] text-fog-500 mt-3">
            Showing 6 of {ds.meta.nSamples.toLocaleString()} rows. In a production federation this table would never exist on the server — clients
            expose only schema metadata.
          </p>
        </>
      )}
    </Modal>
  );
}

/* ── Upload modal: CSV → field-specific custom dataset ────── */

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (def: CustomDatasetDef) => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<Domain>("medical");
  const [labelCol, setLabelCol] = useState(0);
  const [featureCols, setFeatureCols] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(() => (rows ? analyzeColumns(rows) : null), [rows]);

  const ingest = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCSV(String(reader.result ?? ""));
        if (parsed.length < 2) throw new Error("too short");
        setRows(parsed);
        setFileName(file.name);
        if (!name) setName(file.name.replace(/\.csv$/i, ""));
        const { info } = analyzeColumns(parsed);
        const labelIdx = info.find((c) => c.isLabelCandidate && c.looksBinary)?.index ?? info[info.length - 1].index;
        setLabelCol(labelIdx);
        setFeatureCols(
          info.filter((c) => c.index !== labelIdx && c.numericFrac > 0.8).map((c) => c.index).slice(0, 14)
        );
      } catch {
        setError("Couldn't parse that file — make sure it's a CSV with a header row.");
        setRows(null);
      }
    };
    reader.readAsText(file);
  };

  const toggleFeature = (i: number) =>
    setFeatureCols((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const submit = () => {
    if (!rows) return;
    setError(null);
    const feats = featureCols.filter((c) => c !== labelCol);
    const res = buildCustomDataset(name, domain, fileName, rows, labelCol, feats);
    if (res.error || !res.def) {
      setError(res.error ?? "Unable to build the dataset.");
      return;
    }
    onDone(res.def);
    setRows(null);
    setFileName("");
    setName("");
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setRows(null); setError(null); }} title="Upload dataset → assign to a field" width="max-w-2xl">
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && ingest(e.target.files[0])} />
      {!rows ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-line hover:border-signal-600 transition-colors py-12 flex flex-col items-center gap-3 text-fog-400"
        >
          <IconUpload width={26} height={26} className="text-signal-400" />
          <span className="text-[14px] font-medium text-fog-200">Choose a CSV file</span>
          <span className="text-[12px] text-fog-500 max-w-sm text-center">
            Needs a header row, a binary label column, and ≥2 numeric feature columns. Parsed &amp; standardized entirely on-device.
          </span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-mono text-fog-400">
              <span className="text-signal-300">{fileName}</span> · {rows.length - 1} data rows · {analysis?.header.length} columns
            </span>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>change file</Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">Dataset name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-ink-900 border border-line rounded-lg px-3 py-2 text-sm text-fog-50 outline-none focus:border-signal-600" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">Label column (binary)</span>
              <select value={labelCol} onChange={(e) => setLabelCol(parseInt(e.target.value))} className="w-full bg-ink-900 border border-line rounded-lg px-3 py-2 text-sm text-fog-200 outline-none focus:border-signal-600">
                {analysis?.info.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name} {c.looksBinary ? "· binary ✓" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">Particular field</span>
            <div className="flex flex-wrap gap-1.5">
              {DOMAINS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDomain(d.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-all",
                    domain === d.id ? "bg-signal-500/12 text-signal-300 border-signal-500/60" : "border-line text-fog-400 hover:text-fog-200"
                  )}
                  title={d.blurb}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">
              Feature columns <span className="text-fog-600 normal-case font-body">({featureCols.length} selected)</span>
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {analysis?.info.filter((c) => c.index !== labelCol).map((c) => (
                <button
                  key={c.index}
                  onClick={() => toggleFeature(c.index)}
                  className={cn(
                    "px-2.5 py-1 rounded-md border text-[11.5px] font-mono transition-colors",
                    featureCols.includes(c.index)
                      ? "border-signal-500/60 bg-signal-500/10 text-signal-300"
                      : "border-line text-fog-500 hover:text-fog-300",
                    c.numericFrac < 0.8 && "opacity-50"
                  )}
                  title={`${Math.round(c.numericFrac * 100)}% numeric`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-[12.5px] text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => { onClose(); setRows(null); setError(null); }}>Cancel</Button>
            <Button onClick={submit} disabled={featureCols.filter((c) => c !== labelCol).length < 2}>
              <IconDatabase width={15} height={15} /> Register dataset
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
