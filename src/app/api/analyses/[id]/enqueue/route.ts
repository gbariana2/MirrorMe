import { NextResponse } from "next/server";

import { parseProcessPayload } from "@/lib/analysis-payload";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = parseProcessPayload(await request.json());
    const supabase = createServerSupabaseClient();

    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (analysisError) {
      throw analysisError;
    }

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }

    const { data: existingJob, error: existingJobError } = await supabase
      .from("analysis_jobs")
      .select("id, status")
      .eq("analysis_id", id)
      .in("status", ["queued", "processing"])
      .maybeSingle();

    if (existingJobError) {
      throw existingJobError;
    }

    if (existingJob) {
      return NextResponse.json(
        { error: "A job is already queued or processing for this analysis." },
        { status: 409 },
      );
    }

    const { data: job, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({
        analysis_id: id,
        status: "queued",
        payload,
      })
      .select("id, status, created_at")
      .single();

    if (insertError || !job) {
      throw insertError ?? new Error("Failed to enqueue analysis job.");
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      createdAt: job.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue analysis.";
    const status = message.includes("Invalid") || message.includes("must be") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
