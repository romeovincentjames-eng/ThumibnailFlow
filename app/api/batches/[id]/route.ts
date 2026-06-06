import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedBatch } from "@/lib/access";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { batch, authorized } = await getAuthorizedBatch(params.id);

  if (!batch) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  if (!authorized) {
    return NextResponse.json({ error: "You do not have access to this batch." }, { status: 403 });
  }

  return NextResponse.json({ batch });
}
