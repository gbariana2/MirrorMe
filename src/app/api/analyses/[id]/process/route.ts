import { NextResponse } from "next/server";

import { parseProcessPayload } from "@/lib/analysis-payload";
import { persistAnalysisResult } from "@/lib/analysis-persistence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const supabase = createServerSupabaseClient();

  try {
    const { id } = await context.params;
    const payload = parseProcessPayload(await request.json());
    const result = await persistAnalysisResult(supabase, id, payload);

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    return NextResponse.json({
      overallScore: payload.overallScore,
      summary: payload.summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to persist pose analysis.";

    const status =
      message.includes("Invalid") || message.includes("must be") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
