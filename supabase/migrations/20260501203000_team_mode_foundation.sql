create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  join_code text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('captain', 'dancer')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  reference_video_id uuid not null references public.videos(id) on delete cascade,
  title text not null,
  instructions text,
  due_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  dancer_user_id text not null,
  submission_video_id uuid not null references public.videos(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (assignment_id, dancer_user_id)
);

create index if not exists team_memberships_user_idx on public.team_memberships(user_id);
create index if not exists assignments_team_due_idx on public.assignments(team_id, due_at);
create index if not exists assignment_submissions_assignment_idx
  on public.assignment_submissions(assignment_id);

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

drop policy if exists "service role manages teams" on public.teams;
create policy "service role manages teams"
on public.teams
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages team memberships" on public.team_memberships;
create policy "service role manages team memberships"
on public.team_memberships
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages assignments" on public.assignments;
create policy "service role manages assignments"
on public.assignments
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages assignment submissions" on public.assignment_submissions;
create policy "service role manages assignment submissions"
on public.assignment_submissions
for all
to service_role
using (true)
with check (true);
