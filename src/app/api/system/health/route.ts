import { NextResponse } from "next/server";

import { VIDEO_BUCKET } from "@/lib/supabase/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Check = {
  ok: boolean;
  severity: "ok" | "warning" | "error";
  detail: string;
};

export async function GET() {
  const supabase = createServerSupabaseClient();

  const checks: {
    database: Check;
    storage: Check;
    analysisWorkerSecret: Check;
  } = {
    database: { ok: false, severity: "error", detail: "Unknown" },
    storage: { ok: false, severity: "error", detail: "Unknown" },
    analysisWorkerSecret: { ok: false, severity: "warning", detail: "Unknown" },
  };

  try {
    const { error } = await supabase.from("teams").select("id").limit(1);
    checks.database = error
      ? { ok: false, severity: "error", detail: error.message }
      : { ok: true, severity: "ok", detail: "Supabase query succeeded." };
  } catch (error) {
    checks.database = {
      ok: false,
      severity: "error",
      detail: error instanceof Error ? error.message : "Database check failed.",
    };
  }

  try {
    const { data: bucket, error } = await supabase.storage.getBucket(VIDEO_BUCKET);
    if (error) {
      checks.storage = { ok: false, severity: "error", detail: error.message };
    } else if (!bucket) {
      checks.storage = {
        ok: false,
        severity: "error",
        detail: `Storage bucket "${VIDEO_BUCKET}" is missing.`,
      };
    } else {
      checks.storage = {
        ok: true,
        severity: "ok",
        detail: `Storage bucket "${VIDEO_BUCKET}" is available.`,
      };
    }
  } catch (error) {
    checks.storage = {
      ok: false,
      severity: "error",
      detail: error instanceof Error ? error.message : "Storage check failed.",
    };
  }

  checks.analysisWorkerSecret = process.env.ANALYSIS_JOB_SECRET
    ? { ok: true, severity: "ok", detail: "ANALYSIS_JOB_SECRET is configured." }
    : {
        ok: false,
        severity: "warning",
        detail: "ANALYSIS_JOB_SECRET is missing (recommended for production).",
      };

  const ok = checks.database.ok && checks.storage.ok;

  return NextResponse.json({
    ok,
    checks,
    checkedAt: new Date().toISOString(),
  });
}
