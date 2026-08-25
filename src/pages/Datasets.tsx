/* FedShield — dataset management (local-only previews + CSV/ZIP upload & Remote URL import by field) */
import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
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

const SAMPLE_URLS = [
  {
    name: "Diabetes Risk CSV (Healthcare)",
    url: "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.csv",
    type: "csv",
  },
  {
    name: "Bank Credit Risk CSV (Financial)",
    url: "https://raw.githubusercontent.com/datasets/house-prices-uk/master/data/data.csv",
    type: "csv",
  },
  {
    name: "General Clinical Data CSV (Medical)",
    url: "https://raw.githubusercontent.com/jbrownlee/Datasets/master/housing.csv",
    type: "csv",
  },
];

export default function Datasets() {
  const { setPage, toast, customCount, bumpCustom, runs } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const previewDs = preview ? getDataset(preview) : null;

  const datasets = useMemo(() => listDatasets(user?.email), [customCount, uploadOpen, user?.email]); // eslint-disable-line react-hooks/exhaustive-deps


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
            All data is uploaded, extracted from <span className="text-signal-300">ZIP archives</span>, or fetched via URL <span className="text-signal-300">inside this browser</span>. Data is standardized on-device — zero raw data is transmitted.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone="signal">
            <IconShield width={12} height={12} /> local-only
          </Badge>
          <Button size="sm" onClick={() => setUploadOpen(true)} disabled={isGuest} title={isGuest ? "Create an account to upload datasets" : undefined}>
            <IconUpload width={14} height={14} /> Upload CSV / ZIP
          </Button>
          {isGuest && <LockPill label="upload locked" />}
        </div>
      </div>

      {datasets.map((d, idx) => {
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
                {custom && <Badge tone="ember">custom imported</Badge>}
                <Badge tone="sky">{d.sector}</Badge>
                {custom &&
                  (isGuest ? (
                    <LockPill label="" />
                  ) : (
                    <button onClick={() => tryDelete(d.id, d.name)} title="Remove dataset" className="text-fog-500 hover:text-rose-300 transition-colors ml-1">
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
                    { k: custom ? "Source" : "Seed", v: custom ? "CSV / ZIP Import" : `#${d.seed}` },
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
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={(def) => { registerCustomDataset(def, user?.email); bumpCustom(); toast("success", `“${def.meta.name}” registered under ${def.meta.sector} — train it in the Lab.`); }} />

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

/* ── Upload & URL / ZIP Importer modal ───────────────────────── */

interface ZipCsvFile {
  name: string;
  path: string;
  getText: () => Promise<string>;
}

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (def: CustomDatasetDef) => void }) {
  const [tab, setTab] = useState<"file" | "url">("file");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<Domain>("medical");
  const [labelCol, setLabelCol] = useState(0);
  const [featureCols, setFeatureCols] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zipFiles, setZipFiles] = useState<ZipCsvFile[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(() => (rows ? analyzeColumns(rows) : null), [rows]);

  const processCsvText = (text: string, sourceName: string) => {
    try {
      const parsed = parseCSV(text);
      if (parsed.length < 2) throw new Error("File contains fewer than 2 data rows.");
      setRows(parsed);
      setFileName(sourceName);
      if (!name) setName(sourceName.replace(/\.csv$/i, "").replace(/[^a-zA-Z0-9_\-\s]/g, ""));
      const { info } = analyzeColumns(parsed);
      const labelIdx = info.find((c) => c.isLabelCandidate && c.looksBinary)?.index ?? info[info.length - 1].index;
      setLabelCol(labelIdx);
      setFeatureCols(
        info.filter((c) => c.index !== labelIdx && c.numericFrac > 0.8).map((c) => c.index).slice(0, 14)
      );
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid CSV syntax.";
      setError(`CSV Parsing Error: ${msg} Ensure file contains header row and valid rows.`);
      setRows(null);
    }
  };

  const processZipBuffer = async (buffer: ArrayBuffer, zipName: string) => {
    setError(null);
    setFetching(true);
    try {
      const zip = await JSZip.loadAsync(buffer);
      const csvEntries: ZipCsvFile[] = [];

      for (const relativePath of Object.keys(zip.files)) {
        const fileEntry = zip.files[relativePath];
        if (fileEntry.dir || relativePath.startsWith("__MACOSX") || !relativePath.toLowerCase().endsWith(".csv")) {
          continue;
        }
        csvEntries.push({
          name: relativePath.split("/").pop() || relativePath,
          path: relativePath,
          getText: () => fileEntry.async("string"),
        });
      }

      if (csvEntries.length === 0) {
        throw new Error("No .csv dataset files found inside this ZIP archive.");
      }

      if (csvEntries.length === 1) {
        const text = await csvEntries[0].getText();
        processCsvText(text, `${zipName} → ${csvEntries[0].name}`);
        setZipFiles(null);
      } else {
        // Multi-file ZIP
        setZipFiles(csvEntries);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to extract ZIP file.";
      setError(`ZIP Extraction Error: ${msg}`);
    } finally {
      setFetching(false);
    }
  };

  const selectZipCsv = async (entry: ZipCsvFile) => {
    setFetching(true);
    try {
      const text = await entry.getText();
      processCsvText(text, entry.name);
      setZipFiles(null);
    } catch {
      setError(`Failed to read ${entry.name} from ZIP.`);
    } finally {
      setFetching(false);
    }
  };

  const ingestFile = (file: File) => {
    setError(null);
    setZipFiles(null);
    if (file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip")) {
      const reader = new FileReader();
      reader.onload = () => processZipBuffer(reader.result as ArrayBuffer, file.name);
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => processCsvText(String(reader.result ?? ""), file.name);
      reader.readAsText(file);
    }
  };

  const fetchFromUrl = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    setError(null);
    setFetching(true);
    setZipFiles(null);
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const cleanUrl = targetUrl.split("?")[0].toLowerCase();
      
      if (cleanUrl.endsWith(".zip") || res.headers.get("content-type")?.includes("zip")) {
        const buffer = await res.arrayBuffer();
        const derivedName = targetUrl.split("/").pop() || "remote_archive.zip";
        await processZipBuffer(buffer, derivedName);
      } else {
        const text = await res.text();
        const urlDerivedName = targetUrl.split("/").pop()?.replace(/\.csv$/i, "") || "remote-dataset";
        processCsvText(text, `${urlDerivedName}.csv`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch remote dataset.";
      setError(`URL Import Failed: ${msg}. Check if the URL points to a public CSV or ZIP file.`);
    } finally {
      setFetching(false);
    }
  };

  const toggleFeature = (i: number) =>
    setFeatureCols((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const submit = () => {
    if (!rows) return;
    setError(null);
    const feats = featureCols.filter((c) => c !== labelCol);
    const res = buildCustomDataset(name, domain, fileName, rows, labelCol, feats);
    if (res.error || !res.def) {
      setError(res.error ?? "Unable to build dataset schema.");
      return;
    }
    onDone(res.def);
    setRows(null);
    setFileName("");
    setName("");
    setRemoteUrl("");
    setZipFiles(null);
    setError(null);
    onClose();
  };

  const resetAll = () => {
    onClose();
    setRows(null);
    setFileName("");
    setName("");
    setRemoteUrl("");
    setZipFiles(null);
    setError(null);
  };

  return (
    <Modal open={open} onClose={resetAll} title="Upload CSV / ZIP Archive or Import via URL" width="max-w-2xl">
      <input ref={fileRef} type="file" accept=".csv, .zip, application/zip, application/x-zip-compressed, text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0])} />

      {/* Tab selection */}
      {!rows && !zipFiles && (
        <div className="flex border-b border-line-soft mb-4 gap-4">
          <button
            onClick={() => setTab("file")}
            className={cn(
              "pb-2 text-[13px] font-medium transition-colors border-b-2",
              tab === "file" ? "border-signal-500 text-signal-300 font-semibold" : "border-transparent text-fog-500 hover:text-fog-200"
            )}
          >
            📁 Local CSV or ZIP Upload
          </button>
          <button
            onClick={() => setTab("url")}
            className={cn(
              "pb-2 text-[13px] font-medium transition-colors border-b-2",
              tab === "url" ? "border-signal-500 text-signal-300 font-semibold" : "border-transparent text-fog-500 hover:text-fog-200"
            )}
          >
            🌐 Import via Dataset URL (CSV / ZIP)
          </button>
        </div>
      )}

      {/* ZIP Multi-File Selection View */}
      {zipFiles && !rows && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-fog-200">
              📦 ZIP Archive extracted — {zipFiles.length} dataset CSV file(s) found:
            </span>
            <Button size="sm" variant="ghost" onClick={() => setZipFiles(null)}>Back</Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {zipFiles.map((zf) => (
              <div key={zf.path} className="flex items-center justify-between p-3 rounded-xl bg-ink-900 border border-line-soft">
                <span className="font-mono text-[12.5px] text-signal-300 truncate">{zf.path}</span>
                <Button size="sm" onClick={() => selectZipCsv(zf)} loading={fetching}>
                  Select CSV
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!rows && !zipFiles ? (
        tab === "file" ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-line hover:border-signal-600 transition-colors py-12 flex flex-col items-center gap-3 text-fog-400"
          >
            <IconUpload width={26} height={26} className="text-signal-400" />
            <span className="text-[14px] font-medium text-fog-200">Choose a CSV or ZIP Archive file</span>
            <span className="text-[12px] text-fog-500 max-w-sm text-center">
              Supports <span className="text-signal-300">.csv</span> and <span className="text-signal-300">.zip</span> archives. Decompressed &amp; parsed entirely on-device.
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">
                Dataset CSV or ZIP URL (Public Raw File)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://example.com/dataset.csv or https://example.com/data.zip"
                  className="flex-1 bg-ink-950 border border-line rounded-lg px-3 py-2 text-xs font-mono text-fog-100 placeholder:text-fog-600 outline-none focus:border-signal-600"
                />
                <Button size="sm" onClick={() => fetchFromUrl(remoteUrl)} disabled={!remoteUrl.trim() || fetching} loading={fetching}>
                  Fetch &amp; Import
                </Button>
              </div>
            </div>

            {/* Quick Sample Dataset URLs */}
            <div>
              <span className="block text-[11px] font-mono uppercase tracking-wider text-fog-500 mb-2">
                Quick Import Sample URLs
              </span>
              <div className="space-y-1.5">
                {SAMPLE_URLS.map((s) => (
                  <div key={s.url} className="flex items-center justify-between p-2 rounded-lg bg-ink-900/60 border border-line-soft text-[12px]">
                    <span className="font-medium text-fog-200">{s.name}</span>
                    <Button size="sm" variant="outline" onClick={() => { setRemoteUrl(s.url); fetchFromUrl(s.url); }} disabled={fetching}>
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            {error && <div className="text-[12.5px] text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">{error}</div>}
          </div>
        )
      ) : null}

      {/* Schema Config & Field Assignment */}
      {rows && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-mono text-fog-400">
              <span className="text-signal-300">{fileName}</span> · {rows.length - 1} data rows · {analysis?.header.length} columns
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setRows(null); setRemoteUrl(""); setZipFiles(null); }}>Change Source</Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">Dataset name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-ink-900 border border-line rounded-lg px-3 py-2 text-sm text-fog-50 outline-none focus:border-signal-600" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-fog-400 mb-1.5 uppercase font-mono tracking-wide">Label column (target)</span>
              <select value={labelCol} onChange={(e) => setLabelCol(parseInt(e.target.value))} className="w-full bg-ink-900 border border-line rounded-lg px-3 py-2 text-sm text-fog-200 outline-none focus:border-signal-600">
                {analysis?.info.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name} {c.looksBinary ? "· binary ✓" : c.numericFrac > 0.6 ? "· continuous (median split)" : "· category (top vs rest)"}
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
            <Button variant="ghost" onClick={resetAll}>Cancel</Button>
            <Button onClick={submit} disabled={featureCols.filter((c) => c !== labelCol).length < 2}>
              <IconDatabase width={15} height={15} /> Register dataset
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
