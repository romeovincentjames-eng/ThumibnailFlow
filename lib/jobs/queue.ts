import { shouldUseInngest } from "@/lib/env";
import { inngest } from "@/lib/inngest/client";
import {
  processBatch,
  processConceptByVideoId,
  processThumbnailById,
  processVideoById,
  type PointReservationContext
} from "@/lib/jobs/processor";
import { getLocalStore } from "@/lib/localStore";

export async function enqueueBatch(batchId: string) {
  if (shouldUseInngest()) {
    try {
      await inngest.send({
        name: "thumbnailflow/batch.created",
        data: { batchId }
      });
      return;
    } catch (error) {
      console.error("Inngest enqueue failed; falling back to local processor.", error);
    }
  }

  startLocalTask(`batch:${batchId}`, () => processBatch(batchId));
}

export async function enqueueVideoRegeneration(videoId: string, reservation?: PointReservationContext) {
  if (shouldUseInngest()) {
    try {
      await inngest.send({
        name: "thumbnailflow/video.regenerate",
        data: { videoId, reservation }
      });
      return;
    } catch (error) {
      console.error("Inngest enqueue failed; falling back to local processor.", error);
    }
  }

  startLocalTask(`video:${videoId}`, () => processVideoById(videoId, reservation));
}

export async function enqueueConceptRegeneration(
  videoId: string,
  conceptNumber: number,
  reservation?: PointReservationContext
) {
  if (shouldUseInngest()) {
    try {
      await inngest.send({
        name: "thumbnailflow/concept.regenerate",
        data: { videoId, conceptNumber, reservation }
      });
      return;
    } catch (error) {
      console.error("Inngest enqueue failed; falling back to local processor.", error);
    }
  }

  startLocalTask(`concept:${videoId}:${conceptNumber}`, () =>
    processConceptByVideoId(videoId, conceptNumber, reservation)
  );
}

export async function enqueueThumbnailRegeneration(thumbnailId: string, reservation?: PointReservationContext) {
  if (shouldUseInngest()) {
    try {
      await inngest.send({
        name: "thumbnailflow/thumbnail.regenerate",
        data: { thumbnailId, reservation }
      });
      return;
    } catch (error) {
      console.error("Inngest enqueue failed; falling back to local processor.", error);
    }
  }

  startLocalTask(`thumbnail:${thumbnailId}`, () => processThumbnailById(thumbnailId, reservation));
}

function startLocalTask(taskKey: string, task: () => Promise<void>) {
  const store = getLocalStore();
  if (store.runningTasks.has(taskKey)) return;

  store.runningTasks.add(taskKey);
  setTimeout(async () => {
    try {
      await task();
    } catch (error) {
      console.error("Local background task failed", error);
    } finally {
      store.runningTasks.delete(taskKey);
    }
  }, 20);
}
