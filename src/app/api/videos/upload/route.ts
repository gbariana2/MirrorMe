import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import {
  assertVideoFile,
  ensureVideoBucket,
  getTitle,
  uploadVideo,
  UploadHttpError,
  type VideoKind,
} from "@/lib/video-upload";

function assertKind(value: FormDataEntryValue | null): VideoKind {
  if (value === "reference" || value === "submission") {
    return value;
  }

  throw new UploadHttpError("kind must be 'reference' or 'submission'.", 400);
}

export async function POST(request: Request) {
  try {
    await getRequiredUserId();
    const formData = await request.formData();
    const kind = assertKind(formData.get("kind"));
    const file = assertVideoFile(formData.get("video"), "Video");
    const title = getTitle(
      formData.get("title"),
      kind === "reference" ? "Reference choreography" : "Dancer submission",
    );

    await ensureVideoBucket();
    const record = await uploadVideo(kind, file, title);

    return NextResponse.json({
      videoId: record.id,
      title: record.title,
      fileUrl: record.file_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = error instanceof UploadHttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
