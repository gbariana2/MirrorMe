"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

function DancerDashboard() {
  const { userId } = useAuth();
  const searchParams = useSearchParams();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [submissionFiles, setSubmissionFiles] = useState<Record<string, File | null>>({});
  const [reviewLinks, setReviewLinks] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<Record<string, boolean>>({});
  const [submitProgress, setSubmitProgress] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function readJsonSafe<T>(response: Response) {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function uploadFileToSignedUrl(signedUrl: string, file: File, timeoutMs = 180000) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const timer = setTimeout(() => {
        request.abort();
        reject(new Error("Upload timed out."));
      }, timeoutMs);

      request.open("PUT", signedUrl);
      request.setRequestHeader("x-upsert", "false");
      request.setRequestHeader("Content-Type", file.type);

      request.onload = () => {
        clearTimeout(timer);
        if (request.status >= 200 && request.status < 300) {
          resolve();
          return;
        }
        reject(new Error(`Storage upload failed (HTTP ${request.status}).`));
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Storage upload failed."));
      };
      request.onabort = () => {
        clearTimeout(timer);
        reject(new Error("Upload was aborted."));
      };

      request.send(file);
    });
  }

  async function loadTeams() {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const response = await fetch(`/api/teams${query}`);
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
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const response = await fetch(`/api/teams/${teamId}/assignments${query}`);
    const payload = (await response.json()) as { assignments?: Assignment[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load assignments.");
    }
    setAssignments(payload.assignments ?? []);
  }

  useEffect(() => {
    const code = searchParams.get("code");
    if (code && code.trim().length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJoinCode(code.trim().toUpperCase());
    }
  }, [searchParams]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  async function joinTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/teams/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode, userId: userId ?? undefined }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to join team.");
      return;
    }

    setJoinCode("");
    await loadTeams();
  }

  async function submitAssignment(assignmentId: string) {
    const submissionFile = submissionFiles[assignmentId];
    if (!submissionFile) {
      setError("Upload a submission video first.");
      return;
    }

    setIsSubmitting((current) => ({ ...current, [assignmentId]: true }));
    setSubmitProgress((current) => ({ ...current, [assignmentId]: "Preparing upload..." }));
    try {
      setError(null);

      const prepareResponse = await fetchWithTimeout(
        "/api/videos/upload-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId ?? undefined,
            kind: "submission",
            filename: submissionFile.name,
            mimeType: submissionFile.type,
          }),
        },
        30000,
      );
      const preparePayload = await readJsonSafe<{
        bucket?: string;
        path?: string;
        token?: string;
        signedUrl?: string;
        error?: string;
      }>(prepareResponse);

      if (!prepareResponse.ok || !preparePayload?.path || !preparePayload.signedUrl) {
        setError(preparePayload?.error ?? "Failed to prepare submission upload.");
        return;
      }

      setSubmitProgress((current) => ({ ...current, [assignmentId]: "Uploading submission..." }));
      await uploadFileToSignedUrl(preparePayload.signedUrl, submissionFile);

      setSubmitProgress((current) => ({ ...current, [assignmentId]: "Finalizing upload..." }));
      const finalizeResponse = await fetchWithTimeout(
        "/api/videos/finalize-upload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId ?? undefined,
            kind: "submission",
            title: `Assignment ${assignmentId} submission`,
            path: preparePayload.path,
            mimeType: submissionFile.type,
          }),
        },
        30000,
      );
      const finalizePayload = await readJsonSafe<{ videoId?: string; error?: string }>(finalizeResponse);
      if (!finalizeResponse.ok || !finalizePayload?.videoId) {
        setError(finalizePayload?.error ?? "Failed to finalize submission upload.");
        return;
      }

      setSubmitProgress((current) => ({ ...current, [assignmentId]: "Submitting for analysis..." }));
      const response = await fetchWithTimeout(
        `/api/assignments/${assignmentId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dancerUserId: userId ?? undefined,
            submissionVideoId: finalizePayload.videoId,
          }),
        },
        45000,
      );

      const payload = await readJsonSafe<SubmissionResponse | { error: string }>(response);
      if (!response.ok || !payload || "error" in payload) {
        setError(payload && "error" in payload ? payload.error : "Failed to submit assignment.");
        return;
      }

      setReviewLinks((current) => ({
        ...current,
        [assignmentId]: payload.reviewPath,
      }));
      setSubmitProgress((current) => ({ ...current, [assignmentId]: "Submitted." }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to submit assignment.");
    } finally {
      setIsSubmitting((current) => ({ ...current, [assignmentId]: false }));
    }
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
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Paste team join code (example: AB12CD)"
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
                    type="file"
                    accept="video/*"
                    onChange={(event) =>
                      setSubmissionFiles((current) => ({
                        ...current,
                        [assignment.id]: event.target.files?.[0] ?? null,
                      }))
                    }
                    className="w-full rounded-xl border border-white/20 bg-[#171c2f] px-3 py-2 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => submitAssignment(assignment.id)}
                    disabled={isSubmitting[assignment.id] || !submissionFiles[assignment.id]}
                    className="rounded-full bg-[#2fa8ff] px-4 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting[assignment.id] ? "Submitting..." : "Submit"}
                  </button>
                </div>
                {submitProgress[assignment.id] ? (
                  <p className="mt-2 text-xs text-slate-300">{submitProgress[assignment.id]}</p>
                ) : null}
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

export default function DancerPage() {
  return (
    <Suspense
      fallback={
        <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-6xl rounded-3xl border border-white/15 soft-panel p-6">
            <p className="text-sm text-slate-300">Loading dancer dashboard...</p>
          </div>
        </main>
      }
    >
      <DancerDashboard />
    </Suspense>
  );
}
