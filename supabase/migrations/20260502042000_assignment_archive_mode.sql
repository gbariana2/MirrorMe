alter table public.assignments
add column if not exists archived_at timestamptz;

create index if not exists assignments_team_archived_idx
on public.assignments(team_id, archived_at, due_at);
