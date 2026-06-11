import { generateCreativePack, generateThumbnailImage, normalizeThumbnailBuffer } from "@/lib/openai";
import { POINT_COSTS, estimateVideoPoints } from "@/lib/points";
import { getRepository } from "@/lib/repository";
import { getStoredFileBuffer, uploadBuffer } from "@/lib/storage";
import { extractYouTubeMetadata } from "@/lib/youtube";
import {
  FORMAT_DIMENSIONS,
  type BatchJob,
  type CreativePack,
  type OutputFormat,
  type Thumbnail,
  type Video,
  type YouTubeMetadata
} from "@/lib/types";

export type PointReservationContext = {
  accountId: string;
  reservedPoints: number;
  refundReference: string;
  reservationReference: string;
};

export async function processBatch(batchId: string) {
  const repository = getRepository();
  const batch = await repository.getBatchJob(batchId);
  if (!batch) throw new Error(`Batch job ${batchId} was not found.`);

  await repository.updateBatch(batchId, {
    status: "running",
    errorMessage: null,
    totalImagesCompleted: await repository.countGeneratedImages(batchId)
  });

  const videos = await repository.getVideosForBatch(batchId);

  for (const video of videos) {
    if (video.status === "completed") {
      continue;
    }

    await processVideo(video, batch, getBatchVideoReservation(video, batch));
    await refreshBatchProgress(batch.id);
  }

  await repository.updateBatch(batchId, {
    status: "completed",
    processedVideos: await repository.countProcessedVideos(batchId),
    totalImagesCompleted: await repository.countGeneratedImages(batchId)
  });
}

export async function processVideoById(videoId: string, reservation?: PointReservationContext) {
  const repository = getRepository();
  const video = await repository.getVideo(videoId);
  if (!video) throw new Error(`Video ${videoId} was not found.`);

  const batch = await repository.getBatchJob(video.batchJobId);
  if (!batch) throw new Error(`Batch job ${video.batchJobId} was not found.`);

  await repository.deleteThumbnailsForVideo(video.id);
  await refreshBatchProgress(batch.id);
  await processVideo(video, batch, reservation);
  await maybeCompleteBatch(batch.id);
}

export async function processConceptByVideoId(
  videoId: string,
  conceptNumber: number,
  reservation?: PointReservationContext
) {
  const repository = getRepository();
  let createdImages = 0;

  try {
    const video = await repository.getVideo(videoId);
    if (!video) throw new Error(`Video ${videoId} was not found.`);

    const batch = await repository.getBatchJob(video.batchJobId);
    if (!batch) throw new Error(`Batch job ${video.batchJobId} was not found.`);

    const thumbnailCount = getThumbnailCount(video, batch);
    if (conceptNumber < 1 || conceptNumber > thumbnailCount) {
      throw new Error(`Concept ${conceptNumber} is outside this source's thumbnail count.`);
    }

    await repository.deleteThumbnailsForConcept(video.id, conceptNumber);
    await refreshBatchProgress(batch.id);

    const { metadata, creative } = await ensureCreative(video, batch);
    await repository.updateVideo(video.id, {
      status: "generating_thumbnails",
      statusDetail: `Regenerating thumbnail ${conceptNumber} of ${thumbnailCount}`,
      errorMessage: null
    });

    for (const format of batch.selectedFormats) {
      await createThumbnailForFormat({
        batch,
        video,
        metadata,
        creative,
        conceptNumber,
        conceptCount: thumbnailCount,
        format
      });
      createdImages += 1;
    }

    await repository.updateVideo(video.id, {
      status: "completed",
      statusDetail: "Completed",
      errorMessage: null
    });
    await maybeCompleteBatch(batch.id);
  } catch (error) {
    await repository.updateVideo(videoId, {
      status: "failed",
      statusDetail: "Failed",
      errorMessage: error instanceof Error ? error.message : "Concept regeneration failed."
    });
    await refundUnusedImagePoints(reservation, createdImages, {
      videoId,
      conceptNumber
    });
    throw error;
  }
}

