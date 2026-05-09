alter table public.team_memberships
add column if not exists display_name text;

create index if not exists team_memberships_team_display_idx
on public.team_memberships(team_id, display_name);
