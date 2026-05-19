import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await getRequiredUserId(searchParams.get("userId") ?? undefined);
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

    const { data: videos, error: videosError } = await supabase
      .from("videos")
      .select("id, file_url, title")
      .is("duration_ms", null)
      .not("file_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (videosError) {
      throw videosError;
    }

    return NextResponse.json({ videos: videos ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load videos missing duration.";
    const status = message.includes("Authentication") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
