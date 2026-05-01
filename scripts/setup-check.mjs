import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANALYSIS_JOB_SECRET",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
];

function checkFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function run() {
  checkFile(".env.example");
  checkFile("vercel.json");
  checkFile("supabase/migrations/20260425193000_initial_schema.sql");
  checkFile("supabase/migrations/20260501183000_analysis_jobs.sql");
  checkFile("supabase/migrations/20260501203000_team_mode_foundation.sql");

  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  for (const key of REQUIRED_ENV) {
    if (!envExample.includes(`${key}=`)) {
      throw new Error(`.env.example is missing ${key}`);
    }
  }

  const vercelConfig = readJson("vercel.json");
  const hasJobCron = Array.isArray(vercelConfig.crons)
    && vercelConfig.crons.some((cron) =>
      typeof cron?.path === "string"
      && cron.path.startsWith("/api/internal/analysis-jobs/process-next"),
    );

  if (!hasJobCron) {
    throw new Error("vercel.json is missing analysis job cron configuration.");
  }

  console.log("Setup check passed.");
}

run();
