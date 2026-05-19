import Link from "next/link";
import { notFound } from "next/navigation";

import { FullPlaybackComparison } from "@/components/full-playback-comparison";
import { IssueSideBySide } from "@/components/issue-side-by-side";
import { PoseAnalysisPanel } from "@/components/pose-analysis-panel";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isYouTubeUrl } from "@/lib/youtube";

type ReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    autorun?: string;
  }>;
};

export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const autoRun = query.autorun === "1";
  const supabase = createServerSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      `
        id,
        status,
        overall_score,
        summary,
        created_at,
        completed_at,
        reference_video_id,
        submission_video_id,
        analysis_issues (
          id,
          timestamp_ms,
          joint_name,
          severity,
          expected_angle,
          actual_angle,
          delta,
          notes
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!analysis) {
    notFound();
  }

  const [{ data: reference }, { data: submission }] = await Promise.all([
    supabase
      .from("videos")
      .select("id, title, file_url, duration_ms")
      .eq("id", analysis.reference_video_id)
      .maybeSingle(),
    supabase
      .from("videos")
      .select("id, title, file_url, duration_ms")
      .eq("id", analysis.submission_video_id)
      .maybeSingle(),
  ]);

  const issues = [...(analysis.analysis_issues ?? [])].sort(
    (left, right) => left.timestamp_ms - right.timestamp_ms,
  );
  const majorIssueCount = issues.filter((issue) => issue.severity === "major").length;
  const minorIssueCount = issues.filter((issue) => issue.severity === "minor").length;
  const overallScore = typeof analysis.overall_score === "number" ? analysis.overall_score : null;
  const scoreTone =
    overallScore === null
      ? "text-slate-300"
      : overallScore >= 85
        ? "text-emerald-300"
        : overallScore >= 70
          ? "text-amber-300"
          : overallScore >= 50
            ? "text-orange-300"
            : "text-rose-300";
  const scoreBand =
    overallScore === null
      ? "Pending"
      : overallScore >= 85
        ? "Excellent"
        : overallScore >= 70
          ? "Good"
          : overallScore >= 50
            ? "Needs Work"
            : "Critical";
  const createdAt = new Date(analysis.created_at);
  const createdAtUtcDisplay = Number.isNaN(createdAt.getTime())
    ? "Unknown"
    : createdAt.toISOString().replace("T", " ").replace(".000Z", " UTC");
  const completedAtUtcDisplay = analysis.completed_at
    ? new Date(analysis.completed_at).toISOString().replace("T", " ").replace(".000Z", " UTC")
    : null;

  function formatTimestampMs(timestampMs: number) {
    const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">
                Analysis Review
              </p>
              <h1 className="mt-2 bg-gradient-to-r from-[#b8e4ff] via-[#7ecbff] to-[#37adff] bg-clip-text text-3xl font-semibold tracking-[-0.03em] text-transparent">
                {submission?.title ?? "Submission"} vs. {reference?.title ?? "Reference"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Analysis id: <span className="font-mono text-xs">{analysis.id}</span>
              </p>
            </div>

            <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-200">
              Status: {analysis.status}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-[#161922] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Overall score
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                <span className={scoreTone}>{overallScore ?? "--"}</span>
              </p>
              <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.14em] ${scoreTone}`}>
                {scoreBand}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-[#161922] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Issues detected
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">{issues.length}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-[#161922] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Created (UTC)
              </p>
              <p className="mt-2 text-sm font-medium text-slate-200">
                {createdAtUtcDisplay}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">
                  Uploaded Assets
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                  Reference and submission
                </h2>
              </div>
              <Link
                href="/compare"
                className="rounded-full border border-white/25 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/15"
              >
                New comparison
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[reference, submission].map((video, index) => (
                <article
                  key={video?.id ?? index}
                  className="rounded-2xl border border-white/15 bg-[#161922] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {index === 0 ? "Reference" : "Submission"}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    {video?.title ?? "Untitled video"}
                  </h3>
                  <p className="mt-3 text-sm text-slate-300">
                    Duration:{" "}
                    {video?.duration_ms ? formatTimestampMs(video.duration_ms) : "Unknown"}
                  </p>
                  {video?.file_url ? (
                    <a
                      href={video.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-medium text-[#8fd4ff] underline"
                    >
                      {isYouTubeUrl(video.file_url) ? "Open YouTube reference" : "Open stored asset"}
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/15 soft-panel p-6 text-slate-100 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">
              Processing State
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
              Feedback Report
            </h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Status</p>
                <p className="mt-2 text-sm font-semibold text-white">{analysis.status}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Completed (UTC)</p>
                <p className="mt-2 text-sm font-semibold text-white">{completedAtUtcDisplay ?? "Not completed yet"}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Issue count</p>
                <p className="mt-2 text-sm font-semibold text-white">{issues.length}</p>
                <p className="mt-1 text-xs text-slate-300">Major: {majorIssueCount} • Minor: {minorIssueCount}</p>
              </div>
            </div>

            {analysis.summary ? (
              <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                {analysis.summary}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                No generated summary yet.
              </div>
            )}
          </aside>
        </section>

        <PoseAnalysisPanel
          analysisId={analysis.id}
          referenceVideoUrl={reference?.file_url ?? null}
          submissionVideoUrl={submission?.file_url ?? null}
          existingIssueCount={issues.length}
          autoRun={autoRun || analysis.status === "pending"}
        />

        <IssueSideBySide
          analysisId={analysis.id}
          issues={issues.map((issue) => ({
            id: issue.id,
            timestampMs: issue.timestamp_ms,
            jointName: issue.joint_name,
            severity: issue.severity === "minor" ? "minor" : "major",
            notes: issue.notes,
          }))}
          referenceVideoUrl={reference?.file_url ?? null}
          submissionVideoUrl={submission?.file_url ?? null}
        />

        <FullPlaybackComparison
          analysisId={analysis.id}
          referenceVideoUrl={reference?.file_url ?? null}
          submissionVideoUrl={submission?.file_url ?? null}
        />
      </div>
    </main>
  );
}
