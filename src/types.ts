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
  size: number;
  hash: string;
};

export type ScanSummary = {
  localFiles: number;
  localDirs: number;
  remoteFiles: number;
  remoteDirs: number;
};

export type PlannedActionKind = "upload" | "download" | "conflict" | "skip";

export type PlannedAction = {
  path: string;
  kind: PlannedActionKind;
  reason: string;
  localSize?: number;
  remoteSize?: number;
};

export type PlanSummary = {
  upload: number;
  download: number;
  conflict: number;
  skip: number;
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
