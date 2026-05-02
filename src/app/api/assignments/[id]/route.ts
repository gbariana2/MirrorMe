import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertDueAt, HttpError } from "@/lib/team";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateAssignmentPayload = {
  captainUserId?: string;
  dueAt?: string;
  assigneeUserIds?: string[];
  archived?: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<UpdateAssignmentPayload>;
    const captainUserId = await getRequiredUserId(payload.captainUserId);
    const dueAt = payload.dueAt ? assertDueAt(payload.dueAt) : null;
    const archiveState = typeof payload.archived === "boolean" ? payload.archived : null;
    const assigneeUserIds = Array.isArray(payload.assigneeUserIds)
      ? payload.assigneeUserIds
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0)
      : null;
    const supabase = createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, team_id")
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
      .eq("user_id", captainUserId)
      .eq("role", "captain")
      .maybeSingle();

    if (captainMembershipError) {
      throw captainMembershipError;
    }
    if (!captainMembership) {
      return NextResponse.json({ error: "Captain membership required." }, { status: 403 });
    }

    if (dueAt) {
      const { error: updateError } = await supabase
        .from("assignments")
        .update({ due_at: dueAt })
        .eq("id", assignment.id);
      if (updateError) {
        throw updateError;
      }
    }

    if (archiveState !== null) {
      const { error: archiveError } = await supabase
        .from("assignments")
        .update({ archived_at: archiveState ? new Date().toISOString() : null })
        .eq("id", assignment.id);
      if (archiveError) {
        throw archiveError;
      }
    }

    if (assigneeUserIds) {
      if (assigneeUserIds.length === 0) {
        return NextResponse.json(
          { error: "Select at least one dancer for this assignment." },
          { status: 400 },
        );
      }

      const { data: dancers, error: dancersError } = await supabase
        .from("team_memberships")
        .select("user_id")
        .eq("team_id", assignment.team_id)
        .eq("role", "dancer")
        .in("user_id", assigneeUserIds);

      if (dancersError) {
        throw dancersError;
      }

      const validDancerIds = new Set((dancers ?? []).map((item) => item.user_id));
      if (validDancerIds.size !== new Set(assigneeUserIds).size) {
        return NextResponse.json({ error: "Some assignees are not team dancers." }, { status: 400 });
      }

      const { error: deleteTargetsError } = await supabase
        .from("assignment_targets")
        .delete()
        .eq("assignment_id", assignment.id);
      if (deleteTargetsError) {
        throw deleteTargetsError;
      }

      const { error: insertTargetsError } = await supabase.from("assignment_targets").insert(
        assigneeUserIds.map((dancerUserId) => ({
          assignment_id: assignment.id,
          dancer_user_id: dancerUserId,
        })),
      );
      if (insertTargetsError) {
        throw insertTargetsError;
      }
    }

    return NextResponse.json({ assignmentId: assignment.id, updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update assignment.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const captainUserId = await getRequiredUserId(searchParams.get("userId"));
    const supabase = createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, team_id")
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
      .eq("user_id", captainUserId)
      .eq("role", "captain")
      .maybeSingle();

    if (captainMembershipError) {
      throw captainMembershipError;
    }
    if (!captainMembership) {
      return NextResponse.json({ error: "Captain membership required." }, { status: 403 });
    }

    const { error: archiveError } = await supabase
      .from("assignments")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", assignment.id);
    if (archiveError) {
      throw archiveError;
    }

    return NextResponse.json({ assignmentId: assignment.id, archived: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete assignment.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
