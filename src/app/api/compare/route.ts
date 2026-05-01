import { NextResponse } from "next/server";

import {
  assertVideoFile,
  ensureVideoBucket,
  getTitle,
  uploadVideo,
  UploadHttpError,
} from "@/lib/video-upload";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const referenceFile = assertVideoFile(formData.get("referenceVideo"), "Reference video");
    const submissionFile = assertVideoFile(formData.get("submissionVideo"), "Submission video");
    const referenceTitle = getTitle(formData.get("referenceTitle"), "Reference choreography");
    const submissionTitle = getTitle(formData.get("submissionTitle"), "Dancer submission");

    await ensureVideoBucket();
    const supabase = createServerSupabaseClient();

    const reference = await uploadVideo("reference", referenceFile, referenceTitle);
    const submission = await uploadVideo("submission", submissionFile, submissionTitle);

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
    const status = error instanceof UploadHttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
