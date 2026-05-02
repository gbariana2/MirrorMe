"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

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
  summary: {
    not_submitted: number;
    submitted: number;
    processing: number;
    analyzed: number;
    failed: number;
  };
  teamDancerUserIds: string[];
};

export default function CaptainAssignmentStatusPage({ params }: Props) {
  const { userId } = useAuth();
  const [statusData, setStatusData] = useState<AssignmentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editDueAt, setEditDueAt] = useState("");
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const assignmentId = params.id;
  const submittedAssignees = statusData?.assignees.filter(
    (assignee) => assignee.status === "submitted" && assignee.reviewPath,
  ) ?? [];

  async function loadStatus() {
    if (!assignmentId) {
      return;
    }

    setIsRefreshing(true);
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const response = await fetch(`/api/assignments/${assignmentId}/status${query}`);
      const payload = (await response.json()) as AssignmentStatusResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Failed to load status.");
      }
      setStatusData(payload);
      setEditDueAt(payload.assignment.due_at.slice(0, 16));
      setEditAssignees(payload.assignees.map((assignee) => assignee.dancerUserId));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load status.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus();

    const interval = setInterval(() => {
      loadStatus();
    }, 15000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, userId]);

  async function saveAssignmentEdits() {
    if (!assignmentId) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captainUserId: userId ?? undefined,
          dueAt: editDueAt,
          assigneeUserIds: editAssignees,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update assignment.");
      }
      await loadStatus();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update assignment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/15 soft-panel p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Assignment Assignee Status</h1>
          <div className="flex items-center gap-4">
            <Link
              href={`/captain/assignments/${assignmentId}/run`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                submittedAssignees.length === 0
                  ? "pointer-events-none bg-slate-500/40 text-slate-300"
                  : "bg-[#2fa8ff] text-slate-950"
              }`}
            >
              Batch Runner ({submittedAssignees.length})
            </Link>
            <button
              type="button"
              onClick={loadStatus}
              disabled={isRefreshing}
              className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/captain" className="text-sm font-semibold text-[#8fd4ff] underline">
              Back to captain dashboard
            </Link>
          </div>
        </div>

        {statusData ? (
          <div className="mt-4 rounded-xl border border-white/15 bg-[#121527] p-4">
            <p className="text-sm font-semibold text-white">{statusData.assignment.title}</p>
            <p className="mt-1 text-xs text-slate-300">
              Due: {new Date(statusData.assignment.due_at).toLocaleString()}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/20 px-2 py-1 text-slate-300">
                Not submitted: {statusData.summary.not_submitted}
              </span>
              <span className="rounded-full border border-white/20 px-2 py-1 text-slate-300">
                Submitted: {statusData.summary.submitted}
              </span>
              <span className="rounded-full border border-white/20 px-2 py-1 text-slate-300">
                Processing: {statusData.summary.processing}
              </span>
              <span className="rounded-full border border-white/20 px-2 py-1 text-slate-300">
                Analyzed: {statusData.summary.analyzed}
              </span>
              <span className="rounded-full border border-white/20 px-2 py-1 text-slate-300">
                Failed: {statusData.summary.failed}
              </span>
            </div>

            <div className="mt-4 rounded-lg border border-white/15 bg-[#171c2f] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Edit assignment</p>
              <div className="mt-3 grid gap-3">
                <input
                  type="datetime-local"
                  value={editDueAt}
                  onChange={(event) => setEditDueAt(event.target.value)}
                  className="rounded-xl border border-white/20 bg-[#121527] px-3 py-2 text-xs outline-none"
                />
                <div className="grid gap-2">
                  {statusData.teamDancerUserIds.map((dancerUserId) => (
                    <label key={dancerUserId} className="flex items-center gap-2 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={editAssignees.includes(dancerUserId)}
                        onChange={(event) => {
                          setEditAssignees((current) =>
                            event.target.checked
                              ? [...current, dancerUserId]
                              : current.filter((value) => value !== dancerUserId),
                          );
                        }}
                      />
                      <span>{dancerUserId}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={saveAssignmentEdits}
                  disabled={isSaving}
                  className="w-fit rounded-full bg-[#2fa8ff] px-3 py-1 text-xs font-semibold text-slate-950 disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
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
