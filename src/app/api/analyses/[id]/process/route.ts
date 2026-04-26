import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PoseFrame, PoseIssue } from "@/lib/pose";

type ProcessPayload = {
  referenceFrames: PoseFrame[];
  submissionFrames: PoseFrame[];
  issues: PoseIssue[];
  overallScore: number;
  summary: string;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as ProcessPayload;
    const supabase = createServerSupabaseClient();

    const { error: updateProcessingError } = await supabase
      .from("analyses")
      .update({
        status: "processing",
      })
      .eq("id", id);

    if (updateProcessingError) {
      throw updateProcessingError;
    }

    await supabase.from("analysis_frames").delete().eq("analysis_id", id);
    await supabase.from("analysis_issues").delete().eq("analysis_id", id);

    const combinedTimestamps = Array.from(
      new Set([
        ...payload.referenceFrames.map((frame) => frame.timestampMs),
        ...payload.submissionFrames.map((frame) => frame.timestampMs),
      ]),
    ).sort((left, right) => left - right);

    const frameRows = combinedTimestamps.map((timestampMs) => ({
      analysis_id: id,
      timestamp_ms: timestampMs,
      reference_landmarks:
        payload.referenceFrames.find((frame) => frame.timestampMs === timestampMs)?.landmarks ?? [],
      submission_landmarks:
        payload.submissionFrames.find((frame) => frame.timestampMs === timestampMs)?.landmarks ?? [],
    }));

    if (frameRows.length > 0) {
      const { error: frameInsertError } = await supabase
        .from("analysis_frames")
        .insert(frameRows);

      if (frameInsertError) {
        throw frameInsertError;
      }
    }

    if (payload.issues.length > 0) {
      const { error: issueInsertError } = await supabase.from("analysis_issues").insert(
        payload.issues.map((issue) => ({
          analysis_id: id,
          timestamp_ms: issue.timestampMs,
          joint_name: issue.jointName,
          severity: issue.severity,
          expected_angle: issue.expectedAngle,
          actual_angle: issue.actualAngle,
          delta: issue.delta,
          notes: issue.notes,
        })),
      );

      if (issueInsertError) {
        throw issueInsertError;
      }
    }

    const { error: completeError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        overall_score: payload.overallScore,
        summary: payload.summary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (completeError) {
      throw completeError;
    }

    return NextResponse.json({
      overallScore: payload.overallScore,
      summary: payload.summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to persist pose analysis.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
