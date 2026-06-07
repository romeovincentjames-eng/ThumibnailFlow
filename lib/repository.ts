import { getLocalStore } from "@/lib/localStore";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyBillingAccountOverrides, isUnlimitedBillingAccount } from "@/lib/billingOverrides";
import type {
  BatchJob,
  BatchStatus,
  BatchWithVideos,
  BillingAccount,
  OutputFormat,
  PointLedgerEntry,
  Project,
  SourceType,
  Thumbnail,
  ThumbnailStatus,
  Video,
  VideoStatus
} from "@/lib/types";

type CreateBatchJobInput = {
  projectId: string;
  accountId: string | null;
  totalVideos: number;
  selectedFormats: OutputFormat[];
  globalThumbnailCount: number;
  totalImagesRequested: number;
  pointsReserved?: number;
  pointsReservationRef?: string | null;
};

type CreateVideoInput = {
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
};

type CreateThumbnailInput = {
  batchJobId: string;
  videoId: string;
  conceptNumber: number;
  format: OutputFormat;
  storagePath: string;
  publicUrl: string;
  prompt: string;
  width: number;
  height: number;
  status?: ThumbnailStatus;
};

type VideoPatch = Partial<
  Pick<
    Video,
    | "sourceType"
    | "sourceUrl"
    | "uploadedVideoPath"
    | "uploadedVideoUrl"
    | "uploadedVideoName"
    | "referenceImagePath"
    | "referenceImageUrl"
    | "perVideoThumbnailCount"
    | "title"
    | "description"
    | "generatedTitle"
    | "generatedDescription"
    | "hashtags"
    | "thumbnailPrompt"
    | "status"
    | "statusDetail"
    | "errorMessage"
    | "saved"
  >
>;

type BatchPatch = Partial<
  Pick<
    BatchJob,
    | "status"
    | "processedVideos"
    | "totalImagesCompleted"
    | "pointsSpent"
    | "pointsRefunded"
    | "errorMessage"
  >
>;

type ThumbnailPatch = Partial<Pick<Thumbnail, "status" | "saved">>;

type BillingAccountPatch = Partial<
  Pick<
    BillingAccount,
    | "userId"
    | "email"
    | "stripeCustomerId"
    | "stripeSubscriptionId"
    | "stripeSubscriptionStatus"
    | "planKey"
  >
