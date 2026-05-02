import { NextResponse } from "next/server";

import { getRequiredUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureVideoBucket } from "@/lib/video-upload";

type BootstrapPayload = {
  userId?: string;
};

type TableCheck = {
  table: string;
  ok: boolean;
  detail: string;
};

const REQUIRED_TABLES = ["teams", "team_memberships", "assignments", "assignment_targets"];

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<BootstrapPayload>;
    await getRequiredUserId(payload.userId);
    const supabase = createServerSupabaseClient();

    const tableChecks: TableCheck[] = [];

    for (const table of REQUIRED_TABLES) {
      try {
        const { error } = await supabase.from(table).select("id").limit(1);
        if (error) {
          tableChecks.push({ table, ok: false, detail: error.message });
        } else {
          tableChecks.push({ table, ok: true, detail: "OK" });
        }
      } catch (error) {
        tableChecks.push({
          table,
          ok: false,
          detail: error instanceof Error ? error.message : "Unknown table check error.",
        });
      }
    }

    let storageFixed = false;
    let storageDetail = "OK";
    try {
      await ensureVideoBucket();
      storageFixed = true;
      storageDetail = "videos bucket is ready.";
    } catch (error) {
      storageDetail = error instanceof Error ? error.message : "Failed to ensure videos bucket.";
    }

    const missingTables = tableChecks.filter((check) => !check.ok).map((check) => check.table);

    return NextResponse.json({
      ok: missingTables.length === 0 && storageFixed,
      tableChecks,
      storage: { ok: storageFixed, detail: storageDetail },
      nextSteps:
        missingTables.length > 0
          ? [
              "Run Supabase migrations against your connected project to create missing tables.",
              "After migrations complete, click Refresh in System health.",
            ]
          : ["System schema looks healthy. Refresh System health to verify final status."],
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run setup fix.";
    const status = message.includes("Authentication") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
