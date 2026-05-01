import { NextResponse } from "next/server";

import { parseProcessPayload } from "@/lib/analysis-payload";
import { persistAnalysisResult } from "@/lib/analysis-persistence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isAuthorized(request: Request) {
  const vercelCronHeader = request.headers.get("x-vercel-cron");

  if (vercelCronHeader === "1") {
    return true;
  }

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
  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get("limit") ?? "1");
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(20, Math.max(1, Math.floor(parsedLimit)))
    : 1;

  try {
    const { data: queuedJobs, error: queuedJobError } = await supabase
      .from("analysis_jobs")
      .select("id, analysis_id, payload")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (queuedJobError) {
      throw queuedJobError;
    }

    if (!queuedJobs || queuedJobs.length === 0) {
      return NextResponse.json({ processed: false, reason: "No queued jobs.", count: 0 });
    }

    let processedCount = 0;
    const failedJobs: Array<{ jobId: string; error: string }> = [];

    for (const queuedJob of queuedJobs) {
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
        continue;
      }

      try {
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

          failedJobs.push({ jobId: queuedJob.id, error: result.message });
          continue;
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

        processedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to process job.";

        await supabase
          .from("analysis_jobs")
          .update({
            status: "failed",
            error_message: message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", queuedJob.id);

        failedJobs.push({ jobId: queuedJob.id, error: message });
      }
    }

    return NextResponse.json({
      processed: processedCount > 0,
      count: processedCount,
      failed: failedJobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process queued job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
