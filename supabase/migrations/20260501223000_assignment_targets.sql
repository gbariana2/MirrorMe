create table if not exists public.assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  dancer_user_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (assignment_id, dancer_user_id)
);

create index if not exists assignment_targets_assignment_idx
  on public.assignment_targets(assignment_id);

create index if not exists assignment_targets_dancer_idx
  on public.assignment_targets(dancer_user_id);

alter table public.assignment_targets enable row level security;

drop policy if exists "service role manages assignment targets" on public.assignment_targets;
create policy "service role manages assignment targets"
on public.assignment_targets
for all
to service_role
using (true)
with check (true);
