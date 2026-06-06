import type {
  BatchJob,
  BillingAccount,
  PointLedgerEntry,
  Project,
  Thumbnail,
  Video
} from "@/lib/types";

type LocalStore = {
  billingAccounts: BillingAccount[];
  pointLedger: PointLedgerEntry[];
  projects: Project[];
  batchJobs: BatchJob[];
  videos: Video[];
  thumbnails: Thumbnail[];
  files: Map<string, { buffer: Buffer; contentType: string; dataUrl: string }>;
  runningBatches: Set<string>;
  runningVideos: Set<string>;
  runningTasks: Set<string>;
};

declare global {
  // eslint-disable-next-line no-var
  var thumbnailFlowLocalStore: LocalStore | undefined;
}

export function getLocalStore() {
  if (!globalThis.thumbnailFlowLocalStore) {
    globalThis.thumbnailFlowLocalStore = {
      billingAccounts: [],
      pointLedger: [],
      projects: [],
      batchJobs: [],
      videos: [],
      thumbnails: [],
      files: new Map(),
      runningBatches: new Set(),
      runningVideos: new Set(),
      runningTasks: new Set()
    };
  }

  return globalThis.thumbnailFlowLocalStore;
}
