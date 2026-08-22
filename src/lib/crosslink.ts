/* FedShield — tiny cross-page pub/sub (dataset → lab, run → analytics) */

type LabListener = (datasetId: string) => void;
const labListeners = new Set<LabListener>();

export function onLabRequest(l: LabListener): () => void {
  labListeners.add(l);
  return () => {
    labListeners.delete(l);
  };
}

export function requestLab(datasetId: string) {
  labListeners.forEach((l) => l(datasetId));
}

type RunListener = (runId: string) => void;
const runListeners = new Set<RunListener>();
let pendingRunId: string | null = null;

export function onRunRequest(l: RunListener): () => void {
  runListeners.add(l);
  return () => {
    runListeners.delete(l);
  };
}

export function requestRun(runId: string) {
  pendingRunId = runId;
  runListeners.forEach((l) => l(runId));
}

export function consumePendingRun(): string | null {
  const v = pendingRunId;
  pendingRunId = null;
  return v;
}
