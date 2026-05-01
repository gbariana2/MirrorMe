import { NextResponse } from "next/server";

import { parseProcessPayload } from "@/lib/analysis-payload";
import { persistAnalysisResult } from "@/lib/analysis-persistence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isAuthorized(request: Request) {
  const expectedSecret = process.env.ANALYSIS_JOB_SECRET;

  if (!expectedSecret) {
    return true;
  }

  const providedSecret = request.headers.get("x-analysis-job-secret");
  return providedSecret === expectedSecret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const { data: queuedJob, error: queuedJobError } = await supabase
      .from("analysis_jobs")
      .select("id, analysis_id, payload")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (queuedJobError) {
      throw queuedJobError;
    }

    if (!queuedJob) {
      return NextResponse.json({ processed: false, reason: "No queued jobs." });
    }

    const { data: claimedRows, error: claimError } = await supabase
      .from("analysis_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", queuedJob.id)
      .eq("status", "queued")
      .select("id");

    if (claimError) {
      throw claimError;
    }

    if (!claimedRows || claimedRows.length === 0) {
      return NextResponse.json({
        processed: false,
        reason: "Job was already claimed.",
      });
    }

    const payload = parseProcessPayload(queuedJob.payload);
    const result = await persistAnalysisResult(supabase, queuedJob.analysis_id, payload);

    if (!result.ok) {
      await supabase
        .from("analysis_jobs")
        .update({
          status: "failed",
          error_message: result.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", queuedJob.id);

      return NextResponse.json(
        { processed: false, jobId: queuedJob.id, error: result.message },
        { status: result.status },
      );
    }

    const { error: completeError } = await supabase
      .from("analysis_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", queuedJob.id);

    if (completeError) {
      throw completeError;
    }

    return NextResponse.json({ processed: true, jobId: queuedJob.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process queued job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
