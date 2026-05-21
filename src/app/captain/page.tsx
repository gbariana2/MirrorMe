"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/brand-mark";

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
  display_name?: string | null;
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

function getVideoDurationMsFromUrl(url: string) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.max(0, Math.floor(video.duration * 1000)) : null;
      resolve(duration);
    };
    video.onerror = () => resolve(null);
  });
}

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
  const [isBackfillRunning, setIsBackfillRunning] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [isAdminToolsOpen, setIsAdminToolsOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [seedCount, setSeedCount] = useState(8);
  const [assignmentFilter, setAssignmentFilter] = useState<"active" | "archived" | "all">("active");

  const [teamName, setTeamName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [referenceSource, setReferenceSource] = useState<"upload" | "youtube">("upload");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [assignmentProgress, setAssignmentProgress] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number | null>(null);

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

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function uploadFileToSignedUrl(
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
        setUploadPercent(percent);

        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
        const bytesPerSecond = event.loaded / elapsedSeconds;
        if (bytesPerSecond > 0) {
          const remainingBytes = event.total - event.loaded;
          const rawEtaSeconds = Math.max(0, Math.round(remainingBytes / bytesPerSecond));
          setUploadEtaSeconds((current) =>
            current === null ? rawEtaSeconds : Math.max(0, Math.round(current * 0.7 + rawEtaSeconds * 0.3)),
          );
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
    setMembers(payload?.members ?? []);
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
    setIsCreatingAssignment(true);
    setAssignmentProgress("Validating assignment details...");
    setUploadPercent(null);
    setUploadEtaSeconds(null);
    try {
      setError(null);
      if (!dueDate || !dueTime) {
        setError("Select both a due date and due time.");
        return;
      }
      const dueAt = new Date(`${dueDate}T${dueTime}`).toISOString();
      let referenceVideoId = "";

      if (referenceSource === "upload") {
        if (!referenceFile) {
          setError("Upload a reference video for this assignment.");
          return;
        }
        const referenceDurationMs = await getVideoDurationMs(referenceFile);

        const uploadForm = new FormData();
        if (userId) {
          uploadForm.append("userId", userId);
        }
        uploadForm.append("kind", "reference");
        uploadForm.append("title", `${assignmentTitle} reference`);
        uploadForm.append("video", referenceFile);

        setAssignmentProgress("Uploading reference video...");
        const prepareResponse = await fetchWithTimeout(
          "/api/videos/upload-url",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: userId ?? undefined,
              kind: "reference",
              filename: referenceFile.name,
              mimeType: referenceFile.type,
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
        }>(
          prepareResponse,
        );
        if (
          !prepareResponse.ok
          || !preparePayload?.path
          || !preparePayload.token
          || !preparePayload.bucket
          || !preparePayload.signedUrl
        ) {
          setError(
            formatHttpError(
              prepareResponse,
              "Failed to prepare reference upload.",
              preparePayload?.error,
            ),
          );
          return;
        }

        let uploadPath = preparePayload.path;
        let uploadUrl = preparePayload.signedUrl;
        try {
          await uploadFileToSignedUrl(uploadUrl, referenceFile);
        } catch {
          setAssignmentProgress("Retrying reference upload...");
          const retryPrepareResponse = await fetchWithTimeout(
            "/api/videos/upload-url",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: userId ?? undefined,
                kind: "reference",
                filename: referenceFile.name,
                mimeType: referenceFile.type,
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
            setError(
              formatHttpError(
                retryPrepareResponse,
                "Failed to retry reference upload.",
                retryPreparePayload?.error,
              ),
            );
            return;
          }
          uploadPath = retryPreparePayload.path;
          uploadUrl = retryPreparePayload.signedUrl;
          await uploadFileToSignedUrl(uploadUrl, referenceFile);
        }
        setUploadEtaSeconds(null);

        const finalizeResponse = await fetchWithTimeout(
          "/api/videos/finalize-upload",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: userId ?? undefined,
              kind: "reference",
              title: `${assignmentTitle} reference`,
              path: uploadPath,
              mimeType: referenceFile.type,
              durationMs: referenceDurationMs ?? undefined,
            }),
          },
          30000,
        );
        const finalizePayload = await readJsonSafe<{ videoId?: string; error?: string }>(finalizeResponse);
        if (!finalizeResponse.ok || !finalizePayload?.videoId) {
          setError(
            formatHttpError(
              finalizeResponse,
              "Failed to finalize uploaded reference video.",
              finalizePayload?.error,
            ),
          );
          return;
        }
        setUploadPercent(100);
        setUploadEtaSeconds(null);
        referenceVideoId = finalizePayload.videoId;
      } else {
        if (!youtubeUrl.trim()) {
          setError("Provide a YouTube URL for this assignment.");
          return;
        }

        setAssignmentProgress("Attaching YouTube reference...");
        const youtubeResponse = await fetchWithTimeout("/api/videos/youtube-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId ?? undefined,
            url: youtubeUrl,
            title: `${assignmentTitle} reference`,
          }),
        });
        const youtubePayload = await readJsonSafe<{ videoId?: string; error?: string }>(youtubeResponse);
        if (!youtubeResponse.ok || !youtubePayload?.videoId) {
          setError(formatHttpError(youtubeResponse, "Failed to attach YouTube reference.", youtubePayload?.error));
          return;
        }
        referenceVideoId = youtubePayload.videoId;
      }

      setAssignmentProgress("Creating assignment...");
      setUploadEtaSeconds(null);
      const response = await fetchWithTimeout(`/api/teams/${selectedTeamId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captainUserId: userId ?? undefined,
          title: assignmentTitle,
          referenceVideoId,
          dueAt,
          instructions,
          assigneeUserIds: selectedAssignees,
        }),
      });
      const payload = await readJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        setError(formatHttpError(response, "Failed to create assignment.", payload?.error));
        return;
      }
      setAssignmentTitle("");
      setReferenceFile(null);
      setYoutubeUrl("");
      setDueDate("");
      setDueTime("");
      setInstructions("");
      setSelectedAssignees([]);
      await loadAssignments(selectedTeamId);
      setAssignmentProgress("Assignment created.");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error && (caughtError.name === "AbortError" || caughtError.message.includes("timed out"))
          ? "Request timed out. Try a smaller video or retry."
          : caughtError instanceof Error
            ? caughtError.message
            : "Failed to create assignment.";
      setError(message);
    } finally {
      setIsCreatingAssignment(false);
      setAssignmentProgress(null);
      setUploadPercent(null);
      setUploadEtaSeconds(null);
    }
  }

  async function handleSaveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTeamId) {
      setError("Select a team first.");
      return;
    }

    setError(null);
    const response = await fetch(`/api/teams/${selectedTeamId}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId ?? undefined,
        firstName,
        lastName,
      }),
    });
    const payload = await readJsonSafe<{ error?: string }>(response);
    if (!response.ok) {
      setError(formatHttpError(response, "Failed to save profile name.", payload?.error));
      return;
    }

    await loadMembers(selectedTeamId);
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

  async function runDurationBackfill() {
    if (!userId) {
      setError("Authentication required to run duration backfill.");
      return;
    }
    setIsBackfillRunning(true);
    setBackfillMessage("Loading videos that are missing duration...");
    setError(null);
    try {
      const listResponse = await fetch(`/api/videos/missing-durations?userId=${encodeURIComponent(userId)}`);
      const listPayload = await readJsonSafe<{
        videos?: Array<{ id: string; file_url: string | null; title: string | null }>;
        error?: string;
      }>(listResponse);
      if (!listResponse.ok || !listPayload?.videos) {
        setError(listPayload?.error ?? "Failed to load missing video durations.");
        return;
      }
      const targets = listPayload.videos.filter(
        (video): video is { id: string; file_url: string; title: string | null } =>
          typeof video.file_url === "string" && video.file_url.length > 0,
      );
      if (targets.length === 0) {
        setBackfillMessage("No legacy videos need duration backfill.");
        return;
      }

      let updatedCount = 0;
      for (const target of targets) {
        setBackfillMessage(`Backfilling durations... ${updatedCount}/${targets.length}`);
        const durationMs = await getVideoDurationMsFromUrl(target.file_url);
        if (!durationMs || durationMs <= 0) {
          continue;
        }
        const patchResponse = await fetch(`/api/videos/${target.id}/duration`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, durationMs }),
        });
        if (patchResponse.ok) {
          updatedCount += 1;
        }
      }
      setBackfillMessage(`Duration backfill complete. Updated ${updatedCount} of ${targets.length} videos.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to backfill video durations.");
    } finally {
      setIsBackfillRunning(false);
    }
  }

  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-900 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <section className="rounded-3xl border border-[#e8dccf] soft-panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandMark withWordmark={false} size={34} />
              <h1 className="text-2xl font-bold text-slate-900">Captain Dashboard</h1>
            </div>
            <Link href="/" className="text-sm font-semibold text-[#d64f72] underline">
              Back to home
            </Link>
          </div>
          <p className="mt-2 text-sm text-slate-700">Create teams and publish assignment deadlines.</p>

          <div className="mt-4 rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-700">Admin tools</p>
              <button
                type="button"
                onClick={() => setIsAdminToolsOpen((current) => !current)}
                className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold text-slate-200"
              >
                {isAdminToolsOpen ? "Hide" : "Show"}
              </button>
            </div>

            {isAdminToolsOpen && health ? (
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-2">
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
                  <button
                    type="button"
                    onClick={() => {
                      void runDurationBackfill();
                    }}
                    disabled={isBackfillRunning}
                    className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
                  >
                    {isBackfillRunning ? "Backfilling..." : "Backfill durations"}
                  </button>
                </div>
                {[
                  { label: "Database", value: health.checks.database },
                  { label: "Storage", value: health.checks.storage },
                  { label: "Worker secret", value: health.checks.analysisWorkerSecret },
                ].map((check) => (
                  <div key={check.label} className="rounded-lg border border-white/10 bg-[#171c2f] px-3 py-2">
                    <p className="text-xs font-semibold text-slate-900">
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
                    <p className="mt-1 text-[11px] text-slate-700">{check.value.detail}</p>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500">
                  Last checked: {new Date(health.checkedAt).toLocaleString()}
                </p>
                {bootstrapMessage ? <p className="text-[11px] text-slate-700">{bootstrapMessage}</p> : null}
                {backfillMessage ? <p className="text-[11px] text-slate-700">{backfillMessage}</p> : null}
              </div>
            ) : isAdminToolsOpen ? (
              <p className="mt-2 text-xs text-slate-500">No health data loaded yet.</p>
            ) : null}
          </div>

          <form className="mt-6 grid gap-3" onSubmit={handleCreateTeam}>
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Team name"
              className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-[#ff7f5f] px-4 py-2 text-sm font-bold text-slate-950"
            >
              Create Team
            </button>
          </form>

          <form className="mt-4 grid gap-2 sm:grid-cols-3" onSubmit={handleSaveDisplayName}>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="First name"
              className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-2 text-sm outline-none"
            />
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Last name"
              className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-slate-200"
            >
              Save display name
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
                    : "border-[#e8dccf] bg-[#fffaf5]"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{item.team.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-slate-700">Join code: {item.team.join_code}</p>
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

          <div className="mt-6 rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-700">Test data</p>
            <p className="mt-1 text-xs text-slate-500">
              Add dummy dancers to the selected team for assignment testing.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={seedCount}
                onChange={(event) => setSeedCount(Number(event.target.value))}
                className="w-20 rounded-xl border border-[#decfbe] bg-[#171c2f] px-3 py-2 text-xs outline-none"
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

        <section className="rounded-3xl border border-[#e8dccf] soft-panel p-6">
          <h2 className="text-xl font-bold text-slate-900">Assignments</h2>

          <form className="mt-4 grid gap-3" onSubmit={handleCreateAssignment}>
            <input
              value={assignmentTitle}
              onChange={(event) => setAssignmentTitle(event.target.value)}
              placeholder="Assignment title"
              className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReferenceSource("upload")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  referenceSource === "upload"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-white/25 bg-transparent text-slate-700"
                } cursor-pointer`}
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={() => setReferenceSource("youtube")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  referenceSource === "youtube"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-white/25 bg-transparent text-slate-700"
                } cursor-pointer`}
              >
                YouTube URL
              </button>
            </div>
            {referenceSource === "upload" ? (
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
                className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
              />
            ) : (
              <input
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
              />
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Due date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="captain-datetime rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Due time</span>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                  className="captain-datetime rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional instructions"
              className="min-h-24 rounded-xl border border-[#decfbe] bg-[#fffaf5] px-4 py-3 text-sm outline-none"
            />
            <div className="rounded-xl border border-[#decfbe] bg-[#fffaf5] p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-700">Assign team members</p>
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
                    <span>
                      {member.display_name?.trim() ? member.display_name : member.user_id}{" "}
                      <span className="text-slate-500">({member.role})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={isCreatingAssignment}
              className="cursor-pointer rounded-full bg-[#ff7f5f] px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingAssignment ? "Creating..." : "Create Assignment"}
            </button>
            {assignmentProgress ? <p className="text-xs text-slate-700">{assignmentProgress}</p> : null}
            {uploadPercent !== null ? (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-[#1d233a]">
                  <div
                    className="h-full bg-[#ff7f5f] transition-all"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
                <p className="text-xs text-slate-700">
                  Upload {uploadPercent}%
                  {assignmentProgress?.startsWith("Uploading") && uploadEtaSeconds !== null
                    ? ` • ~${uploadEtaSeconds}s remaining`
                    : ""}
                </p>
              </div>
            ) : null}
          </form>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssignmentFilter("active")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentFilter === "active"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-white/25 text-slate-700"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setAssignmentFilter("archived")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentFilter === "archived"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-white/25 text-slate-700"
                }`}
              >
                Archived
              </button>
              <button
                type="button"
                onClick={() => setAssignmentFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  assignmentFilter === "all"
                    ? "bg-[#ff7f5f] text-slate-950"
                    : "border border-white/25 text-slate-700"
                }`}
              >
                All
              </button>
            </div>

            {filteredAssignments.map((assignment) => (
              <article key={assignment.id} className="rounded-xl border border-[#e8dccf] bg-[#fffaf5] p-4">
                <p className="text-sm font-semibold text-slate-900">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-700">
                  Due: {new Date(assignment.due_at).toLocaleString()}
                </p>
                {assignment.archived_at ? (
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    Archived: {new Date(assignment.archived_at).toLocaleString()}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-700">Reference video: {assignment.reference_video_id}</p>
                {typeof assignment.assignee_count === "number" ? (
                  <p className="mt-1 text-xs text-slate-700">Assignees: {assignment.assignee_count}</p>
                ) : null}
                <Link
                  href={`/captain/assignments/${assignment.id}`}
                  className="mt-2 inline-flex text-xs font-semibold text-[#d64f72] underline"
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
