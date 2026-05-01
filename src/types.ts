export type SyncMode = "pull-only" | "push-only" | "bidirectional";

export type SyncProfile = {
  id?: number;
  name: string;
  baseUrl: string;
  localRoot: string;
  remoteRoot: string;
  mode: SyncMode;
  createdAt?: string;
  updatedAt?: string;
};

export type ProbeResult = {
  normalizedBaseUrl: string;
  pageTitle: string;
  rootEntryCount: number;
};

export type TreeEntry = {
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
};

export type BaselineEntry = {
  relativePath: string;
};

export type TombstoneSide = "local" | "remote";

export type TombstoneStatus = "pending" | "resolved";

export type TombstoneEntry = {
  profileName: string;
  relativePath: string;
  deletedOn: TombstoneSide;
  status: TombstoneStatus;
  createdAt: string;
  resolvedAt?: string | null;
};

export type ScanSummary = {
  localFiles: number;
  localDirs: number;
  remoteFiles: number;
  remoteDirs: number;
};

export type PlannedActionKind =
  | "upload"
  | "download"
  | "conflict"
  | "skip"
  | "local-delete"
  | "remote-delete"
  | "delete-candidate";

export type PlannedAction = {
  path: string;
  kind: PlannedActionKind;
  reason: string;
  localSize?: number;
  remoteSize?: number;
  tombstoneSide?: TombstoneSide;
};

export type PlanSummary = {
  upload: number;
  download: number;
  conflict: number;
  skip: number;
  localDelete: number;
  remoteDelete: number;
  deleteCandidate: number;
  sample: PlannedAction[];
};

export type SyncRunSummary = {
  profileName: string;
  baseUrl: string;
  mode: SyncMode;
  probe: ProbeResult;
  scan: ScanSummary;
  plan: PlanSummary;
  baselineEntryCount: number;
  pendingTombstoneCount: number;
  currentEntries: BaselineEntry[];
  actions: PlannedAction[];
};

export type SyncRunRecord = {
  id: number;
  profileName: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed";
  summary: SyncRunSummary;
};

export type ExecutionProgressPhase = "planning" | "running" | "completed" | "failed";

export type RunProgressPhase =
  | "validating-local-root"
  | "probing-device"
  | "scanning-local"
  | "scanning-remote"
  | "building-plan"
  | "completed";

export type RunProgress = {
  phase: RunProgressPhase;
};

export type ExecutionProgress = {
  phase: ExecutionProgressPhase;
  totalActions: number;
  completedActions: number;
  currentAction?: PlannedAction;
  lastCompletedAction?: PlannedAction;
  failedAction?: PlannedAction;
  errorMessage?: string;
};
