"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  params: {
    id: string;
  };
};

type AssigneeStatus = {
  dancerUserId: string;
  status: "not_submitted" | "submitted" | "analyzed";
  submittedAt: string | null;
  analysisId: string | null;
  reviewPath: string | null;
};

type AssignmentStatusResponse = {
  assignment: {
    id: string;
    title: string;
    due_at: string;
    reference_video_id: string;
  };
  assignees: AssigneeStatus[];
};

export default function CaptainAssignmentStatusPage({ params }: Props) {
  const [statusData, setStatusData] = useState<AssignmentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assignmentId = params.id;

  useEffect(() => {
    if (!assignmentId) {
      return;
    }

    fetch(`/api/assignments/${assignmentId}/status`)
      .then(async (response) => {
        const payload = (await response.json()) as AssignmentStatusResponse | { error: string };
        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "Failed to load status.");
        }
        setStatusData(payload);
      })
      .catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load status.");
      });
  }, [assignmentId]);

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/15 soft-panel p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Assignment Assignee Status</h1>
          <Link href="/captain" className="text-sm font-semibold text-[#8fd4ff] underline">
            Back to captain dashboard
          </Link>
        </div>

        {statusData ? (
          <div className="mt-4 rounded-xl border border-white/15 bg-[#121527] p-4">
            <p className="text-sm font-semibold text-white">{statusData.assignment.title}</p>
            <p className="mt-1 text-xs text-slate-300">
              Due: {new Date(statusData.assignment.due_at).toLocaleString()}
            </p>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {statusData?.assignees.map((assignee) => (
            <article key={assignee.dancerUserId} className="rounded-xl border border-white/15 bg-[#121527] p-4">
              <p className="text-sm font-semibold text-white">{assignee.dancerUserId}</p>
              <p className="mt-1 text-xs text-slate-300">
                Status: {assignee.status.replace("_", " ")}
              </p>
              {assignee.submittedAt ? (
                <p className="mt-1 text-xs text-slate-300">
                  Submitted: {new Date(assignee.submittedAt).toLocaleString()}
                </p>
              ) : null}
              {assignee.reviewPath ? (
                <Link href={assignee.reviewPath} className="mt-2 inline-flex text-xs font-semibold text-[#8fd4ff] underline">
                  Open review
                </Link>
              ) : null}
            </article>
          ))}
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </main>
  );
}
