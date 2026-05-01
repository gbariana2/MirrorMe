import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, HttpError } from "@/lib/team";
import { extractYouTubeVideoId } from "@/lib/youtube";

type Payload = {
  url: string;
  title?: string;
};

export async function POST(request: Request) {
  try {
    await getRequiredUserId();
    const payload = (await request.json()) as Partial<Payload>;
    const url = assertNonEmptyString(payload.url, "url", 2000);
    const videoId = extractYouTubeVideoId(url);

    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
    }

    const title = typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim().slice(0, 200)
      : `YouTube reference (${videoId})`;

    const supabase = createServerSupabaseClient();

    const { data: record, error } = await supabase
      .from("videos")
      .insert({
        kind: "reference",
        title,
        file_path: `youtube/${videoId}-${crypto.randomUUID()}`,
        file_url: url,
        mime_type: "video/youtube",
      })
      .select("id, title, file_url")
      .single();

    if (error || !record) {
      throw error ?? new Error("Failed to store YouTube reference.");
    }

    return NextResponse.json({
      videoId: record.id,
      title: record.title,
      fileUrl: record.file_url,
      source: "youtube",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create YouTube reference.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
