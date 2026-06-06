export const SUPPORTED_FORMATS = ["16:9", "1:1", "9:16", "4:5"] as const;
export const THUMBNAIL_COUNT_OPTIONS = [1, 2, 3, 5, 10] as const;
export const MAX_VIDEOS_PER_BATCH = 10;
export const MAX_THUMBNAILS_PER_VIDEO = 10;
export const MAX_IMAGES_PER_BATCH = 200;

export type OutputFormat = (typeof SUPPORTED_FORMATS)[number];
export type ThumbnailCountOption = (typeof THUMBNAIL_COUNT_OPTIONS)[number];
export type SourceType = "youtube_link" | "uploaded_video";

export const FORMAT_DIMENSIONS: Record<OutputFormat, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 }
};

export type BatchStatus = "queued" | "running" | "completed" | "failed";
export type BillingPlanKey = "free" | "starter" | "creator" | "pro" | "agency";

export type VideoStatus =
  | "queued"
  | "analyzing"
  | "analyzing_video"
  | "writing_prompt"
  | "generating_prompt"
  | "generating_thumbnails"
  | "completed"
  | "failed";

export type ThumbnailStatus = "generated" | "failed";

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type BatchJob = {
  id: string;
  projectId: string;
  accountId: string | null;
  status: BatchStatus;
  totalVideos: number;
  processedVideos: number;
  globalThumbnailCount: number;
  selectedFormats: OutputFormat[];
  totalImagesRequested: number;
  totalImagesCompleted: number;
  pointsReserved: number;
  pointsSpent: number;
  pointsRefunded: number;
  pointsReservationRef: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Video = {
  id: string;
  batchJobId: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  uploadedVideoPath: string | null;
  uploadedVideoUrl: string | null;
  uploadedVideoName: string | null;
  referenceImagePath: string | null;
  referenceImageUrl: string | null;
  perVideoThumbnailCount: number | null;
  notes: string | null;
  transcript: string | null;
  title: string | null;
  description: string | null;
  generatedTitle: string | null;
  generatedDescription: string | null;
  hashtags: string[];
  thumbnailPrompt: string | null;
  status: VideoStatus;
  statusDetail: string | null;
  errorMessage: string | null;
  saved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Thumbnail = {
  id: string;
  batchJobId: string;
  videoId: string;
  conceptNumber: number;
  format: OutputFormat;
  storagePath: string;
  publicUrl: string;
  prompt: string;
  width: number;
  height: number;
  status: ThumbnailStatus;
  saved: boolean;
  createdAt: string;
};

export type VideoWithThumbnails = Video & {
  thumbnails: Thumbnail[];
};

export type BatchWithVideos = BatchJob & {
  project: Project | null;
  videos: VideoWithThumbnails[];
};

export type CreativePack = {
  improvedTitle: string;
  improvedDescription: string;
  hashtags: string[];
  thumbnailPrompt: string;
};

export type YouTubeMetadata = {
  title: string;
  description: string;
  channelTitle?: string;
  thumbnailUrl?: string;
};

export type BillingAccount = {
  id: string;
  userId: string | null;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  planKey: BillingPlanKey;
  pointsBalance: number;
  lifetimePointsPurchased: number;
  createdAt: string;
  updatedAt: string;
};

export type PointLedgerEntry = {
  id: string;
  accountId: string;
  delta: number;
  reason: string;
  reference: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
