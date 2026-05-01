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
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const userId = await getRequiredUserId();
    const supabase = createServerSupabaseClient();

    const { data: member, error: memberError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("team_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }
    if (!member) {
      return NextResponse.json({ error: "Team membership required." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("assignments")
      .select("id, title, instructions, due_at, reference_video_id, created_at")
      .eq("team_id", id)
      .order("due_at", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ assignments: data ?? [] });
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

    return NextResponse.json({
      assignmentId: assignment.id,
      title: assignment.title,
      dueAt: assignment.due_at,
      referenceVideoId: assignment.reference_video_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create assignment.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
