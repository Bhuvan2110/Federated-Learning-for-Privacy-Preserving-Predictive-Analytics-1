/* FedShield — federated client registry with Add Extra Client & Delete Node capabilities */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { DATASETS, getDataset, getDatasetMeta, partitionDataset, trainTestSplit } from "../lib/datasets";
import { Badge, Button, LockPill, Modal, Panel, Toggle, cn } from "../components/ui";
import { IconNodes, IconPlus, IconRefresh, IconShield, IconTrash } from "../components/icons";

export default function Clients() {
  const {
    runs,
    disabledClients,
    customClients,
    deletedClients,
    toggleClient,
    addCustomClient,
    deleteClient,
    resetClients,
    toast,
  } = useApp();
  const { user } = useAuth();
  const isGuest = user?.role === "guest";
  const [addModalOpen, setAddModalOpen] = useState(false);

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
    return partitionDataset(ds, nClients, alpha, trainIdx, disabled, customClients, deletedClients);
  }, [datasetId, nClients, alpha, disabledClients, customClients, deletedClients]);

  const meta = getDatasetMeta(datasetId);
  const totalRows = clients.reduce((a, c) => a + c.nSamples, 0);
  const avgPos = clients.length > 0 ? clients.reduce((a, c) => a + c.positiveRate, 0) / clients.length : 0;
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
        sub="Each client node trains on-premise. You can add extra client nodes, toggle participation off/on, or delete nodes."
        delay={0}
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddModalOpen(true)} disabled={isGuest}>
              <IconPlus width={14} height={14} /> Add Extra Client
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { resetClients(datasetId); toast("info", "Reset client registry to defaults."); }}>
              <IconRefresh width={14} height={14} /> Reset Defaults
            </Button>
          </div>
        }
      >
        <div className="flex gap-1.5 mb-4 flex-wrap">
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
              {d.name} ({d.sector})
            </button>
          ))}
        </div>

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
            <IconShield width={14} height={14} /> Guest Mode — registry is read-only. Create an account to add, turn off, or delete client nodes.
          </div>
        )}
      </Panel>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {clients.map((c, i) => (
          <div
            key={c.id}
            className={cn("panel p-4 reveal transition-all hover:border-ink-500 flex flex-col justify-between", !c.enabled && "opacity-55")}
            style={{ ["--d" as string]: `${i * 55}ms` }}
          >
            <div>
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
                    <>
                      <Toggle
                        checked={c.enabled}
                        onChange={() => {
                          toggleClient(datasetId, c.id);
                          toast("info", `${c.name} ${c.enabled ? "turned off (withdrawn from)" : "turned on (enrolled in)"} the federation.`);
                        }}
                      />
                      <button
                        onClick={() => {
                          deleteClient(datasetId, c.id);
                          toast("warn", `Deleted client node “${c.name}” from ${meta.name} registry.`);
                        }}
                        className="text-fog-500 hover:text-rose-400 transition-colors p-1"
                        title="Delete client node"
                      >
                        <IconTrash width={15} height={15} />
                      </button>
                    </>
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
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-2.5">
              {driftBadge(c.drift)}
              <span className="text-[10.5px] font-mono text-fog-600 flex items-center gap-1">
                <IconShield width={11} height={11} /> raw data on-premise
              </span>
            </div>
          </div>
        ))}
      </div>

      <AddClientModal
        open={addModalOpen}
        datasetId={datasetId}
        onClose={() => setAddModalOpen(false)}
        onAdd={(newClient) => {
          addCustomClient(newClient);
          toast("success", `Added extra client node “${newClient.name}” to ${meta.name} registry.`);
        }}
      />
    </div>
  );
}

function AddClientModal({
  open,
  datasetId,
  onClose,
  onAdd,
}: {
  open: boolean;
  datasetId: string;
  onClose: () => void;
  onAdd: (c: { datasetId: string; name: string; org: string; region: string; nSamples: number; positiveRate: number }) => void;
}) {
  const [name, setName] = useState("Client Node " + String.fromCharCode(65 + Math.floor(Math.random() * 26)));
  const [org, setOrg] = useState("St. Jude Medical Network");
  const [region, setRegion] = useState("US-East (N. Virginia)");
  const [nSamples, setNSamples] = useState(250);
  const [posRate, setPosRate] = useState(0.35);

  const submit = () => {
    onAdd({
      datasetId,
      name,
      org,
      region,
      nSamples,
      positiveRate: posRate,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Extra Client Node to Federation" width="max-w-md">
      <div className="space-y-3.5">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-fog-400 mb-1">Client Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Metro Clinical Node F"
            className="w-full bg-ink-950 border border-line rounded-lg px-3 py-2 text-xs font-mono text-fog-100 outline-none focus:border-signal-600"
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-fog-400 mb-1">Organization / Affiliate</label>
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="e.g. Apex Health Consortium"
            className="w-full bg-ink-950 border border-line rounded-lg px-3 py-2 text-xs font-mono text-fog-100 outline-none focus:border-signal-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-fog-400 mb-1">Region</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="EU-West"
              className="w-full bg-ink-950 border border-line rounded-lg px-3 py-2 text-xs font-mono text-fog-100 outline-none focus:border-signal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-fog-400 mb-1">Local Rows</label>
            <input
              type="number"
              value={nSamples}
              onChange={(e) => setNSamples(parseInt(e.target.value) || 100)}
              className="w-full bg-ink-950 border border-line rounded-lg px-3 py-2 text-xs font-mono text-fog-100 outline-none focus:border-signal-600"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>
            <IconPlus width={14} height={14} /> Add Client Node
          </Button>
        </div>
      </div>
    </Modal>
  );
}
