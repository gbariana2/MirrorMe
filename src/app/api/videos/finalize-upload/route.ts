import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { VIDEO_BUCKET } from "@/lib/supabase/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, HttpError } from "@/lib/team";

type Payload = {
  userId?: string;
  kind: "reference" | "submission";
  title?: string;
  path: string;
  mimeType: string;
};

function getTitle(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<Payload>;
    await getRequiredUserId(payload.userId);
    const kind = payload.kind === "reference" || payload.kind === "submission" ? payload.kind : null;
    if (!kind) {
      return NextResponse.json({ error: "kind must be 'reference' or 'submission'." }, { status: 400 });
    }

    const path = assertNonEmptyString(payload.path, "path", 500);
    const mimeType = assertNonEmptyString(payload.mimeType, "mimeType", 120);
    if (!path.startsWith(`${kind}/`)) {
      return NextResponse.json({ error: "Invalid upload path for requested video kind." }, { status: 400 });
    }

    const title = getTitle(
      payload.title,
      kind === "reference" ? "Reference choreography" : "Dancer submission",
    );

    const supabase = createServerSupabaseClient();
    const { data: publicUrlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);

    const { data: videoRecord, error: insertError } = await supabase
      .from("videos")
      .insert({
        kind,
        title,
        file_path: path,
        file_url: publicUrlData.publicUrl,
        mime_type: mimeType,
      })
      .select("id, title, file_url")
      .single();

    if (insertError || !videoRecord) {
      throw insertError ?? new Error("Failed to finalize uploaded video record.");
    }

    return NextResponse.json({
      videoId: videoRecord.id,
      title: videoRecord.title,
      fileUrl: videoRecord.file_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize upload.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
