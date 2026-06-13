export function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function isUsableEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    return false;
  }

  return !/(^your[-_])|placeholder|changeme|example|undefined|null/i.test(value);
}

export function hasSupabaseAuthConfig() {
  return Boolean(
    isUsableEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      isUsableEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
      getEnv("NEXT_PUBLIC_SUPABASE_URL").startsWith("https://")
  );
}

export function hasSupabaseConfig() {
  return Boolean(hasSupabaseAuthConfig() && isUsableEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

export function hasOpenAIConfig() {
  return isUsableEnv("OPENAI_API_KEY");
}

export function hasYouTubeOAuthConfig() {
  return Boolean(isUsableEnv("GOOGLE_CLIENT_ID") && isUsableEnv("GOOGLE_CLIENT_SECRET"));
}

export function hasStripeConfig() {
  return isUsableEnv("STRIPE_SECRET_KEY");
}

export function getYouTubeRedirectUri() {
  const configuredRedirect = getEnv("YOUTUBE_REDIRECT_URI");
  if (configuredRedirect) return configuredRedirect;

  const appUrl = getEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  if (appUrl) return `${appUrl}/api/youtube/oauth/callback`;

  return "http://localhost:3000/api/youtube/oauth/callback";
}

export function shouldUseInngest() {
  return Boolean(isUsableEnv("INNGEST_EVENT_KEY") && isUsableEnv("INNGEST_SIGNING_KEY"));
}

export function getStorageBucket() {
  return getEnv("SUPABASE_STORAGE_BUCKET") || "thumbnails";
}
