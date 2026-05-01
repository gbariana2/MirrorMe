import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, HttpError } from "@/lib/team";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SubmitPayload = {
  dancerUserId?: string;
  submissionVideoId: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<SubmitPayload>;
    const dancerUserId = await getRequiredUserId(payload.dancerUserId);
    const submissionVideoId = assertNonEmptyString(payload.submissionVideoId, "submissionVideoId");
    const supabase = createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, team_id, reference_video_id, due_at")
      .eq("id", id)
      .maybeSingle();

    if (assignmentError) {
      throw assignmentError;
    }
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    if (Date.now() > new Date(assignment.due_at).getTime()) {
      return NextResponse.json({ error: "Assignment deadline has passed." }, { status: 409 });
    }

    const { data: member, error: memberError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("team_id", assignment.team_id)
      .eq("user_id", dancerUserId)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }
    if (!member) {
      return NextResponse.json({ error: "Dancer is not a team member." }, { status: 403 });
    }

    const { data: target, error: targetError } = await supabase
      .from("assignment_targets")
      .select("id")
      .eq("assignment_id", assignment.id)
      .eq("dancer_user_id", dancerUserId)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }
    if (!target) {
      return NextResponse.json({ error: "You are not assigned to this assignment." }, { status: 403 });
    }

    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        reference_video_id: assignment.reference_video_id,
        submission_video_id: submissionVideoId,
        status: "pending",
      })
      .select("id")
      .single();

    if (analysisError || !analysis) {
      throw analysisError ?? new Error("Failed to create analysis.");
    }

    const { error: submissionError } = await supabase.from("assignment_submissions").upsert({
      assignment_id: assignment.id,
      dancer_user_id: dancerUserId,
      submission_video_id: submissionVideoId,
      analysis_id: analysis.id,
      submitted_at: new Date().toISOString(),
    });

    if (submissionError) {
      throw submissionError;
    }

    return NextResponse.json({
      assignmentId: assignment.id,
      analysisId: analysis.id,
      reviewPath: `/review/${analysis.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit assignment.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
