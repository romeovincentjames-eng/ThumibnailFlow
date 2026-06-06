import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedVideo } from "@/lib/access";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedVideo(params.id);

  if (!access.video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  if (!access.authorized) {
    return NextResponse.json({ error: "You do not have access to this video." }, { status: 403 });
  }

  const repository = getRepository();
  const video = access.video;
  await repository.deleteVideo(params.id);

  if (video) {
    await repository.updateBatch(video.batchJobId, {
      processedVideos: await repository.countProcessedVideos(video.batchJobId),
      totalImagesCompleted: await repository.countGeneratedImages(video.batchJobId)
    });
  }

  return NextResponse.json({ ok: true });
}
