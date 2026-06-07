import { NextResponse } from "next/server";
import { hasOpenAIConfig, hasSupabaseConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    openaiConfigured: hasOpenAIConfig(),
    supabaseConfigured: hasSupabaseConfig()
  });
}
