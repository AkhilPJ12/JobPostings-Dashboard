-- Tracks each scraper execution result for dashboard status view.
create table if not exists public.scraper_runs (
  id bigint generated always as identity primary key,
  company_name text not null,
  run_group_id text,
  status text not null check (status in ('Successful', 'Error', 'Partial')),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_seconds integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scraper_runs_company_completed
  on public.scraper_runs (company_name, completed_at desc);

create index if not exists idx_scraper_runs_run_group
  on public.scraper_runs (run_group_id);

create unique index if not exists uq_scraper_runs_company_name
  on public.scraper_runs (company_name);
