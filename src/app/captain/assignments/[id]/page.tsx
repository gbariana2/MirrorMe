"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AssigneeStatus = {
  dancerUserId: string;
  status: "not_submitted" | "past_due" | "submitted" | "processing" | "analyzed" | "failed";
  submittedAt: string | null;
  analysisId: string | null;
  reviewPath: string | null;
};

type TeamMemberOption = {
  userId: string;
  role: "captain" | "dancer";
  displayName: string | null;
};

type AssignmentStatusResponse = {
  assignment: {
    id: string;
    title: string;
    due_at: string;
    reference_video_id: string;
    archived_at?: string | null;
  };
  assignees: AssigneeStatus[];
  summary: {
    not_submitted: number;
    past_due: number;
    submitted: number;
    processing: number;
    analyzed: number;
    failed: number;
  };
  teamMemberOptions: TeamMemberOption[];
};

export default function CaptainAssignmentStatusPage() {
  const { userId } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [statusData, setStatusData] = useState<AssignmentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [editDueAt, setEditDueAt] = useState("");
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const assignmentId = typeof params?.id === "string" ? params.id : "";
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

  async function toggleArchiveAssignment() {
    if (!assignmentId) {
      return;
    }
    const currentlyArchived = Boolean(statusData?.assignment.archived_at);

    const confirmed = window.confirm(
      currentlyArchived
        ? "Restore this archived assignment?"
        : "Archive this assignment? You can restore it later.",
    );
    if (!confirmed) {
      return;
    }

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captainUserId: userId ?? undefined,
          archived: !currentlyArchived,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update archive state.");
      }
      await loadStatus();
      if (!currentlyArchived) {
        router.push("/captain");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update archive state.");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-900 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-[#e8dccf] soft-panel p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Assignment Assignee Status</h1>
          <div className="flex items-center gap-4">
            <Link
              href={`/captain/assignments/${assignmentId}/run`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                submittedAssignees.length === 0
                  ? "pointer-events-none bg-slate-500/40 text-slate-700"
                  : "bg-[#ff7f5f] text-slate-950"
              }`}
            >
              Batch Runner ({submittedAssignees.length})
            </Link>
            <button
              type="button"
              onClick={loadStatus}
              disabled={isRefreshing}
              className="rounded-full border border-[#decfbe] bg-[#fffaf5] px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/captain" className="text-sm font-semibold text-[#d64f72] underline">
              Back to captain dashboard
            </Link>
            <Link href="/" className="text-sm font-semibold text-[#d64f72] underline">
              Home
            </Link>
          </div>
        </div>

        {!statusData && !error ? (
          <div className="mt-4 rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
            <p className="text-sm text-slate-700">Loading assignment details...</p>
          </div>
        ) : null}

        {statusData ? (
          <div className="mt-4 rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
            <p className="text-sm font-semibold text-slate-900">{statusData.assignment.title}</p>
            {statusData.assignment.archived_at ? (
              <p className="mt-1 text-xs font-semibold text-amber-300">
                Archived on {new Date(statusData.assignment.archived_at).toLocaleString()}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-700">
              Due: {new Date(statusData.assignment.due_at).toLocaleString()}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: "Not submitted",
                  value: statusData.summary.not_submitted,
                  tone: "border-slate-300/70 bg-slate-100 text-slate-800",
                },
                {
                  label: "Past due",
                  value: statusData.summary.past_due,
                  tone: "border-rose-300/70 bg-rose-100 text-rose-900",
                },
                {
                  label: "Submitted",
                  value: statusData.summary.submitted,
                  tone: "border-amber-300/70 bg-amber-100 text-amber-900",
                },
                {
                  label: "Processing",
                  value: statusData.summary.processing,
                  tone: "border-orange-400/45 bg-orange-500/15 text-orange-200",
                },
                {
                  label: "Analyzed",
                  value: statusData.summary.analyzed,
                  tone: "border-emerald-300/70 bg-emerald-100 text-emerald-900",
                },
                {
                  label: "Failed",
                  value: statusData.summary.failed,
                  tone: "border-fuchsia-300/70 bg-fuchsia-100 text-fuchsia-900",
                },
              ].map((item) => (
                <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.tone}`}>
                  <p className="text-[11px] uppercase tracking-[0.08em]">{item.label}</p>
                  <p className="mt-1 text-lg font-bold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-[#e8dccf] bg-[#fff6ef] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">Edit assignment</p>
              <div className="mt-3 grid gap-3">
                <input
                  type="datetime-local"
                  value={editDueAt}
                  onChange={(event) => setEditDueAt(event.target.value)}
                  className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-3 py-2 text-xs outline-none"
                />
                <div className="grid gap-2">
                  {statusData.teamMemberOptions.map((member) => (
                    <label key={member.userId} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={editAssignees.includes(member.userId)}
                        onChange={(event) => {
                          setEditAssignees((current) =>
                            event.target.checked
                              ? [...current, member.userId]
                              : current.filter((value) => value !== member.userId),
                          );
                        }}
                      />
                      <span>
                        {member.displayName?.trim() ? member.displayName : member.userId}{" "}
                        <span className="text-slate-500">({member.role})</span>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={saveAssignmentEdits}
                  disabled={isSaving}
                  className="w-fit rounded-full bg-[#ff7f5f] px-3 py-1 text-xs font-semibold text-slate-950 disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={toggleArchiveAssignment}
                  disabled={isArchiving}
                  className="w-fit rounded-full border border-rose-300/70 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900 disabled:opacity-60"
                >
                  {isArchiving
                    ? "Saving..."
                    : statusData.assignment.archived_at
                      ? "Restore assignment"
                      : "Archive assignment"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {statusData?.assignees.map((assignee) => (
            <article key={assignee.dancerUserId} className="rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
              <p className="text-sm font-semibold text-slate-900">{assignee.dancerUserId}</p>
              <p className="mt-1 text-xs text-slate-700">
                Status: {assignee.status.replace("_", " ")}
              </p>
              {assignee.submittedAt ? (
                <p className="mt-1 text-xs text-slate-700">
                  Submitted: {new Date(assignee.submittedAt).toLocaleString()}
                </p>
              ) : null}
              {assignee.reviewPath ? (
                <Link href={assignee.reviewPath} className="mt-2 inline-flex text-xs font-semibold text-[#d64f72] underline">
                  Open review
                </Link>
              ) : null}
            </article>
          ))}
          {statusData && statusData.assignees.length === 0 ? (
            <article className="rounded-xl border border-dashed border-[#decfbe] bg-[#fffaf5] p-4">
              <p className="text-sm font-semibold text-slate-900">No assignees yet</p>
              <p className="mt-1 text-xs text-slate-700">
                This assignment has no assigned dancers. Add dancers in the edit section above.
              </p>
            </article>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </main>
  );
}
