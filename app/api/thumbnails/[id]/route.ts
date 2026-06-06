import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedThumbnail } from "@/lib/access";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedThumbnail(params.id);

  if (!access.thumbnail) {
    return NextResponse.json({ error: "Thumbnail not found." }, { status: 404 });
  }

  if (!access.authorized) {
    return NextResponse.json({ error: "You do not have access to this thumbnail." }, { status: 403 });
  }

  const repository = getRepository();
  const thumbnail = access.thumbnail;

  await repository.deleteThumbnail(params.id);
  await repository.updateBatch(thumbnail.batchJobId, {
    totalImagesCompleted: await repository.countGeneratedImages(thumbnail.batchJobId)
  });

  return NextResponse.json({ ok: true });
}
