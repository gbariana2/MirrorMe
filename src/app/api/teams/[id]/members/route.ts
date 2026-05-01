import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, HttpError } from "@/lib/team";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type JoinPayload = {
  userId?: string;
  joinCode: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<JoinPayload>;
    const userId = await getRequiredUserId(payload.userId);
    const joinCode = assertNonEmptyString(payload.joinCode, "joinCode", 12).toUpperCase();
    const supabase = createServerSupabaseClient();

    const { data: team, error: teamLookupError } = await supabase
      .from("teams")
      .select("id, join_code")
      .eq("id", id)
      .maybeSingle();

    if (teamLookupError) {
      throw teamLookupError;
    }

    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (team.join_code !== joinCode) {
      return NextResponse.json({ error: "Invalid join code." }, { status: 403 });
    }

    const { error: insertError } = await supabase.from("team_memberships").insert({
      team_id: id,
      user_id: userId,
      role: "dancer",
    });

    if (insertError && !insertError.message.toLowerCase().includes("duplicate")) {
      throw insertError;
    }

    return NextResponse.json({ teamId: id, userId, role: "dancer" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join team.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
