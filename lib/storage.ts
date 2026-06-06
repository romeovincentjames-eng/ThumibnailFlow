import { getStorageBucket } from "@/lib/env";
import { getLocalStore } from "@/lib/localStore";
import { getSupabaseAdmin } from "@/lib/supabase";

type StoredFile = {
  path: string;
  publicUrl: string;
};

function asDataUrl(buffer: Buffer, contentType: string) {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function uploadBrowserFile(file: File, prefix: string): Promise<StoredFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const path = `${prefix}/${crypto.randomUUID()}-${safeFileName(file.name || "upload")}`;
  return uploadBuffer(buffer, path, contentType);
}

export async function uploadBuffer(buffer: Buffer, path: string, contentType: string): Promise<StoredFile> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const bucket = getStorageBucket();
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType,
      upsert: true
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  const dataUrl = asDataUrl(buffer, contentType);
  getLocalStore().files.set(path, { buffer, contentType, dataUrl });
  return { path, publicUrl: dataUrl };
}

export async function getStoredFileBuffer(path: string | null) {
  if (!path) return null;

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const bucket = getStorageBucket();
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return null;
    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || "image/png"
    };
  }

  const stored = getLocalStore().files.get(path);
  if (!stored) return null;
  return {
    buffer: stored.buffer,
    contentType: stored.contentType
  };
}
