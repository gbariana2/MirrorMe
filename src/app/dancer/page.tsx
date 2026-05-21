"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";

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

function getVideoDurationMs(file: File) {
  return new Promise<number | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = objectUrl;
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.max(0, Math.floor(video.duration * 1000)) : null;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

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
  const [uploadPercent, setUploadPercent] = useState<Record<string, number | null>>({});
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<Record<string, number | null>>({});
  const [assignmentMode, setAssignmentMode] = useState<"dancer" | "captain">("dancer");
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

  function uploadFileToSignedUrl(
    assignmentId: string,
    signedUrl: string,
    file: File,
    timeoutMs = 180000,
  ) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const startedAt = Date.now();
      const timer = setTimeout(() => {
        request.abort();
        reject(new Error("Upload timed out."));
      }, timeoutMs);

      request.open("PUT", signedUrl);
      request.setRequestHeader("x-upsert", "false");
      request.setRequestHeader("Content-Type", file.type);
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }
        const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        setUploadPercent((current) => ({ ...current, [assignmentId]: percent }));
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
        const bytesPerSecond = event.loaded / elapsedSeconds;
        if (bytesPerSecond > 0) {
          const remainingBytes = event.total - event.loaded;
          const rawEtaSeconds = Math.max(0, Math.round(remainingBytes / bytesPerSecond));
          setUploadEtaSeconds((current) => ({
            ...current,
            [assignmentId]:
              current[assignmentId] === null || current[assignmentId] === undefined
                ? rawEtaSeconds
                : Math.max(0, Math.round((current[assignmentId] as number) * 0.7 + rawEtaSeconds * 0.3)),
          }));
        }
      };

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
    const joiner = query ? "&" : "?";
    const response = await fetch(`/api/teams/${teamId}/assignments${query}${joiner}asRole=${assignmentMode}`);
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
  }, [selectedTeamId, assignmentMode]);

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
    setUploadPercent((current) => ({ ...current, [assignmentId]: null }));
    setUploadEtaSeconds((current) => ({ ...current, [assignmentId]: null }));
    try {
      setError(null);
      const submissionDurationMs = await getVideoDurationMs(submissionFile);

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

      let uploadPath = preparePayload.path;
      let uploadUrl = preparePayload.signedUrl;
      setSubmitProgress((current) => ({ ...current, [assignmentId]: "Uploading submission..." }));
      try {
        await uploadFileToSignedUrl(assignmentId, uploadUrl, submissionFile);
      } catch {
        setSubmitProgress((current) => ({ ...current, [assignmentId]: "Retrying submission upload..." }));
        const retryPrepareResponse = await fetchWithTimeout(
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
        const retryPreparePayload = await readJsonSafe<{
          path?: string;
          signedUrl?: string;
          error?: string;
        }>(retryPrepareResponse);
        if (!retryPrepareResponse.ok || !retryPreparePayload?.path || !retryPreparePayload.signedUrl) {
          setError(retryPreparePayload?.error ?? "Failed to retry submission upload.");
          return;
        }
        uploadPath = retryPreparePayload.path;
        uploadUrl = retryPreparePayload.signedUrl;
        await uploadFileToSignedUrl(assignmentId, uploadUrl, submissionFile);
      }
      setUploadPercent((current) => ({ ...current, [assignmentId]: 100 }));
      setUploadEtaSeconds((current) => ({ ...current, [assignmentId]: null }));

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
            path: uploadPath,
            mimeType: submissionFile.type,
            durationMs: submissionDurationMs ?? undefined,
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
      setUploadEtaSeconds((current) => ({ ...current, [assignmentId]: null }));
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
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-900 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <section className="rounded-3xl border border-[#e8dccf] soft-panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandMark withWordmark={false} size={34} />
              <h1 className="text-2xl font-bold text-slate-900">Dancer Dashboard</h1>
            </div>
            <Link href="/" className="text-sm font-semibold text-[#d64f72] underline">
              Back to home
            </Link>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            Join teams, open weekly assignments, and submit before deadline.
          </p>
          {teams.some((team) => team.role === "captain") ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAssignmentMode("dancer")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentMode === "dancer"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-[#decfbe] bg-[#fffaf5] text-slate-700"
                }`}
              >
                My assigned work
              </button>
              <button
                type="button"
                onClick={() => setAssignmentMode("captain")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentMode === "captain"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-[#decfbe] bg-[#fffaf5] text-slate-700"
                }`}
              >
                Captain team view
              </button>
            </div>
          ) : null}

          <form className="mt-6 grid gap-3" onSubmit={joinTeam}>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Paste team join code (example: AB12CD)"
              className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-[#ff7f5f] px-4 py-2 text-sm font-bold text-slate-950"
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
                    ? "border-[#8fd4ff] bg-[#fff1e7]"
                    : "border-[#e8dccf] bg-[#fffaf5]"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{item.team.name}</p>
                <p className="mt-1 text-xs text-slate-700">Role: {item.role}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-[#e8dccf] soft-panel p-6">
          <h2 className="text-xl font-bold text-slate-900">Open Assignments</h2>

          <div className="mt-4 space-y-4">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
                <p className="text-sm font-semibold text-slate-900">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-700">
                  Due: {new Date(assignment.due_at).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-700">Reference video: {assignment.reference_video_id}</p>
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
                    className="w-full rounded-xl border border-[#decfbe] bg-[#fffaf5] px-3 py-2 text-xs text-slate-700 outline-none file:mr-2 file:rounded-full file:border-0 file:bg-[#ff7f5f] file:px-2 file:py-1 file:font-semibold file:text-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => submitAssignment(assignment.id)}
                    disabled={isSubmitting[assignment.id] || !submissionFiles[assignment.id]}
                    className="rounded-full bg-[#ff7f5f] px-4 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting[assignment.id] ? "Submitting..." : "Submit"}
                  </button>
                </div>
                {submitProgress[assignment.id] ? (
                  <p className="mt-2 text-xs text-slate-700">{submitProgress[assignment.id]}</p>
                ) : null}
                {uploadPercent[assignment.id] !== null && uploadPercent[assignment.id] !== undefined ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-[#1d233a]">
                      <div
                        className="h-full bg-[#ff7f5f] transition-all"
                        style={{ width: `${uploadPercent[assignment.id] ?? 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-700">
                      Upload {uploadPercent[assignment.id]}%
                      {submitProgress[assignment.id]?.startsWith("Uploading")
                      && uploadEtaSeconds[assignment.id] !== null
                      && uploadEtaSeconds[assignment.id] !== undefined
                        ? ` • ~${uploadEtaSeconds[assignment.id]}s remaining`
                        : ""}
                    </p>
                  </div>
                ) : null}
                {reviewLinks[assignment.id] ? (
                  <Link
                    href={reviewLinks[assignment.id] ?? "#"}
                    className="mt-3 inline-flex text-xs font-semibold text-[#d64f72] underline"
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
        <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-900 sm:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-6xl rounded-3xl border border-[#e8dccf] soft-panel p-6">
            <p className="text-sm text-slate-700">Loading dancer dashboard...</p>
          </div>
        </main>
      }
    >
      <DancerDashboard />
    </Suspense>
  );
}
