import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, HttpError } from "@/lib/team";

type JoinByCodePayload = {
  userId?: string;
  joinCode: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<JoinByCodePayload>;
    const userId = await getRequiredUserId(payload.userId);
    const joinCode = assertNonEmptyString(payload.joinCode, "joinCode", 12).toUpperCase();
    const supabase = createServerSupabaseClient();

    const { data: team, error: teamLookupError } = await supabase
      .from("teams")
      .select("id, name, join_code")
      .eq("join_code", joinCode)
      .maybeSingle();

    if (teamLookupError) {
      throw teamLookupError;
    }
    if (!team) {
      return NextResponse.json({ error: "Invalid join code." }, { status: 404 });
    }

    const { error: insertError } = await supabase.from("team_memberships").insert({
      team_id: team.id,
      user_id: userId,
      role: "dancer",
    });

    if (insertError && !insertError.message.toLowerCase().includes("duplicate")) {
      throw insertError;
    }

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      joinCode: team.join_code,
      role: "dancer",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join team.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
