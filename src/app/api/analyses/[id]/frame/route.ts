import { NextResponse } from "next/server";

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
    const timestampMsRaw = Number(searchParams.get("timestampMs") ?? "0");
    const timestampMs = Number.isFinite(timestampMsRaw) ? Math.max(0, Math.floor(timestampMsRaw)) : 0;

    const supabase = createServerSupabaseClient();

    const { data: exactFrame, error: exactError } = await supabase
      .from("analysis_frames")
      .select("timestamp_ms, reference_landmarks, submission_landmarks")
      .eq("analysis_id", id)
      .eq("timestamp_ms", timestampMs)
      .maybeSingle();

    if (exactError) {
      throw exactError;
    }

    if (exactFrame) {
      return NextResponse.json({
        timestampMs: exactFrame.timestamp_ms,
        referenceLandmarks: exactFrame.reference_landmarks,
        submissionLandmarks: exactFrame.submission_landmarks,
      });
    }

    const { data: nearbyFrames, error: nearbyError } = await supabase
      .from("analysis_frames")
      .select("timestamp_ms, reference_landmarks, submission_landmarks")
      .eq("analysis_id", id)
      .gte("timestamp_ms", Math.max(0, timestampMs - 1500))
      .lte("timestamp_ms", timestampMs + 1500)
      .order("timestamp_ms", { ascending: true })
      .limit(10);

    if (nearbyError) {
      throw nearbyError;
    }

    if (!nearbyFrames || nearbyFrames.length === 0) {
      const [{ data: beforeRows, error: beforeError }, { data: afterRows, error: afterError }] = await Promise.all([
        supabase
          .from("analysis_frames")
          .select("timestamp_ms, reference_landmarks, submission_landmarks")
          .eq("analysis_id", id)
          .lte("timestamp_ms", timestampMs)
          .order("timestamp_ms", { ascending: false })
          .limit(1),
        supabase
          .from("analysis_frames")
          .select("timestamp_ms, reference_landmarks, submission_landmarks")
          .eq("analysis_id", id)
          .gte("timestamp_ms", timestampMs)
          .order("timestamp_ms", { ascending: true })
          .limit(1),
      ]);

      if (beforeError || afterError) {
        throw beforeError ?? afterError;
      }

      const candidates = [...(beforeRows ?? []), ...(afterRows ?? [])];
      if (candidates.length === 0) {
        return NextResponse.json({ error: "No pose frame found for this timestamp." }, { status: 404 });
      }
      const nearestFallback = candidates.reduce((best, current) => {
        const bestDistance = Math.abs(best.timestamp_ms - timestampMs);
        const currentDistance = Math.abs(current.timestamp_ms - timestampMs);
        return currentDistance < bestDistance ? current : best;
      });

      return NextResponse.json({
        timestampMs: nearestFallback.timestamp_ms,
        referenceLandmarks: nearestFallback.reference_landmarks,
        submissionLandmarks: nearestFallback.submission_landmarks,
      });
    }

    const nearest = nearbyFrames.reduce((best, current) => {
      const bestDistance = Math.abs(best.timestamp_ms - timestampMs);
      const currentDistance = Math.abs(current.timestamp_ms - timestampMs);
      return currentDistance < bestDistance ? current : best;
    });

    return NextResponse.json({
      timestampMs: nearest.timestamp_ms,
      referenceLandmarks: nearest.reference_landmarks,
      submissionLandmarks: nearest.submission_landmarks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analysis frame.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
