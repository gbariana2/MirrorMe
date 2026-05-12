"use client";

import { useEffect, useRef, useState } from "react";

type Issue = {
  id: string;
  timestampMs: number;
  jointName: string;
  severity: "major";
  notes: string | null;
};

type Props = {
  issues: Issue[];
  referenceVideoUrl: string | null;
  submissionVideoUrl: string | null;
};

function formatTimestampMs(timestampMs: number) {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatJointName(jointName: string) {
  return jointName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function IssueSideBySide({ issues, referenceVideoUrl, submissionVideoUrl }: Props) {
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const referenceRef = useRef<HTMLVideoElement | null>(null);
  const submissionRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!activeIssue) {
      return;
    }

    const targetTimeSeconds = activeIssue.timestampMs / 1000;
    if (referenceRef.current) {
      referenceRef.current.currentTime = targetTimeSeconds;
    }
    if (submissionRef.current) {
      submissionRef.current.currentTime = targetTimeSeconds;
    }
  }, [activeIssue]);

  return (
    <section className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">Critical Flags</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">Very major deviations</h2>

      {issues.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/25 bg-[#161922] p-5 text-sm text-slate-300">
          No critical mismatches were flagged.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {issues.map((issue) => (
            <article key={issue.id} className="rounded-2xl border border-white/15 bg-[#161922] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{formatJointName(issue.jointName)}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {formatTimestampMs(issue.timestampMs)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveIssue(issue)}
                  className="rounded-full border border-[#8fd4ff]/55 px-3 py-1 text-xs font-semibold text-[#8fd4ff]"
                >
                  View side-by-side
                </button>
              </div>
              {issue.notes ? <p className="mt-2 text-sm text-slate-300">{issue.notes}</p> : null}
            </article>
          ))}
        </div>
      )}

      {activeIssue && referenceVideoUrl && submissionVideoUrl ? (
        <div className="mt-6 rounded-2xl border border-white/15 bg-[#121527] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">
              Side-by-side at {formatTimestampMs(activeIssue.timestampMs)}
            </p>
            <button
              type="button"
              onClick={() => setActiveIssue(null)}
              className="text-xs font-semibold text-[#8fd4ff] underline"
            >
              Close
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <video ref={referenceRef} src={referenceVideoUrl} controls className="w-full rounded-xl" />
            <video ref={submissionRef} src={submissionVideoUrl} controls className="w-full rounded-xl" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
