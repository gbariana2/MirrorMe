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
```

Current status:

- The app is wired for the public Supabase client.
- The initial database schema lives in `supabase/migrations/`.
- The `compare` flow uploads paired videos, stores records in Supabase, and creates
  an `analysis` review page.
- The review page can now run a client-side MediaPipe pose pass, store sampled
  frames and issues, and update the analysis score and summary.
- The service role key should live in `.env.local` locally and in Vercel's
  server environment variables for deployment.

## Near-Term Build Priorities

1. Add frame sampling and pose extraction for uploaded videos.
2. Populate `analysis_frames` and `analysis_issues`.
3. Render review overlays and real timestamped feedback.
4. Improve storage and processing ergonomics for repeated use.
