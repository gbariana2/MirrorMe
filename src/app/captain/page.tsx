"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TeamRow = {
  role: "captain" | "dancer";
  team: {
    id: string;
    name: string;
    join_code: string;
    created_at: string;
  };
};

type Assignment = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string;
  reference_video_id: string;
  created_at: string;
  assignee_count?: number;
};

type TeamMember = {
  user_id: string;
  role: "captain" | "dancer";
  created_at: string;
};

export default function CaptainPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [teamName, setTeamName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [referenceSource, setReferenceSource] = useState<"upload" | "youtube">("upload");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const captainTeams = useMemo(() => teams.filter((item) => item.role === "captain"), [teams]);

  async function loadTeams() {
    const response = await fetch("/api/teams");
    const payload = (await response.json()) as { teams?: TeamRow[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load teams.");
    }
    const nextTeams = payload.teams ?? [];
    setTeams(nextTeams);
    if (!selectedTeamId && nextTeams.length > 0) {
      const firstCaptainTeam = nextTeams.find((item) => item.role === "captain");
      if (firstCaptainTeam) {
        setSelectedTeamId(firstCaptainTeam.team.id);
      }
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

  async function loadMembers(teamId: string) {
    const response = await fetch(`/api/teams/${teamId}/members`);
    const payload = (await response.json()) as { members?: TeamMember[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load members.");
    }
    const dancers = (payload.members ?? []).filter((member) => member.role === "dancer");
    setMembers(dancers);
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
    loadMembers(selectedTeamId).catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load members.");
    });
  }, [selectedTeamId]);

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to create team.");
      return;
    }
    setTeamName("");
    await loadTeams();
  }

  async function handleCreateAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTeamId) {
      setError("Select a captain team first.");
      return;
    }
    setError(null);
    let referenceVideoId = "";

    if (referenceSource === "upload") {
      if (!referenceFile) {
        setError("Upload a reference video for this assignment.");
        return;
      }

      const uploadForm = new FormData();
      uploadForm.append("kind", "reference");
      uploadForm.append("title", `${assignmentTitle} reference`);
      uploadForm.append("video", referenceFile);

      const uploadResponse = await fetch("/api/videos/upload", {
        method: "POST",
        body: uploadForm,
      });
      const uploadPayload = (await uploadResponse.json()) as { videoId?: string; error?: string };
      if (!uploadResponse.ok || !uploadPayload.videoId) {
        setError(uploadPayload.error ?? "Failed to upload reference video.");
        return;
      }
      referenceVideoId = uploadPayload.videoId;
    } else {
      if (!youtubeUrl.trim()) {
        setError("Provide a YouTube URL for this assignment.");
        return;
      }

      const youtubeResponse = await fetch("/api/videos/youtube-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          title: `${assignmentTitle} reference`,
        }),
      });
      const youtubePayload = (await youtubeResponse.json()) as { videoId?: string; error?: string };
      if (!youtubeResponse.ok || !youtubePayload.videoId) {
        setError(youtubePayload.error ?? "Failed to attach YouTube reference.");
        return;
      }
      referenceVideoId = youtubePayload.videoId;
    }

    const response = await fetch(`/api/teams/${selectedTeamId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: assignmentTitle,
        referenceVideoId,
        dueAt,
        instructions,
        assigneeUserIds: selectedAssignees,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to create assignment.");
      return;
    }
    setAssignmentTitle("");
    setReferenceFile(null);
    setYoutubeUrl("");
    setDueAt("");
    setInstructions("");
    setSelectedAssignees([]);
    await loadAssignments(selectedTeamId);
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/15 soft-panel p-6">
          <h1 className="text-2xl font-bold text-white">Captain Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">Create teams and publish assignment deadlines.</p>

          <form className="mt-6 grid gap-3" onSubmit={handleCreateTeam}>
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Team name"
              className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-[#2fa8ff] px-4 py-2 text-sm font-bold text-slate-950"
            >
              Create Team
            </button>
          </form>

          <div className="mt-6 grid gap-3">
            {captainTeams.map((item) => (
              <button
                key={item.team.id}
                type="button"
                onClick={() => setSelectedTeamId(item.team.id)}
                className={`rounded-xl border px-4 py-3 text-left ${
                  selectedTeamId === item.team.id
                    ? "border-[#8fd4ff] bg-[#1a2037]"
                    : "border-white/15 bg-[#121527]"
                }`}
              >
                <p className="text-sm font-semibold text-white">{item.team.name}</p>
                <p className="mt-1 text-xs text-slate-300">Join code: {item.team.join_code}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/15 soft-panel p-6">
          <h2 className="text-xl font-bold text-white">Assignments</h2>

          <form className="mt-4 grid gap-3" onSubmit={handleCreateAssignment}>
            <input
              value={assignmentTitle}
              onChange={(event) => setAssignmentTitle(event.target.value)}
              placeholder="Assignment title"
              className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReferenceSource("upload")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  referenceSource === "upload"
                    ? "bg-[#2fa8ff] text-slate-950"
                    : "border border-white/25 bg-transparent text-slate-300"
                }`}
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={() => setReferenceSource("youtube")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  referenceSource === "youtube"
                    ? "bg-[#2fa8ff] text-slate-950"
                    : "border border-white/25 bg-transparent text-slate-300"
                }`}
              >
                YouTube URL
              </button>
            </div>
            {referenceSource === "upload" ? (
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
                className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
              />
            ) : (
              <input
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
              />
            )}
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
            />
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional instructions"
              className="min-h-24 rounded-xl border border-white/20 bg-[#121527] px-4 py-3 text-sm outline-none"
            />
            <div className="rounded-xl border border-white/20 bg-[#121527] p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-300">Assign dancers</p>
              <div className="grid gap-2">
                {members.map((member) => (
                  <label key={member.user_id} className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedAssignees.includes(member.user_id)}
                      onChange={(event) => {
                        setSelectedAssignees((current) =>
                          event.target.checked
                            ? [...current, member.user_id]
                            : current.filter((value) => value !== member.user_id),
                        );
                      }}
                    />
                    <span>{member.user_id}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="rounded-full bg-[#2fa8ff] px-4 py-2 text-sm font-bold text-slate-950"
            >
              Create Assignment
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-xl border border-white/15 bg-[#121527] p-4">
                <p className="text-sm font-semibold text-white">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Due: {new Date(assignment.due_at).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-300">Reference video: {assignment.reference_video_id}</p>
                {typeof assignment.assignee_count === "number" ? (
                  <p className="mt-1 text-xs text-slate-300">Assignees: {assignment.assignee_count}</p>
                ) : null}
                <Link
                  href={`/captain/assignments/${assignment.id}`}
                  className="mt-2 inline-flex text-xs font-semibold text-[#8fd4ff] underline"
                >
                  View assignee status
                </Link>
              </article>
            ))}
          </div>

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
