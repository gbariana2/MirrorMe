import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, generateJoinCode, HttpError } from "@/lib/team";

type CreateTeamPayload = {
  teamName: string;
  captainUserId?: string;
};

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("team_memberships")
      .select(
        `
          role,
          teams (
            id,
            name,
            join_code,
            created_at
          )
        `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const teams = (data ?? [])
      .map((row) => ({
        role: row.role,
        team: Array.isArray(row.teams) ? row.teams[0] : row.teams,
      }))
      .filter((row) => row.team);

    return NextResponse.json({ teams });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load teams.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<CreateTeamPayload>;
    const teamName = assertNonEmptyString(payload.teamName, "teamName");
    const captainUserId = await getRequiredUserId(payload.captainUserId);
    const supabase = createServerSupabaseClient();

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        name: teamName,
        created_by: captainUserId,
        join_code: generateJoinCode(),
      })
      .select("id, name, join_code")
      .single();

    if (teamError || !team) {
      throw teamError ?? new Error("Failed to create team.");
    }

    const { error: membershipError } = await supabase.from("team_memberships").insert({
      team_id: team.id,
      user_id: captainUserId,
      role: "captain",
    });

    if (membershipError) {
      throw membershipError;
    }

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      joinCode: team.join_code,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create team.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
