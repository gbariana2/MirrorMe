import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as { userId?: string; durationMs?: number };
    const userId = await getRequiredUserId(payload.userId);
    const supabase = createServerSupabaseClient();

    const { data: captainMembership, error: captainError } = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", userId)
      .eq("role", "captain")
      .limit(1);

    if (captainError) {
      throw captainError;
    }

    if (!captainMembership || captainMembership.length === 0) {
      return NextResponse.json({ error: "Captain access required." }, { status: 403 });
    }

    const durationMs =
      typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
        ? Math.max(0, Math.floor(payload.durationMs))
        : null;
    if (durationMs === null) {
      return NextResponse.json({ error: "durationMs must be a finite number." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("videos")
      .update({ duration_ms: durationMs })
      .eq("id", id)
      .select("id, duration_ms")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ video: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update video duration.";
    const status = message.includes("Authentication") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
