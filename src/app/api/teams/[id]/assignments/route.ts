import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertDueAt, assertNonEmptyString, HttpError } from "@/lib/team";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CreateAssignmentPayload = {
  captainUserId?: string;
  title: string;
  instructions?: string;
  dueAt: string;
  referenceVideoId: string;
  assigneeUserIds?: string[];
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const userId = await getRequiredUserId();
    const supabase = createServerSupabaseClient();

    const { data: member, error: memberError } = await supabase
      .from("team_memberships")
      .select("id, role")
      .eq("team_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }
    if (!member) {
      return NextResponse.json({ error: "Team membership required." }, { status: 403 });
    }

    let targetedAssignmentIds: string[] | null = null;

    if (member.role === "dancer") {
      const { data: targets, error: targetError } = await supabase
        .from("assignment_targets")
        .select("assignment_id")
        .eq("dancer_user_id", userId);

      if (targetError) {
        throw targetError;
      }

      targetedAssignmentIds = (targets ?? []).map((item) => item.assignment_id);
      if (targetedAssignmentIds.length === 0) {
        return NextResponse.json({ assignments: [] });
      }
    }

    let query = supabase
      .from("assignments")
      .select("id, title, instructions, due_at, reference_video_id, created_at")
      .eq("team_id", id)
      .order("due_at", { ascending: true });

    if (targetedAssignmentIds) {
      query = query.in("id", targetedAssignmentIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const assignments = data ?? [];
    const assignmentIds = assignments.map((assignment) => assignment.id);
    let assigneeCountMap = new Map<string, number>();

    if (assignmentIds.length > 0) {
      const { data: targets, error: targetsError } = await supabase
        .from("assignment_targets")
        .select("assignment_id")
        .in("assignment_id", assignmentIds);

      if (targetsError) {
        throw targetsError;
      }

      assigneeCountMap = (targets ?? []).reduce((map, row) => {
        map.set(row.assignment_id, (map.get(row.assignment_id) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }

    return NextResponse.json({
      assignments: assignments.map((assignment) => ({
        ...assignment,
        assignee_count: assigneeCountMap.get(assignment.id) ?? 0,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assignments.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<CreateAssignmentPayload>;
    const captainUserId = await getRequiredUserId(payload.captainUserId);
    const title = assertNonEmptyString(payload.title, "title");
    const dueAt = assertDueAt(payload.dueAt);
    const referenceVideoId = assertNonEmptyString(payload.referenceVideoId, "referenceVideoId");
    const assigneeUserIds = Array.isArray(payload.assigneeUserIds)
      ? payload.assigneeUserIds
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0)
      : [];
    const instructions =
      typeof payload.instructions === "string" ? payload.instructions.trim().slice(0, 2000) : null;
    const supabase = createServerSupabaseClient();

    const { data: captainMembership, error: membershipError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("team_id", id)
      .eq("user_id", captainUserId)
      .eq("role", "captain")
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!captainMembership) {
      return NextResponse.json({ error: "Captain membership required." }, { status: 403 });
    }

    if (assigneeUserIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one dancer for this assignment." },
        { status: 400 },
      );
    }

    const { data: dancers, error: dancersError } = await supabase
      .from("team_memberships")
      .select("user_id")
      .eq("team_id", id)
      .eq("role", "dancer")
      .in("user_id", assigneeUserIds);

    if (dancersError) {
      throw dancersError;
    }

    const validDancerIds = new Set((dancers ?? []).map((item) => item.user_id));
    if (validDancerIds.size !== new Set(assigneeUserIds).size) {
      return NextResponse.json({ error: "Some assignees are not team dancers." }, { status: 400 });
    }

    const { data: assignment, error: insertError } = await supabase
      .from("assignments")
      .insert({
        team_id: id,
        reference_video_id: referenceVideoId,
        title,
        instructions,
        due_at: dueAt,
        created_by: captainUserId,
      })
      .select("id, title, due_at, reference_video_id")
      .single();

    if (insertError || !assignment) {
      throw insertError ?? new Error("Failed to create assignment.");
    }

    const { error: targetsError } = await supabase.from("assignment_targets").insert(
      assigneeUserIds.map((dancerUserId) => ({
        assignment_id: assignment.id,
        dancer_user_id: dancerUserId,
      })),
    );

    if (targetsError) {
      throw targetsError;
    }

    return NextResponse.json({
      assignmentId: assignment.id,
      title: assignment.title,
      dueAt: assignment.due_at,
      referenceVideoId: assignment.reference_video_id,
      assigneeCount: assigneeUserIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create assignment.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
