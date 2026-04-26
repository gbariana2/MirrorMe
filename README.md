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

## Near-Term Build Priorities

1. Define the upload and review data model.
2. Add the first comparison pipeline with sample data and placeholder outputs.
3. Integrate MediaPipe pose extraction.
4. Persist reference videos, submissions, and reports.
