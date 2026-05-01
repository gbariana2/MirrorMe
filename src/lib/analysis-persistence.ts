import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProcessPayload } from "@/lib/analysis-payload";

type PersistResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; message: string };

export async function persistAnalysisResult(
  supabase: SupabaseClient,
  analysisId: string,
  payload: ProcessPayload,
): Promise<PersistResult> {
  const { data: startedRows, error: updateProcessingError } = await supabase
    .from("analyses")
    .update({
      status: "processing",
    })
    .eq("id", analysisId)
    .in("status", ["pending", "completed", "failed"])
    .select("id");

  if (updateProcessingError) {
    throw updateProcessingError;
  }

  if (!startedRows || startedRows.length === 0) {
    const { data: existing, error: lookupError } = await supabase
      .from("analyses")
      .select("id, status")
      .eq("id", analysisId)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (!existing) {
      return { ok: false, status: 404, message: "Analysis not found." };
    }

    return { ok: false, status: 409, message: "Analysis is already being processed." };
  }

  try {
    const { error: frameDeleteError } = await supabase
      .from("analysis_frames")
      .delete()
      .eq("analysis_id", analysisId);

    if (frameDeleteError) {
      throw frameDeleteError;
    }

    const { error: issueDeleteError } = await supabase
      .from("analysis_issues")
      .delete()
      .eq("analysis_id", analysisId);

    if (issueDeleteError) {
      throw issueDeleteError;
    }

    const combinedTimestamps = Array.from(
      new Set([
        ...payload.referenceFrames.map((frame) => frame.timestampMs),
        ...payload.submissionFrames.map((frame) => frame.timestampMs),
      ]),
    ).sort((left, right) => left - right);

    const frameRows = combinedTimestamps.map((timestampMs) => ({
      analysis_id: analysisId,
      timestamp_ms: timestampMs,
      reference_landmarks:
        payload.referenceFrames.find((frame) => frame.timestampMs === timestampMs)?.landmarks ?? [],
      submission_landmarks:
        payload.submissionFrames.find((frame) => frame.timestampMs === timestampMs)?.landmarks ?? [],
    }));

    if (frameRows.length > 0) {
      const { error: frameInsertError } = await supabase.from("analysis_frames").insert(frameRows);

      if (frameInsertError) {
        throw frameInsertError;
      }
    }

    if (payload.issues.length > 0) {
      const { error: issueInsertError } = await supabase.from("analysis_issues").insert(
        payload.issues.map((issue) => ({
          analysis_id: analysisId,
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
      .eq("id", analysisId);

    if (completeError) {
      throw completeError;
    }
  } catch (error) {
    await supabase
      .from("analyses")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysisId);

    throw error;
  }

  return { ok: true };
}
