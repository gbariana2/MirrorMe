import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { assertNonEmptyString, HttpError } from "@/lib/team";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      userId?: string;
      referenceVideoId?: string;
      submissionVideoId?: string;
    };
    await getRequiredUserId(payload.userId);
    const referenceVideoId = assertNonEmptyString(
      payload.referenceVideoId,
      "referenceVideoId",
      120,
    );
    const submissionVideoId = assertNonEmptyString(
      payload.submissionVideoId,
      "submissionVideoId",
      120,
    );
    const supabase = createServerSupabaseClient();

    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        reference_video_id: referenceVideoId,
        submission_video_id: submissionVideoId,
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
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
