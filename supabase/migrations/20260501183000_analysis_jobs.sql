create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  payload jsonb not null,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists analysis_jobs_status_created_idx
  on public.analysis_jobs(status, created_at);

create index if not exists analysis_jobs_analysis_id_idx
  on public.analysis_jobs(analysis_id);

alter table public.analysis_jobs enable row level security;

drop policy if exists "service role manages analysis jobs" on public.analysis_jobs;
create policy "service role manages analysis jobs"
on public.analysis_jobs
for all
to service_role
using (true)
with check (true);
