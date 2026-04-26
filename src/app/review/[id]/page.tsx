import Link from "next/link";
import { notFound } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type ReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params;
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(246,186,78,0.25),_transparent_32%),linear-gradient(180deg,_#fff9ef_0%,_#f3efe6_46%,_#e6e1d7_100%)] px-6 py-8 text-stone-900 sm:px-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(59,38,16,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Analysis Review
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-stone-950">
                {submission?.title ?? "Submission"} vs. {reference?.title ?? "Reference"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                Analysis id: <span className="font-mono text-xs">{analysis.id}</span>
              </p>
            </div>

            <div className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
              Status: {analysis.status}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                Overall score
              </p>
              <p className="mt-2 text-3xl font-semibold text-stone-950">
                {analysis.overall_score ?? "--"}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                Issues detected
              </p>
              <p className="mt-2 text-3xl font-semibold text-stone-950">{issues.length}</p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                Created
              </p>
              <p className="mt-2 text-sm font-medium text-stone-800">
                {new Date(analysis.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(59,38,16,0.08)] backdrop-blur sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Uploaded Assets
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-stone-950">
                  Reference and submission
                </h2>
              </div>
              <Link
                href="/compare"
                className="rounded-full border border-stone-900/10 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                New comparison
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[reference, submission].map((video, index) => (
                <article
                  key={video?.id ?? index}
                  className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                    {index === 0 ? "Reference" : "Submission"}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-stone-950">
                    {video?.title ?? "Untitled video"}
                  </h3>
                  <p className="mt-3 text-sm text-stone-600">
                    Duration:{" "}
                    {video?.duration_ms ? `${(video.duration_ms / 1000).toFixed(1)}s` : "Unknown"}
                  </p>
                  {video?.file_url ? (
                    <a
                      href={video.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-medium text-amber-700 underline"
                    >
                      Open stored asset
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-100 shadow-[0_20px_60px_rgba(59,38,16,0.08)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/80">
              Processing State
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              Feedback report placeholder
            </h2>
            <p className="mt-4 text-sm leading-6 text-stone-300">
              This page is already backed by real Supabase data. The next step is to
              fill `analysis_frames` and `analysis_issues` from the pose extraction
              pipeline instead of leaving the analysis pending.
            </p>

            {analysis.summary ? (
              <div className="mt-6 rounded-2xl bg-white/6 p-4 text-sm leading-6 text-stone-300">
                {analysis.summary}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-white/6 p-4 text-sm leading-6 text-stone-300">
                No generated summary yet.
              </div>
            )}
          </aside>
        </section>

        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(59,38,16,0.08)] backdrop-blur sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Issues
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-stone-950">
              Timestamped flags
            </h2>
          </div>

          {issues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-900/15 bg-stone-50 p-6 text-sm leading-6 text-stone-600">
              No comparison issues yet. Once frame analysis is wired in, major and minor
              mismatches will appear here with timestamps and angle deltas.
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => (
                <article
                  key={issue.id}
                  className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        {issue.joint_name}
                      </p>
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                        {issue.timestamp_ms} ms
                      </p>
                    </div>
                    <div className="rounded-full border border-stone-900/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700">
                      {issue.severity}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-700">
                    Expected {issue.expected_angle}&deg;, actual {issue.actual_angle}&deg;,
                    delta {issue.delta}&deg;.
                  </p>
                  {issue.notes ? (
                    <p className="mt-2 text-sm leading-6 text-stone-600">{issue.notes}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
