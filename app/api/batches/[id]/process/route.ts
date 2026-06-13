import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedBatch } from "@/lib/access";
import { processBatch } from "@/lib/jobs/processor";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { batch, authorized } = await getAuthorizedBatch(params.id);

    if (!batch) {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    if (!authorized) {
      return NextResponse.json({ error: "You do not have access to this batch." }, { status: 403 });
    }

    await processBatch(params.id);
    const updatedBatch = await getRepository().getBatch(params.id);

    return NextResponse.json({ ok: true, batch: updatedBatch });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message)
          : "Could not process this batch.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
