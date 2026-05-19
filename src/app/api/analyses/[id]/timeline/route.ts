import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    await getRequiredUserId(searchParams.get("userId") ?? undefined);
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("analysis_frames")
      .select("timestamp_ms, reference_landmarks, submission_landmarks")
      .eq("analysis_id", id)
      .order("timestamp_ms", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      frames: (data ?? []).map((row) => ({
        timestampMs: row.timestamp_ms,
        referenceLandmarks: row.reference_landmarks,
        submissionLandmarks: row.submission_landmarks,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analysis timeline.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
