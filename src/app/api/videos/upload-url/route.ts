import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { buildVideoPath } from "@/lib/uploads";
import { VIDEO_BUCKET } from "@/lib/supabase/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertNonEmptyString, HttpError } from "@/lib/team";
import { ensureVideoBucket } from "@/lib/video-upload";

type Payload = {
  userId?: string;
  kind: "reference" | "submission";
  filename: string;
  mimeType: string;
};

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<Payload>;
    await getRequiredUserId(payload.userId);
    const kind = payload.kind === "reference" || payload.kind === "submission" ? payload.kind : null;
    if (!kind) {
      return NextResponse.json({ error: "kind must be 'reference' or 'submission'." }, { status: 400 });
    }
    const filename = assertNonEmptyString(payload.filename, "filename", 240);
    const mimeType = assertNonEmptyString(payload.mimeType, "mimeType", 120);
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Video must be one of: ${Array.from(ALLOWED_VIDEO_MIME_TYPES).join(", ")}.` },
        { status: 400 },
      );
    }

    await ensureVideoBucket();
    const path = buildVideoPath(kind, filename);
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUploadUrl(path, {
        upsert: false,
      });

    if (error || !data?.token) {
      throw error ?? new Error("Failed to create signed upload URL.");
    }

    return NextResponse.json({
      bucket: VIDEO_BUCKET,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare upload.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