export async function processThumbnailById(thumbnailId: string, reservation?: PointReservationContext) {
  const repository = getRepository();
  let createdImages = 0;
  let videoIdForStatus: string | null = null;

  try {
    const thumbnail = await repository.getThumbnail(thumbnailId);
    if (!thumbnail) throw new Error(`Thumbnail ${thumbnailId} was not found.`);
    videoIdForStatus = thumbnail.videoId;

    const video = await repository.getVideo(thumbnail.videoId);
    if (!video) throw new Error(`Video ${thumbnail.videoId} was not found.`);

    const batch = await repository.getBatchJob(video.batchJobId);
    if (!batch) throw new Error(`Batch job ${video.batchJobId} was not found.`);

    const thumbnailCount = getThumbnailCount(video, batch);
    await repository.deleteThumbnail(thumbnailId);
    await refreshBatchProgress(batch.id);

    const { metadata, creative } = await ensureCreative(video, batch);
    await createThumbnailForFormat({
      batch,
      video,
      metadata,
      creative,
      conceptNumber: thumbnail.conceptNumber,
      conceptCount: thumbnailCount,
      format: thumbnail.format
    });
    createdImages += 1;

    await repository.updateVideo(video.id, {
      status: "completed",
      statusDetail: "Completed",
      errorMessage: null
    });
    await maybeCompleteBatch(batch.id);
  } catch (error) {
    if (videoIdForStatus) {
      await repository.updateVideo(videoIdForStatus, {
        status: "failed",
        statusDetail: "Failed",
        errorMessage: error instanceof Error ? error.message : "Thumbnail regeneration failed."
      });
    }
    await refundUnusedImagePoints(reservation, createdImages, {
      thumbnailId
    });
    throw error;
  }
}

