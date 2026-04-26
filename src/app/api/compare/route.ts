import { NextResponse } from "next/server";

import { buildVideoPath } from "@/lib/uploads";
import { VIDEO_BUCKET } from "@/lib/supabase/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

type VideoKind = "reference" | "submission";

function getTitle(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function assertVideoFile(file: FormDataEntryValue | null, label: string) {
  if (!(file instanceof File)) {
    throw new Error(`${label} is required.`);
  }

  if (!file.type.startsWith("video/")) {
    throw new Error(`${label} must be a video file.`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${label} must be smaller than 100 MB.`);
  }

  return file;
}

async function ensureVideoBucket() {
  const supabase = createServerSupabaseClient();
  const { data: bucket, error } = await supabase.storage.getBucket(VIDEO_BUCKET);

  if (!error && bucket) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(VIDEO_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }
}

async function uploadVideo(
  kind: VideoKind,
  file: File,
  title: string,
  supabase = createServerSupabaseClient(),
) {
  const path = buildVideoPath(kind, file.name);
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, arrayBuffer, {
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const referenceFile = assertVideoFile(formData.get("referenceVideo"), "Reference video");
    const submissionFile = assertVideoFile(formData.get("submissionVideo"), "Submission video");
    const referenceTitle = getTitle(formData.get("referenceTitle"), "Reference choreography");
    const submissionTitle = getTitle(formData.get("submissionTitle"), "Dancer submission");

    await ensureVideoBucket();
    const supabase = createServerSupabaseClient();

    const reference = await uploadVideo("reference", referenceFile, referenceTitle, supabase);
    const submission = await uploadVideo(
      "submission",
      submissionFile,
      submissionTitle,
      supabase,
    );

    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        reference_video_id: reference.id,
        submission_video_id: submission.id,
        status: "pending",
      })
      .select("id")
      .single();

    if (analysisError || !analysis) {
      throw analysisError ?? new Error("Failed to create analysis.");
    }

    return NextResponse.json({
      analysisId: analysis.id,
      reviewPath: `/review/${analysis.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
