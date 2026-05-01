# MirrorMe

MirrorMe is an AI-assisted dance feedback tool for comparing a dancer's video
against reference choreography. The initial build focuses on a narrow,
end-to-end workflow: upload a reference clip, upload a dancer submission,
extract pose landmarks, compare joint positions, and generate timestamped
feedback.

## Product Direction

The immediate user is a dance captain reviewing weekly submissions. The first
version is intentionally scoped to solve that bottleneck before expanding into
dancer self-serve uploads, team dashboards, live camera feedback, or other
movement domains.

## Weekly Version Plan

1. `v1` Week 6: working upload and comparison flow with pose overlays and a
   timestamped feedback report.
2. `v2` Week 7: stronger alignment logic, improved review UX, and better issue
   categorization.
3. `v3` Week 8: persistence via Supabase plus dashboard views for repeated use.
4. `v4` Week 9: fair-ready polish, stronger visualizations, and selected stretch
   features.

## Proposed Stack

- Next.js App Router
- Tailwind CSS
- Supabase for data and storage
- MediaPipe Pose for landmark extraction
- Vercel for deployment

Clerk and additional multi-user features are intentionally deferred until the
core comparison loop is stable.

## Development

Install dependencies if needed:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Supabase Setup

Create a local `.env.local` file with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANALYSIS_JOB_SECRET=...
```

Current status:

- The app is wired for the public Supabase client.
- The initial database schema lives in `supabase/migrations/`.
- The `compare` flow uploads paired videos, stores records in Supabase, and creates
  an `analysis` review page.
- The review page runs a client-side MediaPipe pose pass, then sends validated
  payloads to a server queue (`analysis_jobs`) for server-side persistence.
- The service role key should live in `.env.local` locally and in Vercel's
  server environment variables for deployment.

## Analysis Job Queue

MirrorMe now supports a queue-backed persistence path:

1. `POST /api/analyses/:id/enqueue` inserts a queued `analysis_jobs` row.
2. `POST /api/internal/analysis-jobs/process-next` claims one queued job and
   persists results to `analyses`, `analysis_frames`, and `analysis_issues`.
   It now accepts `?limit=<n>` to process a small batch in one call.

If `ANALYSIS_JOB_SECRET` is set, workers must provide:

- `x-analysis-job-secret: <ANALYSIS_JOB_SECRET>`

For local development, you can process one queued job manually:

```bash
curl -X POST http://localhost:3000/api/internal/analysis-jobs/process-next
```

Or with a secret:

```bash
curl -X POST \
  -H "x-analysis-job-secret: $ANALYSIS_JOB_SECRET" \
  http://localhost:3000/api/internal/analysis-jobs/process-next
```

Production scheduling:

- `vercel.json` runs `/api/internal/analysis-jobs/process-next?limit=5` every 2 minutes.

## Near-Term Build Priorities

1. Add frame sampling and pose extraction for uploaded videos.
2. Populate `analysis_frames` and `analysis_issues`.
3. Render review overlays and real timestamped feedback.
4. Improve storage and processing ergonomics for repeated use.
