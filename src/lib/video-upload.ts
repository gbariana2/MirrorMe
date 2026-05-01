import { buildVideoPath } from "@/lib/uploads";
import { VIDEO_BUCKET } from "@/lib/supabase/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

export type VideoKind = "reference" | "submission";

export class UploadHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getTitle(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function assertVideoFile(file: FormDataEntryValue | null, label: string) {
  if (!(file instanceof File)) {
    throw new UploadHttpError(`${label} is required.`, 400);
  }

  if (!file.type.startsWith("video/")) {
    throw new UploadHttpError(`${label} must be a video file.`, 400);
  }

  if (!ALLOWED_VIDEO_MIME_TYPES.has(file.type)) {
    throw new UploadHttpError(
      `${label} must be one of: ${Array.from(ALLOWED_VIDEO_MIME_TYPES).join(", ")}.`,
      400,
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new UploadHttpError(`${label} must be smaller than 100 MB.`, 400);
  }

  return file;
}

export async function ensureVideoBucket() {
  const supabase = createServerSupabaseClient();
  const { data: bucket, error } = await supabase.storage.getBucket(VIDEO_BUCKET);

  if (!error && bucket) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(VIDEO_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
    allowedMimeTypes: Array.from(ALLOWED_VIDEO_MIME_TYPES),
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }
}

export async function uploadVideo(kind: VideoKind, file: File, title: string) {
  const supabase = createServerSupabaseClient();
  const path = buildVideoPath(kind, file.name);
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(path, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);

  const { data: videoRecord, error: insertError } = await supabase
    .from("videos")
    .insert({
      kind,
      title,
      file_path: path,
      file_url: publicUrlData.publicUrl,
      mime_type: file.type,
    })
    .select("id, title, file_url")
    .single();

  if (insertError || !videoRecord) {
    throw insertError ?? new Error(`Failed to create ${kind} video record.`);
  }

  return videoRecord;
}
