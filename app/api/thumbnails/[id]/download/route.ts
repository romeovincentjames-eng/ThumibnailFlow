import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedThumbnail } from "@/lib/access";
import { getStoredFileBuffer } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedThumbnail(params.id);
  const thumbnail = access.thumbnail;

  if (!thumbnail) {
    return NextResponse.json({ error: "Thumbnail not found." }, { status: 404 });
  }

  if (!access.authorized) {
    return NextResponse.json({ error: "You do not have access to this thumbnail." }, { status: 403 });
  }

  const stored = await getStoredFileBuffer(thumbnail.storagePath);

  if (!stored?.buffer) {
    return NextResponse.json({ error: "The thumbnail file could not be loaded from storage." }, { status: 404 });
  }

  const extension = getExtension(stored.contentType);
  const filename = `thumbnailflow-concept-${thumbnail.conceptNumber}-${thumbnail.format.replace(":", "x")}.${extension}`;

  return new NextResponse(new Uint8Array(stored.buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(stored.buffer.length),
      "Content-Type": stored.contentType || "image/png",
      "Cache-Control": "private, no-store"
    }
  });
}

function getExtension(contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}
