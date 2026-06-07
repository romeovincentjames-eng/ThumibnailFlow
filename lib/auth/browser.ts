"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const configError = getSupabaseBrowserConfigError();
  if (configError) {
    throw new Error(configError);
  }

  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}

export function getSupabaseBrowserConfigError() {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!isUsableValue(supabaseUrl)) {
    return "Supabase login is not connected yet. Add NEXT_PUBLIC_SUPABASE_URL to your environment variables.";
  }

  if (!supabaseUrl.startsWith("https://")) {
    return "Supabase login URL must start with https://.";
  }

  try {
    new URL(supabaseUrl);
  } catch {
    return "Supabase login URL is not valid. Check NEXT_PUBLIC_SUPABASE_URL.";
  }

  if (!isUsableValue(anonKey)) {
    return "Supabase login is not connected yet. Add NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables.";
  }

  return null;
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
}

function isUsableValue(value: string) {
  return Boolean(value && !/(^your[-_])|placeholder|changeme|example|undefined|null/i.test(value));
}