async function processVideo(video: Video, batch: BatchJob, reservation?: PointReservationContext) {
  const repository = getRepository();

  try {
    await repository.updateVideo(video.id, {
      status: "analyzing_video",
      statusDetail: "Analyzing video",
      errorMessage: null
    });

    const metadata = await getSourceMetadata(video);
    await repository.updateVideo(video.id, {
      title: metadata.title,
      description: metadata.description
    });

    await repository.updateVideo(video.id, {
      status: "generating_prompt",
      statusDetail: "Generating prompt"
    });

    const creative = await generateCreativePack({
      url: getSourceLabel(video),
      metadata,
      notes: video.notes,
      transcript: video.transcript,
      hasReferenceImage: Boolean(video.referenceImagePath)
    });

    await repository.updateVideo(video.id, {
      generatedTitle: creative.improvedTitle,
      generatedTitleOptions: creative.titleOptions,
      generatedDescription: creative.improvedDescription,
      hashtags: creative.hashtags,
      thumbnailPrompt: creative.thumbnailPrompt,
      status: "generating_thumbnails"
    });

    const thumbnailCount = getThumbnailCount(video, batch);

    for (let conceptNumber = 1; conceptNumber <= thumbnailCount; conceptNumber += 1) {
      await repository.updateVideo(video.id, {
        status: "generating_thumbnails",
        statusDetail: `Generating thumbnail ${conceptNumber} of ${thumbnailCount}`
      });

      for (const format of batch.selectedFormats) {
        await createThumbnailForFormat({
          batch,
          video,
          metadata,
          creative,
          conceptNumber,
          conceptCount: thumbnailCount,
          format
        });
      }
    }

    await repository.updateVideo(video.id, {
      status: "completed",
      statusDetail: "Completed",
      errorMessage: null
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error, "Thumbnail source processing failed.");
    console.error("Thumbnail source processing failed", {
      videoId: video.id,
      batchId: batch.id,
      error: errorMessage
    });

    await repository.updateVideo(video.id, {
      status: "failed",
      statusDetail: "Failed",
      errorMessage
    });

    await refundUnusedVideoPoints(video.id, reservation);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

async function createThumbnailForFormat(input: {
  batch: BatchJob;
  video: Video;
  metadata: YouTubeMetadata;
  creative: CreativePack;
  conceptNumber: number;
  conceptCount: number;
  format: OutputFormat;
}) {
  const repository = getRepository();
  await repository.updateVideo(input.video.id, {
    status: "generating_thumbnails",
    statusDetail: `Creating format ${input.format} for thumbnail ${input.conceptNumber} of ${input.conceptCount}`
  });

  await repository.deleteThumbnailForFormat(input.video.id, input.conceptNumber, input.format);

  const referenceImage = await getStoredFileBuffer(input.video.referenceImagePath);
  const conceptPrompt = `${input.creative.thumbnailPrompt}\n\nConcept ${input.conceptNumber}: ${getConceptLabel(input.conceptNumber)}`;
  const rawImage = await generateThumbnailImage({
    format: input.format,
    conceptNumber: input.conceptNumber,
    conceptCount: input.conceptCount,
    metadata: input.metadata,
    creative: {
      ...input.creative,
      thumbnailPrompt: conceptPrompt
    },
    referenceImage
  });
  const normalizedImage = await normalizeThumbnailBuffer(rawImage, input.format);
  const dimensions = FORMAT_DIMENSIONS[input.format];
  const storagePath = [
    "generated",
    input.batch.id,
    input.video.id,
    `concept-${input.conceptNumber}`,
    `${input.format.replace(":", "x")}.png`
  ].join("/");
  const stored = await uploadBuffer(normalizedImage, storagePath, "image/png");

  const thumbnail = await repository.createThumbnail({
    batchJobId: input.batch.id,
    videoId: input.video.id,
    conceptNumber: input.conceptNumber,
    format: input.format,
    storagePath: stored.path,
    publicUrl: stored.publicUrl,
    prompt: conceptPrompt,
    width: dimensions.width,
    height: dimensions.height
  });

  await refreshBatchProgress(input.batch.id);
  return thumbnail;
}

async function ensureCreative(video: Video, batch: BatchJob) {
  const repository = getRepository();
  const metadata = await getSourceMetadata(video);

  if (video.generatedTitle && video.generatedDescription && video.thumbnailPrompt) {
    return {
      metadata,
      creative: {
        improvedTitle: video.generatedTitle,
        titleOptions: video.generatedTitleOptions.length ? video.generatedTitleOptions : [video.generatedTitle],
        improvedDescription: video.generatedDescription,
        hashtags: video.hashtags,
        thumbnailPrompt: video.thumbnailPrompt
      }
    };
  }

  await repository.updateVideo(video.id, {
    status: "generating_prompt",
    statusDetail: "Generating prompt",
    errorMessage: null
  });

  const creative = await generateCreativePack({
    url: getSourceLabel(video),
    metadata,
    notes: video.notes,
    transcript: video.transcript,
    hasReferenceImage: Boolean(video.referenceImagePath)
  });

  await repository.updateVideo(video.id, {
    generatedTitle: creative.improvedTitle,
    generatedTitleOptions: creative.titleOptions,
    generatedDescription: creative.improvedDescription,
    hashtags: creative.hashtags,
    thumbnailPrompt: creative.thumbnailPrompt
  });

  return { metadata, creative };
}

async function getSourceMetadata(video: Video): Promise<YouTubeMetadata> {
  if (video.sourceType === "youtube_link" && video.sourceUrl) {
    return extractYouTubeMetadata(video.sourceUrl);
  }

  return {
    title: video.title || video.uploadedVideoName || "Uploaded video",
    description: video.description || "Uploaded video supplied by the creator.",
    channelTitle: "Uploaded video"
  };
}

function getSourceLabel(video: Video) {
  if (video.sourceType === "youtube_link") {
    return video.sourceUrl ?? "YouTube link";
  }

  return `Uploaded video: ${video.uploadedVideoName ?? video.title ?? video.id}`;
}

function getThumbnailCount(video: Video, batch: BatchJob) {
  return video.perVideoThumbnailCount ?? batch.globalThumbnailCount;
}

function getBatchVideoReservation(video: Video, batch: BatchJob): PointReservationContext | undefined {
  if (!batch.accountId || !batch.pointsReservationRef) return undefined;

  return {
    accountId: batch.accountId,
    reservedPoints: estimateVideoPoints({
      thumbnailCount: getThumbnailCount(video, batch),
      formatCount: batch.selectedFormats.length
    }),
    refundReference: `batch:${batch.id}:video:${video.id}:refund`,
    reservationReference: batch.pointsReservationRef
  };
}

async function refundUnusedVideoPoints(videoId: string, reservation?: PointReservationContext) {
  if (!reservation || reservation.reservedPoints <= 0) return;

  const repository = getRepository();
  const currentVideo = await repository.getVideo(videoId);
  const generatedImages = await repository.countGeneratedImagesForVideo(videoId);
  const deliveredCreativePoints =
    currentVideo?.generatedTitle && currentVideo.thumbnailPrompt ? POINT_COSTS.creativePackPerVideo : 0;
  const deliveredImagePoints = generatedImages * POINT_COSTS.thumbnailImage;
  const refundPoints = Math.max(
    0,
    reservation.reservedPoints - deliveredCreativePoints - deliveredImagePoints
  );

  if (!refundPoints) return;

  await repository.applyPointsDelta({
    accountId: reservation.accountId,
    delta: refundPoints,
    reason: "generation_refund",
    reference: reservation.refundReference,
    metadata: {
      videoId,
      reservationReference: reservation.reservationReference,
      reservedPoints: reservation.reservedPoints,
      deliveredCreativePoints,
      deliveredImagePoints
    }
  });
}

async function refundUnusedImagePoints(
  reservation: PointReservationContext | undefined,
  deliveredImages: number,
  metadata: Record<string, unknown>
) {
  if (!reservation || reservation.reservedPoints <= 0) return;

  const deliveredImagePoints = deliveredImages * POINT_COSTS.thumbnailImage;
  const refundPoints = Math.max(0, reservation.reservedPoints - deliveredImagePoints);

  if (!refundPoints) return;

  await getRepository().applyPointsDelta({
    accountId: reservation.accountId,
    delta: refundPoints,
    reason: "generation_refund",
    reference: reservation.refundReference,
    metadata: {
      ...metadata,
      reservationReference: reservation.reservationReference,
      reservedPoints: reservation.reservedPoints,
      deliveredImagePoints
    }
  });
}

function getConceptLabel(conceptNumber: number) {
  const labels = [
    "big promise",
    "curiosity gap",
    "authority look",
    "before and after",
    "problem and solution",
    "high energy",
    "minimal premium",
    "proof and data",
    "story drama",
    "contrarian angle"
  ];

  return labels[(conceptNumber - 1) % labels.length];
}

async function refreshBatchProgress(batchId: string) {
  const repository = getRepository();
  await repository.updateBatch(batchId, {
    processedVideos: await repository.countProcessedVideos(batchId),
    totalImagesCompleted: await repository.countGeneratedImages(batchId)
  });
}

async function maybeCompleteBatch(batchId: string) {
  const repository = getRepository();
  const batch = await repository.getBatch(batchId);
  if (!batch) return;

  const allDone = batch.videos.every((video) => video.status === "completed" || video.status === "failed");

  await repository.updateBatch(batchId, {
    status: allDone ? "completed" : "running",
    processedVideos: await repository.countProcessedVideos(batchId),
    totalImagesCompleted: await repository.countGeneratedImages(batchId)
  });
}
