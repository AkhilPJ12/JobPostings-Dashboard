-- AI enrichment metadata and quota tracking.
-- Run once in Supabase SQL Editor before enabling AI enrichment.

alter table public.jobs
    add column if not exists raw_job_payload jsonb,
    add column if not exists source_content_hash text,
    add column if not exists ai_enrichment_status text,
    add column if not exists ai_enrichment_model text,
    add column if not exists ai_enriched_at timestamptz,
    add column if not exists ai_enrichment_error text,
    add column if not exists ai_enrichment_attempts integer not null default 0;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'jobs_ai_enrichment_status_check'
    ) then
        alter table public.jobs
            add constraint jobs_ai_enrichment_status_check
            check (ai_enrichment_status is null or ai_enrichment_status in ('pending', 'enriched', 'failed'));
    end if;
end $$;

create index if not exists idx_jobs_ai_enrichment_status
    on public.jobs (ai_enrichment_status, updated_at)
    where is_active = true;

create index if not exists idx_jobs_source_content_hash
    on public.jobs (source_content_hash);

create table if not exists public.ai_enrichment_usage (
    usage_date date not null,
    model text not null,
    request_count integer not null default 0 check (request_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (usage_date, model)
);

create or replace function public.consume_ai_enrichment_quota(
    p_usage_date date,
    p_model text,
    p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    consumed boolean;
begin
    if p_max_requests <= 0 then
        return false;
    end if;

    insert into public.ai_enrichment_usage (usage_date, model, request_count)
    values (p_usage_date, p_model, 1)
    on conflict (usage_date, model)
    do update set
        request_count = public.ai_enrichment_usage.request_count + 1,
        updated_at = now()
    where public.ai_enrichment_usage.request_count < p_max_requests
    returning true into consumed;

    return coalesce(consumed, false);
end;
$$;

grant execute on function public.consume_ai_enrichment_quota(date, text, integer) to service_role;

-- Optional one-time backfill after applying the columns:
-- update public.jobs
-- set ai_enrichment_status = 'pending'
-- where is_active = true
--   and ai_enrichment_status is null;
