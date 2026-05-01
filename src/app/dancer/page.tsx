"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TeamRow = {
  role: "captain" | "dancer";
  team: {
    id: string;
    name: string;
    join_code: string;
  };
};

type Assignment = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string;
  reference_video_id: string;
};

type SubmissionResponse = {
  reviewPath: string;
};

export default function DancerPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [joinTeamId, setJoinTeamId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [submissionVideoIds, setSubmissionVideoIds] = useState<Record<string, string>>({});
  const [reviewLinks, setReviewLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function loadTeams() {
    const response = await fetch("/api/teams");
    const payload = (await response.json()) as { teams?: TeamRow[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load teams.");
    }
    const nextTeams = payload.teams ?? [];
    setTeams(nextTeams);
    if (!selectedTeamId && nextTeams.length > 0) {
      setSelectedTeamId(nextTeams[0].team.id);
    }
  }

  async function loadAssignments(teamId: string) {
    const response = await fetch(`/api/teams/${teamId}/assignments`);
    const payload = (await response.json()) as { assignments?: Assignment[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load assignments.");
    }
    setAssignments(payload.assignments ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTeams().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load dashboard.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTeamId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssignments([]);
      return;
    }

    loadAssignments(selectedTeamId).catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load assignments.");
    });
  }, [selectedTeamId]);

  async function joinTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch(`/api/teams/${joinTeamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to join team.");
      return;
    }

    setJoinTeamId("");
    setJoinCode("");
    await loadTeams();
  }

  async function submitAssignment(assignmentId: string) {
    const submissionVideoId = submissionVideoIds[assignmentId];
    if (!submissionVideoId) {
      setError("Provide a submission video id first.");
      return;
    }

    setError(null);
    const response = await fetch(`/api/assignments/${assignmentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionVideoId }),
    });

    const payload = (await response.json()) as SubmissionResponse | { error: string };
    if (!response.ok || "error" in payload) {
      setError("error" in payload ? payload.error : "Failed to submit assignment.");
      return;
    }

    setReviewLinks((current) => ({
      ...current,
      [assignmentId]: payload.reviewPath,
    }));
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/15 soft-panel p-6">
          <h1 className="text-2xl font-bold text-white">Dancer Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">
            Join teams, open weekly assignments, and submit before deadline.
          </p>

          <form className="mt-6 grid gap-3" onSubmit={joinTeam}>
            <input
              value={joinTeamId}
              onChange={(event) => setJoinTeamId(event.target.value)}
              placeholder="Team id"
              className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
            />
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="Join code"
              className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-[#2fa8ff] px-4 py-2 text-sm font-bold text-slate-950"
            >
              Join Team
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {teams.map((item) => (
              <button
                key={item.team.id}
                type="button"
                onClick={() => setSelectedTeamId(item.team.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left ${
                  selectedTeamId === item.team.id
                    ? "border-[#8fd4ff] bg-[#1a2037]"
                    : "border-white/15 bg-[#121527]"
                }`}
              >
                <p className="text-sm font-semibold text-white">{item.team.name}</p>
                <p className="mt-1 text-xs text-slate-300">Role: {item.role}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/15 soft-panel p-6">
          <h2 className="text-xl font-bold text-white">Open Assignments</h2>

          <div className="mt-4 space-y-4">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-xl border border-white/15 bg-[#121527] p-4">
                <p className="text-sm font-semibold text-white">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Due: {new Date(assignment.due_at).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-300">Reference video: {assignment.reference_video_id}</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={submissionVideoIds[assignment.id] ?? ""}
                    onChange={(event) =>
                      setSubmissionVideoIds((current) => ({
                        ...current,
                        [assignment.id]: event.target.value,
                      }))
                    }
                    placeholder="Submission video id"
                    className="w-full rounded-xl border border-white/20 bg-[#171c2f] px-3 py-2 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => submitAssignment(assignment.id)}
                    className="rounded-full bg-[#2fa8ff] px-4 py-2 text-xs font-bold text-slate-950"
                  >
                    Submit
                  </button>
                </div>
                {reviewLinks[assignment.id] ? (
                  <Link
                    href={reviewLinks[assignment.id] ?? "#"}
                    className="mt-3 inline-flex text-xs font-semibold text-[#8fd4ff] underline"
                  >
                    Open review
                  </Link>
                ) : null}
              </article>
            ))}
          </div>

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
