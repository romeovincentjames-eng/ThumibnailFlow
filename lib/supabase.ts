import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, hasSupabaseConfig } from "@/lib/env";

let supabase: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!supabase) {
    supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabase;
}
