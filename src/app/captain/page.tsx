"use client";

import { useAuth } from "@clerk/nextjs";
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
  const { userId } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seedCount, setSeedCount] = useState(8);

  const [teamName, setTeamName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [referenceSource, setReferenceSource] = useState<"upload" | "youtube">("upload");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const captainTeams = useMemo(() => teams.filter((item) => item.role === "captain"), [teams]);

  async function readJsonSafe<T>(response: Response) {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  function formatHttpError(response: Response, fallback: string, apiError?: string) {
    if (apiError) {
      return apiError;
    }
    if (response.status === 401) {
      return "Not authenticated. Please sign in again.";
    }

    return `${fallback} (HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ""})`;
  }

  async function loadTeams() {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const response = await fetch(`/api/teams${query}`);
    const payload = await readJsonSafe<{ teams?: TeamRow[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(formatHttpError(response, "Failed to load teams.", payload?.error));
    }
    const nextTeams = payload?.teams ?? [];
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
    const payload = await readJsonSafe<{ assignments?: Assignment[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(formatHttpError(response, "Failed to load assignments.", payload?.error));
    }
    setAssignments(payload?.assignments ?? []);
  }

  async function loadMembers(teamId: string) {
    const response = await fetch(`/api/teams/${teamId}/members`);
    const payload = await readJsonSafe<{ members?: TeamMember[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(formatHttpError(response, "Failed to load members.", payload?.error));
    }
    const dancers = (payload?.members ?? []).filter((member) => member.role === "dancer");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName, captainUserId: userId ?? undefined }),
      });
      const payload = await readJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        setError(formatHttpError(response, "Failed to create team.", payload?.error));
        return;
      }
      setTeamName("");
      await loadTeams();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create team.");
    }
  }

  async function handleSeedDancers() {
    if (!selectedTeamId) {
      setError("Select a captain team first.");
      return;
    }

    setError(null);
    const response = await fetch(`/api/teams/${selectedTeamId}/seed-dancers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: seedCount, userId: userId ?? undefined }),
    });
    const payload = await readJsonSafe<{ error?: string }>(response);
    if (!response.ok) {
      setError(formatHttpError(response, "Failed to seed dancers.", payload?.error));
      return;
    }

    await loadMembers(selectedTeamId);
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

          <div className="mt-6 rounded-xl border border-white/15 bg-[#121527] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Test data</p>
            <p className="mt-1 text-xs text-slate-400">
              Add dummy dancers to the selected team for assignment testing.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={seedCount}
                onChange={(event) => setSeedCount(Number(event.target.value))}
                className="w-20 rounded-xl border border-white/20 bg-[#171c2f] px-3 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={handleSeedDancers}
                className="rounded-full border border-white/25 px-3 py-2 text-xs font-semibold text-slate-200"
              >
                Add dummy dancers
              </button>
            </div>
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
