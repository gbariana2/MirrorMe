import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/team";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const userId = await getRequiredUserId();
    const supabase = createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, team_id, title, due_at, reference_video_id")
      .eq("id", id)
      .maybeSingle();

    if (assignmentError) {
      throw assignmentError;
    }
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const { data: captainMembership, error: captainMembershipError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("team_id", assignment.team_id)
      .eq("user_id", userId)
      .eq("role", "captain")
      .maybeSingle();

    if (captainMembershipError) {
      throw captainMembershipError;
    }
    if (!captainMembership) {
      return NextResponse.json({ error: "Captain membership required." }, { status: 403 });
    }

    const { data: targets, error: targetsError } = await supabase
      .from("assignment_targets")
      .select("dancer_user_id")
      .eq("assignment_id", assignment.id);

    if (targetsError) {
      throw targetsError;
    }

    const dancerUserIds = (targets ?? []).map((item) => item.dancer_user_id);

    if (dancerUserIds.length === 0) {
      return NextResponse.json({ assignment, assignees: [] });
    }

    const { data: submissions, error: submissionsError } = await supabase
      .from("assignment_submissions")
      .select("dancer_user_id, analysis_id, submitted_at")
      .eq("assignment_id", assignment.id)
      .in("dancer_user_id", dancerUserIds);

    if (submissionsError) {
      throw submissionsError;
    }

    const submissionByDancer = new Map((submissions ?? []).map((row) => [row.dancer_user_id, row]));
    const analysisIds = (submissions ?? []).map((row) => row.analysis_id);
    let analysisById = new Map<string, { id: string; status: string }>();

    if (analysisIds.length > 0) {
      const { data: analyses, error: analysesError } = await supabase
        .from("analyses")
        .select("id, status")
        .in("id", analysisIds);

      if (analysesError) {
        throw analysesError;
      }

      analysisById = new Map((analyses ?? []).map((row) => [row.id, row]));
    }

    const assignees = dancerUserIds.map((dancerUserId) => {
      const submission = submissionByDancer.get(dancerUserId);
      const analysis = submission ? analysisById.get(submission.analysis_id) : null;

      let status: "not_submitted" | "submitted" | "processing" | "analyzed" | "failed" =
        "not_submitted";
      if (submission && analysis?.status === "completed") {
        status = "analyzed";
      } else if (submission && analysis?.status === "processing") {
        status = "processing";
      } else if (submission && analysis?.status === "failed") {
        status = "failed";
      } else if (submission) {
        status = "submitted";
      }

      return {
        dancerUserId,
        status,
        submittedAt: submission?.submitted_at ?? null,
        analysisId: submission?.analysis_id ?? null,
        reviewPath: submission?.analysis_id ? `/review/${submission.analysis_id}` : null,
      };
    });

    const summary = assignees.reduce(
      (acc, assignee) => {
        acc[assignee.status] += 1;
        return acc;
      },
      {
        not_submitted: 0,
        submitted: 0,
        processing: 0,
        analyzed: 0,
        failed: 0,
      },
    );

    return NextResponse.json({ assignment, assignees, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assignment status.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
