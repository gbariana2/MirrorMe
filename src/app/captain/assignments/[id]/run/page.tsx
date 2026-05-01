"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  params: {
    id: string;
  };
};

type AssigneeStatus = {
  dancerUserId: string;
  status: "not_submitted" | "submitted" | "processing" | "analyzed" | "failed";
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

export default function CaptainAssignmentBatchRunPage({ params }: Props) {
  const assignmentId = params.id;
  const [statusData, setStatusData] = useState<AssignmentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const submittedQueue = useMemo(
    () =>
      (statusData?.assignees ?? []).filter(
        (assignee) => assignee.status === "submitted" && assignee.reviewPath,
      ),
    [statusData],
  );

  const currentAssignee = submittedQueue[currentIndex] ?? null;

  async function loadStatus() {
    const response = await fetch(`/api/assignments/${assignmentId}/status`);
    const payload = (await response.json()) as AssignmentStatusResponse | { error: string };
    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Failed to load assignment status.");
    }
    setStatusData(payload);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load assignment status.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  useEffect(() => {
    if (!isRunning || !currentAssignee) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/assignments/${assignmentId}/status`);
        const payload = (await response.json()) as AssignmentStatusResponse | { error: string };
        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "Failed to refresh status.");
        }

        setStatusData(payload);

        const refreshedAssignee = payload.assignees.find(
          (assignee) => assignee.dancerUserId === currentAssignee.dancerUserId,
        );

        if (!refreshedAssignee || refreshedAssignee.status !== "submitted") {
          setCurrentIndex((value) => value + 1);
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to refresh status.");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [assignmentId, currentAssignee, isRunning]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    if (currentIndex >= submittedQueue.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRunning(false);
    }
  }, [currentIndex, isRunning, submittedQueue.length]);

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-white/15 soft-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">Batch Analysis Runner</h1>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setCurrentIndex(0);
                setIsRunning(true);
              }}
              disabled={submittedQueue.length === 0 || isRunning}
              className="rounded-full bg-[#2fa8ff] px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
            >
              {isRunning ? "Running..." : `Start (${submittedQueue.length})`}
            </button>
            <Link href={`/captain/assignments/${assignmentId}`} className="text-xs font-semibold text-[#8fd4ff] underline">
              Back to status page
            </Link>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          This runner processes submitted dancers one-by-one in a single tab and advances
          automatically when each status changes from submitted.
        </p>

        <div className="mt-5 rounded-xl border border-white/15 bg-[#121527] p-4 text-xs text-slate-300">
          Current:{" "}
          {isRunning
            ? `${Math.min(currentIndex + 1, submittedQueue.length)} / ${submittedQueue.length}`
            : `0 / ${submittedQueue.length}`}
          {currentAssignee ? ` • ${currentAssignee.dancerUserId}` : ""}
        </div>

        {isRunning && currentAssignee?.reviewPath ? (
          <iframe
            title="Batch analysis runner frame"
            src={`${currentAssignee.reviewPath}?autorun=1`}
            className="mt-5 h-[760px] w-full rounded-xl border border-white/15 bg-black"
          />
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-white/20 bg-[#121527] p-6 text-sm text-slate-300">
            {submittedQueue.length === 0
              ? "No submitted assignees are waiting for analysis."
              : "Press Start to begin sequential analysis in this tab."}
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </main>
  );
}
