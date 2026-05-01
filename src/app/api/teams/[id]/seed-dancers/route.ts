import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/team";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SeedPayload = {
  count?: number;
  prefix?: string;
};

function normalizePrefix(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "demo_dancer";
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24) || "demo_dancer";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const userId = await getRequiredUserId();
    const payload = (await request.json()) as SeedPayload;
    const count = Number.isFinite(payload.count) ? Math.min(30, Math.max(1, Math.floor(payload.count!))) : 8;
    const prefix = normalizePrefix(payload.prefix);
    const supabase = createServerSupabaseClient();

    const { data: captainMembership, error: captainMembershipError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("team_id", id)
      .eq("user_id", userId)
      .eq("role", "captain")
      .maybeSingle();

    if (captainMembershipError) {
      throw captainMembershipError;
    }
    if (!captainMembership) {
      return NextResponse.json({ error: "Captain membership required." }, { status: 403 });
    }

    const { data: existingMembers, error: existingMembersError } = await supabase
      .from("team_memberships")
      .select("user_id")
      .eq("team_id", id)
      .like("user_id", `${prefix}_%`);

    if (existingMembersError) {
      throw existingMembersError;
    }

    const existingIds = new Set((existingMembers ?? []).map((member) => member.user_id));
    const nextRows: Array<{ team_id: string; user_id: string; role: "dancer" }> = [];

    let index = 1;
    while (nextRows.length < count && index < 1000) {
      const candidate = `${prefix}_${String(index).padStart(3, "0")}`;
      if (!existingIds.has(candidate)) {
        nextRows.push({
          team_id: id,
          user_id: candidate,
          role: "dancer",
        });
      }
      index += 1;
    }

    if (nextRows.length === 0) {
      return NextResponse.json({ added: 0, dancers: [] });
    }

    const { error: insertError } = await supabase.from("team_memberships").insert(nextRows);
    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      added: nextRows.length,
      dancers: nextRows.map((row) => row.user_id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seed dancers.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
