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
  archived_at?: string | null;
  assignee_count?: number;
};

type TeamMember = {
  user_id: string;
  role: "captain" | "dancer";
  created_at: string;
};

type HealthResponse = {
  ok: boolean;
  checks: {
    database: { ok: boolean; severity: "ok" | "warning" | "error"; detail: string };
    storage: { ok: boolean; severity: "ok" | "warning" | "error"; detail: string };
    analysisWorkerSecret: { ok: boolean; severity: "ok" | "warning" | "error"; detail: string };
  };
  checkedAt: string;
};

type BootstrapResponse = {
  ok: boolean;
  tableChecks: Array<{ table: string; ok: boolean; detail: string }>;
  storage: { ok: boolean; detail: string };
  nextSteps: string[];
  checkedAt: string;
  error?: string;
};

export default function CaptainPage() {
  const { userId } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [isBootstrapRunning, setIsBootstrapRunning] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [seedCount, setSeedCount] = useState(8);
  const [assignmentFilter, setAssignmentFilter] = useState<"active" | "archived" | "all">("active");

  const [teamName, setTeamName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [referenceSource, setReferenceSource] = useState<"upload" | "youtube">("upload");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const captainTeams = useMemo(() => teams.filter((item) => item.role === "captain"), [teams]);
  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === "all") {
      return assignments;
    }
    if (assignmentFilter === "archived") {
      return assignments.filter((assignment) => Boolean(assignment.archived_at));
    }
    return assignments.filter((assignment) => !assignment.archived_at);
  }, [assignmentFilter, assignments]);

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
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const joiner = query ? "&" : "?";
    const response = await fetch(`/api/teams/${teamId}/assignments${query}${joiner}includeArchived=1`);
    const payload = await readJsonSafe<{ assignments?: Assignment[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(formatHttpError(response, "Failed to load assignments.", payload?.error));
    }
    setAssignments(payload?.assignments ?? []);
  }

  async function loadMembers(teamId: string) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const response = await fetch(`/api/teams/${teamId}/members${query}`);
    const payload = await readJsonSafe<{ members?: TeamMember[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(formatHttpError(response, "Failed to load members.", payload?.error));
    }
    const dancers = (payload?.members ?? []).filter((member) => member.role === "dancer");
    setMembers(dancers);
  }

  async function loadHealth() {
    setIsHealthLoading(true);
    try {
      const response = await fetch("/api/system/health");
      const payload = await readJsonSafe<HealthResponse & { error?: string }>(response);
      if (!response.ok || !payload?.checks) {
        throw new Error(payload?.error ?? "Failed to load system health.");
      }
      setHealth(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load system health.");
    } finally {
      setIsHealthLoading(false);
    }
  }

  async function runSetupFix() {
    setIsBootstrapRunning(true);
    setBootstrapMessage(null);
    try {
      const response = await fetch("/api/system/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId ?? undefined }),
      });
      const payload = await readJsonSafe<BootstrapResponse>(response);
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to run setup fix.");
      }

      if (payload.ok) {
        setBootstrapMessage("Setup fix completed. System should be healthy after refresh.");
      } else {
        const nextStep = payload.nextSteps[0] ?? "Run Supabase migrations and refresh health.";
        setBootstrapMessage(`Setup fix completed with follow-up required: ${nextStep}`);
      }

      await loadHealth();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to run setup fix.");
    } finally {
      setIsBootstrapRunning(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTeams().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load dashboard.");
    });
    loadHealth().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load system health.");
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

  async function copyJoinCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      const key = `code:${code}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      setError("Failed to copy join code. You can still copy it manually.");
    }
  }

  async function copyInviteLink(code: string) {
    try {
      const inviteLink = `${window.location.origin}/dancer?code=${encodeURIComponent(code)}`;
      await navigator.clipboard.writeText(inviteLink);
      const key = `invite:${code}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      setError("Failed to copy invite link. You can still share the join code manually.");
    }
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/15 soft-panel p-6">
          <h1 className="text-2xl font-bold text-white">Captain Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">Create teams and publish assignment deadlines.</p>

          <div className="mt-4 rounded-xl border border-white/15 bg-[#121527] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-300">System health</p>
              <button
                type="button"
                onClick={() => {
                  void loadHealth();
                }}
                disabled={isHealthLoading}
                className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
              >
                {isHealthLoading ? "Checking..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void runSetupFix();
                }}
                disabled={isBootstrapRunning}
                className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
              >
                {isBootstrapRunning ? "Running setup..." : "Run setup fix"}
              </button>
            </div>
            {health ? (
              <div className="mt-3 grid gap-2">
                {[
                  { label: "Database", value: health.checks.database },
                  { label: "Storage", value: health.checks.storage },
                  { label: "Worker secret", value: health.checks.analysisWorkerSecret },
                ].map((check) => (
                  <div key={check.label} className="rounded-lg border border-white/10 bg-[#171c2f] px-3 py-2">
                    <p className="text-xs font-semibold text-white">
                      {check.label}{" "}
                      <span
                        className={
                          check.value.severity === "ok"
                            ? "text-emerald-300"
                            : check.value.severity === "warning"
                              ? "text-amber-300"
                              : "text-rose-300"
                        }
                      >
                        {check.value.severity === "ok"
                          ? "OK"
                          : check.value.severity === "warning"
                            ? "Warning"
                            : "Issue"}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-300">{check.value.detail}</p>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  Last checked: {new Date(health.checkedAt).toLocaleString()}
                </p>
                {bootstrapMessage ? <p className="text-[11px] text-slate-300">{bootstrapMessage}</p> : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No health data loaded yet.</p>
            )}
          </div>

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
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-slate-300">Join code: {item.team.join_code}</p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyJoinCode(item.team.join_code);
                    }}
                    className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-semibold text-slate-200"
                  >
                    {copiedKey === `code:${item.team.join_code}` ? "Copied" : "Copy code"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyInviteLink(item.team.join_code);
                    }}
                    className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-semibold text-slate-200"
                  >
                    {copiedKey === `invite:${item.team.join_code}` ? "Copied" : "Copy invite link"}
                  </button>
                </div>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssignmentFilter("active")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentFilter === "active"
                    ? "bg-[#2fa8ff] text-slate-950"
                    : "border border-white/25 text-slate-300"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setAssignmentFilter("archived")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentFilter === "archived"
                    ? "bg-[#2fa8ff] text-slate-950"
                    : "border border-white/25 text-slate-300"
                }`}
              >
                Archived
              </button>
              <button
                type="button"
                onClick={() => setAssignmentFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentFilter === "all"
                    ? "bg-[#2fa8ff] text-slate-950"
                    : "border border-white/25 text-slate-300"
                }`}
              >
                All
              </button>
            </div>

            {filteredAssignments.map((assignment) => (
              <article key={assignment.id} className="rounded-xl border border-white/15 bg-[#121527] p-4">
                <p className="text-sm font-semibold text-white">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Due: {new Date(assignment.due_at).toLocaleString()}
                </p>
                {assignment.archived_at ? (
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    Archived: {new Date(assignment.archived_at).toLocaleString()}
                  </p>
                ) : null}
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
