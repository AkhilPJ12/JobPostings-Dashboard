-- Track when content became inactive independently of later source sightings.
alter table public.jobs add column if not exists inactive_since_at timestamptz;

update public.jobs set inactive_since_at = coalesce(updated_at, created_at, now())
where not is_active and inactive_since_at is null;

create or replace function public.set_job_inactive_since() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active then
    new.inactive_since_at := null;
  elsif tg_op = 'INSERT' then
    new.inactive_since_at := coalesce(new.inactive_since_at, now());
  elsif old.is_active then
    new.inactive_since_at := now();
  else
    new.inactive_since_at := coalesce(old.inactive_since_at, new.inactive_since_at, now());
  end if;
  return new;
end $$;
revoke all on function public.set_job_inactive_since() from public, anon, authenticated;

drop trigger if exists trg_set_job_inactive_since on public.jobs;
create trigger trg_set_job_inactive_since before insert or update on public.jobs
for each row execute function public.set_job_inactive_since();

create index if not exists idx_jobs_inactive_since
on public.jobs(inactive_since_at,id) where not is_active;
