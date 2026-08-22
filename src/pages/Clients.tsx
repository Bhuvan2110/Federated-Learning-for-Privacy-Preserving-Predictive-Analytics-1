/* FedShield — federated client registry */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { DATASETS, getDataset, getDatasetMeta, partitionDataset, trainTestSplit } from "../lib/datasets";
import { Badge, LockPill, Panel, Toggle, cn } from "../components/ui";
import { IconNodes, IconShield } from "../components/icons";

export default function Clients() {
  const { runs, disabledClients, toggleClient, toast } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";

  const defaultDataset = useMemo(() => {
    const last = runs.find((r) => true);
    return last?.datasetId ?? "cardio";
  }, [runs]);
  const [datasetId, setDatasetId] = useState(defaultDataset);

  const lastRun = useMemo(() => runs.find((r) => r.datasetId === datasetId), [runs, datasetId]);
  const nClients = lastRun?.config.nClients ?? 5;
  const alpha = lastRun?.config.alpha ?? 1.2;

  const { clients } = useMemo(() => {
    const ds = getDataset(datasetId);
    const [trainIdx] = trainTestSplit(ds);
    const disabled = new Set(disabledClients[datasetId] ?? []);
    return partitionDataset(ds, nClients, alpha, trainIdx, disabled);
  }, [datasetId, nClients, alpha, disabledClients]);

  const meta = getDatasetMeta(datasetId);
  const totalRows = clients.reduce((a, c) => a + c.nSamples, 0);
  const avgPos = clients.reduce((a, c) => a + c.positiveRate, 0) / clients.length;
  const enabled = clients.filter((c) => c.enabled).length;
  const cohortAcc =
    lastRun && lastRun.rounds.length > 0
      ? lastRun.rounds[lastRun.rounds.length - 1].clientAccs.reduce((a, b) => a + b, 0) /
        Math.max(1, lastRun.rounds[lastRun.rounds.length - 1].clientAccs.length)
      : null;

  const driftBadge = (d: number) =>
    d < 0.12 ? (
      <Badge tone="lime">near-IID</Badge>
    ) : d < 0.45 ? (
      <Badge tone="ember">moderate skew</Badge>
    ) : (
      <Badge tone="rose">high skew</Badge>
    );

  return (
    <div className="space-y-4">
      <Panel
        title="Client federation registry"
        sub="Each client trains on-premise; toggling a client out excludes it from the next aggregation round"
        delay={0}
        right={
          <div className="flex gap-1">
            {DATASETS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDatasetId(d.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all",
                  datasetId === d.id
                    ? "border-signal-500/60 bg-signal-500/10 text-signal-300"
                    : "border-line text-fog-400 hover:text-fog-200"
                )}
              >
                {d.sector}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { k: "Enrolled clients", v: `${enabled}/${clients.length}` },
            { k: "Local rows (pooled count)", v: totalRows.toLocaleString() },
            { k: "Avg positive rate", v: `${(avgPos * 100).toFixed(1)}%` },
            { k: "Heterogeneity α", v: alpha.toFixed(1) },
            { k: "Cohort local accuracy", v: cohortAcc ? `${(cohortAcc * 100).toFixed(1)}%` : "—" },
          ].map((s, i) => (
            <div key={s.k} className="rounded-lg border border-line-soft bg-ink-900/50 px-3.5 py-3 reveal" style={{ ["--d" as string]: `${i * 40}ms` }}>
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-fog-500">{s.k}</div>
              <div className="font-display text-[19px] font-bold text-fog-50 mt-0.5">{s.v}</div>
            </div>
          ))}
        </div>
        {isGuest && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-ember-300">
            <IconShield width={14} height={14} /> Guest Mode — the client registry is read-only. Create an account to change participation.
          </div>
        )}
      </Panel>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {clients.map((c, i) => (
          <div
            key={c.id}
            className={cn("panel p-4 reveal transition-all hover:border-ink-500", !c.enabled && "opacity-55")}
            style={{ ["--d" as string]: `${i * 55}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center border", c.enabled ? "bg-signal-500/10 border-signal-500/40 text-signal-400" : "bg-ink-700/50 border-line text-fog-500")}>
                  <IconNodes width={17} height={17} />
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-fog-50 font-display">{c.name}</div>
                  <div className="text-[11.5px] text-fog-500 truncate max-w-[150px]">{c.org}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isGuest ? (
                  <LockPill label="locked" />
                ) : (
                  <Toggle
                    checked={c.enabled}
                    onChange={() => {
                      toggleClient(datasetId, c.id);
                      toast("info", `${c.name} ${c.enabled ? "withdrawn from" : "enrolled in"} the federation.`);
                    }}
                  />
                )}
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-md bg-ink-900/60 border border-line-soft px-2.5 py-2">
                <div className="text-fog-500 text-[10.5px] font-mono uppercase">Local rows</div>
                <div className="font-mono text-fog-100 mt-0.5">{c.nSamples.toLocaleString()}</div>
              </div>
              <div className="rounded-md bg-ink-900/60 border border-line-soft px-2.5 py-2">
                <div className="text-fog-500 text-[10.5px] font-mono uppercase">Region</div>
                <div className="font-mono text-fog-100 mt-0.5">{c.region}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-[11px] font-mono text-fog-500 mb-1">
                <span>label balance</span>
                <span>
                  <span className="text-rose-300">{(c.positiveRate * 100).toFixed(0)}%</span> {meta.positiveLabel.toLowerCase()} ·{" "}
                  <span className="text-signal-300">{((1 - c.positiveRate) * 100).toFixed(0)}%</span> {meta.negativeLabel.toLowerCase()}
                </span>
              </div>
              <div className="flex h-[8px] rounded-full overflow-hidden bg-ink-700">
                <div className="bg-rose-400/80 transition-all duration-500" style={{ width: `${c.positiveRate * 100}%` }} />
                <div className="bg-signal-600/80 flex-1" />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              {driftBadge(c.drift)}
              <span className="text-[10.5px] font-mono text-fog-600 flex items-center gap-1">
                <IconShield width={11} height={11} /> raw data on-premise
              </span>
            </div>
          </div>
        ))}
      </div>

      <Panel title="Why clients look different" sub="The effect of non-IID data on federation" delay={120}>
        <p className="text-[13px] text-fog-400 leading-relaxed max-w-3xl">
          Each card's <span className="font-mono text-fog-200">label balance</span> comes from a Dirichlet(α={alpha.toFixed(1)}) split of the{" "}
          {meta.name} dataset — the same way real hospitals or banks hold skewed local data. High-skew clients are exactly where{" "}
          <span className="text-signal-300">FedProx's proximal term</span> and <span className="text-signal-300">partial participation</span> keep the
          global model stable, while differential privacy bounds what any single update can reveal about its rows.
        </p>
      </Panel>
    </div>
  );
}
