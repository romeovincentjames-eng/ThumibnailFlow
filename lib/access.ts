import { getOrCreateBillingAccount } from "@/lib/billingSession";
import { getRepository } from "@/lib/repository";

export async function getAuthorizedBatch(batchId: string) {
  const account = await getOrCreateBillingAccount();
  const batch = await getRepository().getBatch(batchId);

  if (!batch) {
    return { account, batch: null, authorized: false };
  }

  return {
    account,
    batch,
    authorized: !batch.accountId || batch.accountId === account.id
  };
}

export async function getAuthorizedVideo(videoId: string) {
  const account = await getOrCreateBillingAccount();
  const repository = getRepository();
  const video = await repository.getVideo(videoId);

  if (!video) {
    return { account, video: null, batch: null, authorized: false };
  }

  const batch = await repository.getBatchJob(video.batchJobId);

  return {
    account,
    video,
    batch,
    authorized: Boolean(batch && (!batch.accountId || batch.accountId === account.id))
  };
}

export async function getAuthorizedThumbnail(thumbnailId: string) {
  const account = await getOrCreateBillingAccount();
  const repository = getRepository();
  const thumbnail = await repository.getThumbnail(thumbnailId);

  if (!thumbnail) {
    return { account, thumbnail: null, batch: null, authorized: false };
  }

  const batch = await repository.getBatchJob(thumbnail.batchJobId);

  return {
    account,
    thumbnail,
    batch,
    authorized: Boolean(batch && (!batch.accountId || batch.accountId === account.id))
  };
}
