import { inngest } from "@/lib/inngest/client";
import {
  processBatch,
  processConceptByVideoId,
  processThumbnailById,
  processVideoById
} from "@/lib/jobs/processor";

export const processBatchFunction = inngest.createFunction(
  { id: "process-thumbnailflow-batch", retries: 1 },
  { event: "thumbnailflow/batch.created" },
  async ({ event, step }) => {
    await step.run("process videos sequentially", async () => {
      await processBatch(event.data.batchId);
    });
  }
);

export const regenerateVideoFunction = inngest.createFunction(
  { id: "regenerate-thumbnailflow-video", retries: 1 },
  { event: "thumbnailflow/video.regenerate" },
  async ({ event, step }) => {
    await step.run("regenerate all video thumbnails", async () => {
      await processVideoById(event.data.videoId, event.data.reservation);
    });
  }
);

export const regenerateConceptFunction = inngest.createFunction(
  { id: "regenerate-thumbnailflow-concept", retries: 1 },
  { event: "thumbnailflow/concept.regenerate" },
  async ({ event, step }) => {
    await step.run("regenerate thumbnail concept", async () => {
      await processConceptByVideoId(event.data.videoId, event.data.conceptNumber, event.data.reservation);
    });
  }
);

export const regenerateThumbnailFunction = inngest.createFunction(
  { id: "regenerate-thumbnailflow-image", retries: 1 },
  { event: "thumbnailflow/thumbnail.regenerate" },
  async ({ event, step }) => {
    await step.run("regenerate one thumbnail image", async () => {
      await processThumbnailById(event.data.thumbnailId, event.data.reservation);
    });
  }
);

export const inngestFunctions = [
  processBatchFunction,
  regenerateVideoFunction,
  regenerateConceptFunction,
  regenerateThumbnailFunction
];
