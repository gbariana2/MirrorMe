create extension if not exists "pgcrypto";

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reference', 'submission')),
  title text not null,
  file_path text not null unique,
  file_url text,
  mime_type text,
  duration_ms integer,
  uploaded_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  reference_video_id uuid not null references public.videos(id) on delete cascade,
  submission_video_id uuid not null references public.videos(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  overall_score numeric(5,2),
  summary text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table if not exists public.analysis_frames (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  timestamp_ms integer not null,
  reference_landmarks jsonb not null default '[]'::jsonb,
  submission_landmarks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, timestamp_ms)
);

create table if not exists public.analysis_issues (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  timestamp_ms integer not null,
  joint_name text not null,
  severity text not null check (severity in ('minor', 'major')),
  expected_angle numeric(6,2) not null,
  actual_angle numeric(6,2) not null,
  delta numeric(6,2) not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists videos_kind_idx on public.videos(kind);
create index if not exists analyses_status_idx on public.analyses(status);
create index if not exists analysis_frames_analysis_id_idx on public.analysis_frames(analysis_id);
create index if not exists analysis_issues_analysis_id_idx on public.analysis_issues(analysis_id);

alter table public.videos enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_frames enable row level security;
alter table public.analysis_issues enable row level security;

drop policy if exists "public read videos" on public.videos;
create policy "public read videos"
on public.videos
for select
to anon, authenticated
using (true);

drop policy if exists "service role manages videos" on public.videos;
create policy "service role manages videos"
on public.videos
for all
to service_role
using (true)
with check (true);

drop policy if exists "public read analyses" on public.analyses;
create policy "public read analyses"
on public.analyses
for select
to anon, authenticated
using (true);

drop policy if exists "service role manages analyses" on public.analyses;
create policy "service role manages analyses"
on public.analyses
for all
to service_role
using (true)
with check (true);

drop policy if exists "public read analysis frames" on public.analysis_frames;
create policy "public read analysis frames"
on public.analysis_frames
for select
to anon, authenticated
using (true);

drop policy if exists "service role manages analysis frames" on public.analysis_frames;
create policy "service role manages analysis frames"
on public.analysis_frames
for all
to service_role
using (true)
with check (true);

drop policy if exists "public read analysis issues" on public.analysis_issues;
create policy "public read analysis issues"
on public.analysis_issues
for select
to anon, authenticated
using (true);

drop policy if exists "service role manages analysis issues" on public.analysis_issues;
create policy "service role manages analysis issues"
on public.analysis_issues
for all
to service_role
using (true)
with check (true);