>;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const toProject = (row: Record<string, any>): Project => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toBatch = (row: Record<string, any>): BatchJob => ({
  id: row.id,
  projectId: row.project_id,
  accountId: row.account_id ?? null,
  status: row.status,
  totalVideos: row.total_videos,
  processedVideos: row.processed_videos ?? 0,
  globalThumbnailCount: row.global_thumbnail_count ?? 3,
  selectedFormats: row.selected_formats ?? [],
  totalImagesRequested: row.total_images_requested ?? 0,
  totalImagesCompleted: row.total_images_completed ?? 0,
  pointsReserved: row.points_reserved ?? 0,
  pointsSpent: row.points_spent ?? 0,
  pointsRefunded: row.points_refunded ?? 0,
  pointsReservationRef: row.points_reservation_ref ?? null,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toBillingAccount = (row: Record<string, any>): BillingAccount =>
  applyBillingAccountOverrides({
    id: row.id,
    userId: row.user_id ?? null,
    email: row.email ?? null,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
    stripeSubscriptionStatus: row.stripe_subscription_status ?? null,
    planKey: row.plan_key ?? "free",
    pointsBalance: row.points_balance ?? 0,
    lifetimePointsPurchased: row.lifetime_points_purchased ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });

const toPointLedgerEntry = (row: Record<string, any>): PointLedgerEntry => ({
  id: row.id,
  accountId: row.account_id,
  delta: row.delta,
  reason: row.reason,
  reference: row.reference,
  metadata: row.metadata ?? {},
  createdAt: row.created_at
});

const toVideo = (row: Record<string, any>): Video => ({
  id: row.id,
  batchJobId: row.batch_job_id,
  sourceType: row.source_type ?? "youtube_link",
  sourceUrl: row.source_url ?? null,
  uploadedVideoPath: row.uploaded_video_path ?? null,
  uploadedVideoUrl: row.uploaded_video_url ?? null,
  uploadedVideoName: row.uploaded_video_name ?? null,
  referenceImagePath: row.reference_image_path,
  referenceImageUrl: row.reference_image_url,
  perVideoThumbnailCount: row.per_video_thumbnail_count ?? null,
  notes: row.notes,
  transcript: row.transcript,
  title: row.title,
  description: row.description,
  generatedTitle: row.generated_title,
  generatedDescription: row.generated_description,
  hashtags: row.hashtags ?? [],
  thumbnailPrompt: row.thumbnail_prompt,
  status: row.status,
  statusDetail: row.status_detail ?? null,
  errorMessage: row.error_message,
  saved: Boolean(row.saved),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toThumbnail = (row: Record<string, any>): Thumbnail => ({
  id: row.id,
  batchJobId: row.batch_job_id,
  videoId: row.video_id,
  conceptNumber: row.concept_number ?? 1,
  format: row.format,
  storagePath: row.image_storage_path ?? row.storage_path,
  publicUrl: row.public_url,
  prompt: row.prompt_used ?? row.prompt,
  width: row.width,
  height: row.height,
  status: row.status,
  saved: Boolean(row.saved),
  createdAt: row.created_at
});

function toSnakePatch(patch: VideoPatch | BatchPatch | ThumbnailPatch | BillingAccountPatch) {
  const mapped: Record<string, any> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (key === "sourceType") mapped.source_type = value;
    else if (key === "sourceUrl") mapped.source_url = value;
    else if (key === "uploadedVideoPath") mapped.uploaded_video_path = value;
    else if (key === "uploadedVideoUrl") mapped.uploaded_video_url = value;
    else if (key === "uploadedVideoName") mapped.uploaded_video_name = value;
    else if (key === "referenceImagePath") mapped.reference_image_path = value;
    else if (key === "referenceImageUrl") mapped.reference_image_url = value;
    else if (key === "perVideoThumbnailCount") mapped.per_video_thumbnail_count = value;
    else if (key === "generatedTitle") mapped.generated_title = value;
    else if (key === "generatedDescription") mapped.generated_description = value;
    else if (key === "thumbnailPrompt") mapped.thumbnail_prompt = value;
    else if (key === "statusDetail") mapped.status_detail = value;
    else if (key === "errorMessage") mapped.error_message = value;
    else if (key === "accountId") mapped.account_id = value;
    else if (key === "processedVideos") mapped.processed_videos = value;
    else if (key === "totalImagesCompleted") mapped.total_images_completed = value;
    else if (key === "pointsReserved") mapped.points_reserved = value;
    else if (key === "pointsSpent") mapped.points_spent = value;
    else if (key === "pointsRefunded") mapped.points_refunded = value;
    else if (key === "pointsReservationRef") mapped.points_reservation_ref = value;
    else if (key === "userId") mapped.user_id = value;
    else if (key === "stripeCustomerId") mapped.stripe_customer_id = value;
    else if (key === "stripeSubscriptionId") mapped.stripe_subscription_id = value;
    else if (key === "stripeSubscriptionStatus") mapped.stripe_subscription_status = value;
    else if (key === "planKey") mapped.plan_key = value;
    else mapped[key] = value;
  }

  mapped.updated_at = now();
  return mapped;
}

function sortThumbnails(thumbnails: Thumbnail[]) {
  return [...thumbnails].sort((a, b) => {
    if (a.conceptNumber !== b.conceptNumber) {
      return a.conceptNumber - b.conceptNumber;
    }

    return a.format.localeCompare(b.format);
  });
}

class Repository {
  async createBillingAccount(input?: { userId?: string | null; email?: string | null }) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("billing_accounts")
        .insert({
          user_id: input?.userId ?? null,
          email: input?.email ?? null,
          plan_key: "free",
          points_balance: 20,
          lifetime_points_purchased: 20
        })
        .select("*")
        .single();

      if (error) throw error;

      const account = toBillingAccount(data);
      await this.createPointLedgerEntry({
        accountId: account.id,
        delta: 20,
        reason: "free_trial",
        reference: `free_trial:${account.id}`,
        metadata: { planKey: "free" }
      });
      return applyBillingAccountOverrides(account);
    }

    const account: BillingAccount = {
      id: id(),
      userId: input?.userId ?? null,
      email: input?.email ?? null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      planKey: "free",
      pointsBalance: 20,
      lifetimePointsPurchased: 20,
      createdAt: now(),
      updatedAt: now()
    };
    getLocalStore().billingAccounts.push(account);
    getLocalStore().pointLedger.push({
      id: id(),
      accountId: account.id,
      delta: 20,
      reason: "free_trial",
      reference: `free_trial:${account.id}`,
      metadata: { planKey: "free" },
      createdAt: now()
    });
    return applyBillingAccountOverrides(account);
  }

  async getBillingAccount(accountId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("billing_accounts")
        .select("*")
        .eq("id", accountId)
        .single();

      if (error) return null;
      return toBillingAccount(data);
    }

    return applyBillingAccountOverrides(
      getLocalStore().billingAccounts.find((account) => account.id === accountId) ?? null
    );
  }

  async getBillingAccountByUserId(userId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("billing_accounts")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) return null;
      return toBillingAccount(data);
    }

    return applyBillingAccountOverrides(
      getLocalStore().billingAccounts.find((account) => account.userId === userId) ?? null
    );
  }

  async getBillingAccountByStripeCustomerId(stripeCustomerId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("billing_accounts")
        .select("*")
        .eq("stripe_customer_id", stripeCustomerId)
        .maybeSingle();

      if (error || !data) return null;
      return toBillingAccount(data);
    }

    return (
      applyBillingAccountOverrides(
        getLocalStore().billingAccounts.find((account) => account.stripeCustomerId === stripeCustomerId) ?? null
      )
    );
  }

  async updateBillingAccount(accountId: string, patch: BillingAccountPatch) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("billing_accounts")
        .update(toSnakePatch(patch))
        .eq("id", accountId)
        .select("*")
        .single();

      if (error) throw error;
      return toBillingAccount(data);
    }

    const account = getLocalStore().billingAccounts.find((item) => item.id === accountId);
    if (!account) return null;
    Object.assign(account, patch, { updatedAt: now() });
    return applyBillingAccountOverrides(account);
  }

  async applyPointsDelta(input: {
    accountId: string;
    delta: number;
    reason: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }) {
    const supabase = getSupabaseAdmin();
    const unlimitedAccount = await this.getBillingAccount(input.accountId);
    if (isUnlimitedBillingAccount(unlimitedAccount)) {
      return unlimitedAccount;
    }

    if (supabase) {
      const { data, error } = await supabase.rpc("apply_points_delta", {
        p_account_id: input.accountId,
        p_delta: input.delta,
        p_reason: input.reason,
        p_reference: input.reference,
        p_metadata: input.metadata ?? {}
      });

      if (error) throw error;
      return toBillingAccount(data);
    }

    const store = getLocalStore();
    const existing = store.pointLedger.find((entry) => entry.reference === input.reference);
    if (existing) {
      const account = store.billingAccounts.find((item) => item.id === existing.accountId);
      if (!account) throw new Error("Billing account not found.");
      return account;
    }

    const account = store.billingAccounts.find((item) => item.id === input.accountId);
    if (!account) throw new Error("Billing account not found.");

    const nextBalance = account.pointsBalance + input.delta;
    if (nextBalance < 0) {
      throw new Error("INSUFFICIENT_POINTS");
    }

    account.pointsBalance = nextBalance;
    account.lifetimePointsPurchased += Math.max(0, input.delta);
    account.updatedAt = now();
    store.pointLedger.push({
      id: id(),
      accountId: input.accountId,
      delta: input.delta,
      reason: input.reason,
      reference: input.reference,
      metadata: input.metadata ?? {},
      createdAt: now()
    });

    return account;
  }

  async getPointLedgerForAccount(accountId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("point_ledger")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data.map(toPointLedgerEntry);
    }

    return getLocalStore().pointLedger
      .filter((entry) => entry.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }

  private async createPointLedgerEntry(input: {
    accountId: string;
    delta: number;
    reason: string;
    reference: string;
    metadata: Record<string, unknown>;
  }) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase.from("point_ledger").insert({
        account_id: input.accountId,
        delta: input.delta,
        reason: input.reason,
        reference: input.reference,
        metadata: input.metadata
      });

      if (error) throw error;
      return;
    }

    getLocalStore().pointLedger.push({
      id: id(),
      accountId: input.accountId,
      delta: input.delta,
      reason: input.reason,
      reference: input.reference,
      metadata: input.metadata,
      createdAt: now()
    });
  }

  async createProject(name: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ name })
        .select("*")
        .single();

      if (error) throw error;
      return toProject(data);
    }

    const project: Project = {
      id: id(),
      name,
      createdAt: now(),
      updatedAt: now()
    };
    getLocalStore().projects.push(project);
    return project;
  }

  async createBatchJob(input: CreateBatchJobInput) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("batch_jobs")
        .insert({
          project_id: input.projectId,
          account_id: input.accountId,
          total_videos: input.totalVideos,
          processed_videos: 0,
          global_thumbnail_count: input.globalThumbnailCount,
          selected_formats: input.selectedFormats,
          total_images_requested: input.totalImagesRequested,
          total_images_completed: 0,
          points_reserved: input.pointsReserved ?? 0,
          points_spent: 0,
          points_refunded: 0,
          points_reservation_ref: input.pointsReservationRef ?? null,
          status: "queued"
        })
        .select("*")
        .single();

      if (error) throw error;
      return toBatch(data);
    }

    const job: BatchJob = {
      id: id(),
      projectId: input.projectId,
      accountId: input.accountId,
      status: "queued",
      totalVideos: input.totalVideos,
      processedVideos: 0,
      globalThumbnailCount: input.globalThumbnailCount,
      selectedFormats: input.selectedFormats,
      totalImagesRequested: input.totalImagesRequested,
      totalImagesCompleted: 0,
      pointsReserved: input.pointsReserved ?? 0,
      pointsSpent: 0,
      pointsRefunded: 0,
      pointsReservationRef: input.pointsReservationRef ?? null,
      errorMessage: null,
      createdAt: now(),
      updatedAt: now()
    };
    getLocalStore().batchJobs.push(job);
    return job;
  }

  async createVideo(input: CreateVideoInput) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("videos")
        .insert({
          batch_job_id: input.batchJobId,
          source_type: input.sourceType,
          source_url: input.sourceUrl,
          uploaded_video_path: input.uploadedVideoPath,
          uploaded_video_url: input.uploadedVideoUrl,
          uploaded_video_name: input.uploadedVideoName,
          reference_image_path: input.referenceImagePath,
          reference_image_url: input.referenceImageUrl,
          per_video_thumbnail_count: input.perVideoThumbnailCount,
          notes: input.notes,
          transcript: input.transcript,
          title: input.title,
          description: input.description,
          hashtags: [],
          status: "queued"
        })
        .select("*")
        .single();

      if (error) throw error;
      return toVideo(data);
    }

    const video: Video = {
      id: id(),
      batchJobId: input.batchJobId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      uploadedVideoPath: input.uploadedVideoPath,
      uploadedVideoUrl: input.uploadedVideoUrl,
      uploadedVideoName: input.uploadedVideoName,
      referenceImagePath: input.referenceImagePath,
      referenceImageUrl: input.referenceImageUrl,
      perVideoThumbnailCount: input.perVideoThumbnailCount,
      notes: input.notes,
      transcript: input.transcript,
      title: input.title,
      description: input.description,
      generatedTitle: null,
      generatedDescription: null,
      hashtags: [],
      thumbnailPrompt: null,
      status: "queued",
      statusDetail: null,
      errorMessage: null,
      saved: false,
      createdAt: now(),
      updatedAt: now()
    };
    getLocalStore().videos.push(video);
    return video;
  }

  async getBatchJob(batchId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase.from("batch_jobs").select("*").eq("id", batchId).single();
      if (error) return null;
      return toBatch(data);
    }

    return getLocalStore().batchJobs.find((job) => job.id === batchId) ?? null;
  }

  async getBatch(batchId: string): Promise<BatchWithVideos | null> {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data: batchRow, error: batchError } = await supabase
        .from("batch_jobs")
        .select("*")
        .eq("id", batchId)
        .single();

      if (batchError || !batchRow) return null;

      const { data: videoRows, error: videoError } = await supabase
        .from("videos")
        .select("*")
        .eq("batch_job_id", batchId)
        .order("created_at", { ascending: true });

      if (videoError) throw videoError;

      const videoIds = (videoRows ?? []).map((row) => row.id);
      const [projectResult, thumbnailsResult] = await Promise.all([
        supabase.from("projects").select("*").eq("id", batchRow.project_id).maybeSingle(),
        videoIds.length
          ? supabase.from("thumbnails").select("*").in("video_id", videoIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (thumbnailsResult.error) throw thumbnailsResult.error;

      const thumbnails = (thumbnailsResult.data ?? []).map(toThumbnail);
      const videos = (videoRows ?? []).map(toVideo).map((video) => ({
        ...video,
        thumbnails: sortThumbnails(thumbnails.filter((thumbnail) => thumbnail.videoId === video.id))
      }));

      return {
        ...toBatch(batchRow),
        project: projectResult.data ? toProject(projectResult.data) : null,
        videos
      };
    }

    const store = getLocalStore();
    const job = store.batchJobs.find((item) => item.id === batchId);
    if (!job) return null;

    const project = store.projects.find((item) => item.id === job.projectId) ?? null;
    const videos = store.videos
      .filter((video) => video.batchJobId === batchId)
      .map((video) => ({
        ...video,
        thumbnails: sortThumbnails(store.thumbnails.filter((thumbnail) => thumbnail.videoId === video.id))
      }));

    return {
      ...job,
      project,
      videos
    };
  }

  async getVideosForBatch(batchId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("batch_job_id", batchId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data.map(toVideo);
    }

    return getLocalStore().videos.filter((video) => video.batchJobId === batchId);
  }

  async getVideo(videoId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase.from("videos").select("*").eq("id", videoId).single();
      if (error) return null;
      return toVideo(data);
    }

    return getLocalStore().videos.find((video) => video.id === videoId) ?? null;
  }

  async getThumbnail(thumbnailId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase.from("thumbnails").select("*").eq("id", thumbnailId).single();
      if (error) return null;
      return toThumbnail(data);
    }

    return getLocalStore().thumbnails.find((thumbnail) => thumbnail.id === thumbnailId) ?? null;
  }

  async updateBatch(batchId: string, patch: BatchPatch) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase.from("batch_jobs").update(toSnakePatch(patch)).eq("id", batchId);
      if (error) throw error;
      return;
    }

    const job = getLocalStore().batchJobs.find((item) => item.id === batchId);
    if (job) {
      Object.assign(job, patch, { updatedAt: now() });
    }
  }

  async updateVideo(videoId: string, patch: VideoPatch) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase.from("videos").update(toSnakePatch(patch)).eq("id", videoId);
      if (error) throw error;
      return;
    }

    const video = getLocalStore().videos.find((item) => item.id === videoId);
    if (video) {
      Object.assign(video, patch, { updatedAt: now() });
    }
  }

  async updateThumbnail(thumbnailId: string, patch: ThumbnailPatch) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase.from("thumbnails").update(toSnakePatch(patch)).eq("id", thumbnailId);
      if (error) throw error;
      return;
    }

    const thumbnail = getLocalStore().thumbnails.find((item) => item.id === thumbnailId);
    if (thumbnail) {
      Object.assign(thumbnail, patch);
    }
  }

  async createThumbnail(input: CreateThumbnailInput) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data, error } = await supabase
        .from("thumbnails")
        .insert({
          batch_job_id: input.batchJobId,
          video_id: input.videoId,
          concept_number: input.conceptNumber,
          format: input.format,
          image_storage_path: input.storagePath,
          public_url: input.publicUrl,
          prompt_used: input.prompt,
          width: input.width,
          height: input.height,
          status: input.status ?? "generated"
        })
        .select("*")
        .single();

      if (error) throw error;
      return toThumbnail(data);
    }

    const thumbnail: Thumbnail = {
      id: id(),
      batchJobId: input.batchJobId,
      videoId: input.videoId,
      conceptNumber: input.conceptNumber,
      format: input.format,
      storagePath: input.storagePath,
      publicUrl: input.publicUrl,
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      status: input.status ?? "generated",
      saved: false,
      createdAt: now()
    };
    getLocalStore().thumbnails.push(thumbnail);
    return thumbnail;
  }

  async deleteThumbnail(thumbnailId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase.from("thumbnails").delete().eq("id", thumbnailId);
      if (error) throw error;
      return;
    }

    const store = getLocalStore();
    store.thumbnails = store.thumbnails.filter((thumbnail) => thumbnail.id !== thumbnailId);
  }

  async deleteThumbnailsForVideo(videoId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase.from("thumbnails").delete().eq("video_id", videoId);
      if (error) throw error;
      return;
    }

    const store = getLocalStore();
    store.thumbnails = store.thumbnails.filter((thumbnail) => thumbnail.videoId !== videoId);
  }

  async deleteThumbnailsForConcept(videoId: string, conceptNumber: number) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase
        .from("thumbnails")
        .delete()
        .eq("video_id", videoId)
        .eq("concept_number", conceptNumber);
      if (error) throw error;
      return;
    }

    const store = getLocalStore();
    store.thumbnails = store.thumbnails.filter(
      (thumbnail) => thumbnail.videoId !== videoId || thumbnail.conceptNumber !== conceptNumber
    );
  }

  async deleteThumbnailForFormat(videoId: string, conceptNumber: number, format: OutputFormat) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase
        .from("thumbnails")
        .delete()
        .eq("video_id", videoId)
        .eq("concept_number", conceptNumber)
        .eq("format", format);
      if (error) throw error;
      return;
    }

    const store = getLocalStore();
    store.thumbnails = store.thumbnails.filter(
      (thumbnail) =>
        thumbnail.videoId !== videoId ||
        thumbnail.conceptNumber !== conceptNumber ||
        thumbnail.format !== format
    );
  }

  async deleteVideo(videoId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      await this.deleteThumbnailsForVideo(videoId);
      const { error } = await supabase.from("videos").delete().eq("id", videoId);
      if (error) throw error;
      return;
    }

    const store = getLocalStore();
    store.thumbnails = store.thumbnails.filter((thumbnail) => thumbnail.videoId !== videoId);
    store.videos = store.videos.filter((video) => video.id !== videoId);
  }

  async countProcessedVideos(batchId: string) {
    const videos = await this.getVideosForBatch(batchId);
    return videos.filter((video) => video.status === "completed" || video.status === "failed").length;
  }

  async countGeneratedImages(batchId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { count, error } = await supabase
        .from("thumbnails")
        .select("id", { count: "exact", head: true })
        .eq("batch_job_id", batchId)
        .eq("status", "generated");

      if (error) throw error;
      return count ?? 0;
    }

    return getLocalStore().thumbnails.filter(
      (thumbnail) => thumbnail.batchJobId === batchId && thumbnail.status === "generated"
    ).length;
  }

  async countGeneratedImagesForVideo(videoId: string) {
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { count, error } = await supabase
        .from("thumbnails")
        .select("id", { count: "exact", head: true })
        .eq("video_id", videoId)
        .eq("status", "generated");

      if (error) throw error;
      return count ?? 0;
    }

    return getLocalStore().thumbnails.filter(
      (thumbnail) => thumbnail.videoId === videoId && thumbnail.status === "generated"
    ).length;
  }
}

const repository = new Repository();

export function getRepository() {
  return repository;
}

export function isVideoStatus(value: string): value is VideoStatus {
  return [
    "queued",
    "analyzing",
    "analyzing_video",
    "writing_prompt",
    "generating_prompt",
    "generating_thumbnails",
    "completed",
    "failed"
  ].includes(value);
}

export function isBatchStatus(value: string): value is BatchStatus {
  return ["queued", "running", "completed", "failed"].includes(value);
}
