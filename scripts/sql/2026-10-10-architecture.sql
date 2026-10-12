-- Apply after the existing jobs/companies and ai-enrichment.sql migrations.
-- Additive migration; legacy source values are restored only when a raw snapshot exists.
create extension if not exists pg_trgm;

alter table public.jobs
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists date_provenance text,
  add column if not exists ai_result jsonb,
  add column if not exists ai_result_source_hash text,
  add column if not exists ai_prompt_version integer;

alter table public.jobs add column if not exists search_text text generated always as (
  coalesce(title,'') || ' ' || coalesce(location,'') || ' ' || coalesce(department,'') || ' ' ||
  coalesce(summary,'') || ' ' || coalesce(description,'') || ' ' ||
  coalesce(case when ai_result_source_hash = source_content_hash then ai_result->>'summary' end,'')
) stored;

update public.jobs set
  first_seen_at = coalesce(first_seen_at, created_at),
  last_seen_at = coalesce(last_seen_at, updated_at),
  date_provenance = coalesce(date_provenance, 'legacy_unknown')
where first_seen_at is null or last_seen_at is null or date_provenance is null;

-- Earlier enrichment rewrote jobs in place. The saved snapshot is the best available source.
update public.jobs set
  title = coalesce(raw_job_payload->>'title', title),
  description = coalesce(raw_job_payload->>'description', description),
  summary = coalesce(raw_job_payload->>'summary', summary),
  pay_range = coalesce(raw_job_payload->>'pay_range', pay_range),
  location_type = coalesce((raw_job_payload->>'location_type')::text, location_type),
  employment_type = coalesce((raw_job_payload->>'employment_type')::text, employment_type),
  department = coalesce(raw_job_payload->>'department', department),
  h1b_sponsorship = coalesce(raw_job_payload->>'h1b_sponsorship', h1b_sponsorship),
  security_clearance = coalesce(raw_job_payload->>'security_clearance', security_clearance),
  required_qualifications = coalesce(array(select jsonb_array_elements_text(raw_job_payload->'required_qualifications')), required_qualifications),
  preferred_qualifications = coalesce(array(select jsonb_array_elements_text(raw_job_payload->'preferred_qualifications')), preferred_qualifications)
where ai_enrichment_status = 'enriched' and raw_job_payload is not null;

-- Legacy scraper defaults are not evidence. Keep only statements found in source text.
update public.jobs set
  location_type = case when location_type = 'Onsite' and
    coalesce(description,'') !~* 'on[- ]?site|in[- ]?office|in person' then null else location_type end,
  employment_type = case when employment_type = 'Full-time' and
    (coalesce(description,'') || ' ' || title) !~* 'full[- ]?time' then null else employment_type end,
  security_clearance = case when security_clearance = 'No' and
    coalesce(description,'') !~* '(no|not|without).{0,25}(security )?clearance' then null else security_clearance end,
  h1b_sponsorship = case when h1b_sponsorship = 'No' and
    coalesce(description,'') !~* '(no|not|without|unable|cannot|will not).{0,45}sponsor' then null else h1b_sponsorship end,
  pay_range = nullif(pay_range, 'Not specified');

update public.jobs j set date_provenance = 'first_seen', posted_date = j.created_at::date
from public.companies c where c.id = j.company_id and
  c.name in ('Meta','Intuit','Infosys','Goldman Sachs') and j.date_provenance = 'legacy_unknown';

alter table public.jobs alter column first_seen_at set default now();
alter table public.jobs alter column last_seen_at set default now();
alter table public.jobs alter column date_provenance set default 'source';
alter table public.jobs alter column first_seen_at set not null;
alter table public.jobs alter column last_seen_at set not null;
alter table public.jobs alter column date_provenance set not null;
alter table public.jobs add constraint jobs_date_provenance_check
  check (date_provenance in ('source', 'first_seen', 'legacy_unknown')) not valid;
alter table public.jobs validate constraint jobs_date_provenance_check;

create table if not exists public.job_source_identities (
  external_job_id text primary key,
  first_seen_at timestamptz not null default now(),
  source_posted_date date,
  date_provenance text not null default 'legacy_unknown'
);
insert into public.job_source_identities (external_job_id, first_seen_at, source_posted_date, date_provenance)
select external_job_id, min(first_seen_at), min(posted_date), min(date_provenance)
from public.jobs where external_job_id is not null
group by external_job_id on conflict do nothing;

create or replace function public.preserve_job_source_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare identity_row public.job_source_identities%rowtype;
begin
  if new.external_job_id is null then return new; end if;
  insert into public.job_source_identities(external_job_id, first_seen_at, source_posted_date, date_provenance)
  values (new.external_job_id, coalesce(new.first_seen_at, now()),
          case when new.date_provenance = 'source' then new.posted_date else null end, new.date_provenance)
  on conflict (external_job_id) do nothing;
  select * into identity_row from public.job_source_identities where external_job_id = new.external_job_id;
  new.first_seen_at := identity_row.first_seen_at;
  new.last_seen_at := now();
  if new.date_provenance = 'first_seen' then
    new.posted_date := identity_row.first_seen_at::date;
  end if;
  if new.posted_date is null or new.posted_date > current_date or
      new.posted_date < current_date - 13 or
      (new.end_date is not null and new.end_date < current_date) then
    new.is_active := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_preserve_job_source_identity on public.jobs;
create trigger trg_preserve_job_source_identity before insert or update of source_content_hash, posted_date, end_date
on public.jobs for each row execute function public.preserve_job_source_identity();

create index if not exists idx_jobs_public_recent on public.jobs(posted_date desc, id desc) where is_active;
create index if not exists idx_jobs_public_company on public.jobs(company_id, posted_date desc, id desc) where is_active;
create index if not exists idx_jobs_public_filters on public.jobs(location_type, employment_type, department) where is_active;
create index if not exists idx_jobs_search_text_trgm on public.jobs using gin(search_text gin_trgm_ops);
create index if not exists idx_companies_name_trgm on public.companies using gin(name gin_trgm_ops);

-- A run is an event; the previous unique company index prevented history.
drop index if exists public.uq_scraper_runs_company_name;
create table if not exists public.scraper_leases (
  company_name text primary key,
  token uuid not null,
  expires_at timestamptz not null
);
create or replace function public.claim_scraper_lease(p_company text, p_seconds integer default 900)
returns uuid language plpgsql security definer set search_path = '' as $$
declare claimed uuid := gen_random_uuid();
begin
  insert into public.scraper_leases(company_name,token,expires_at)
  values (p_company,claimed,now()+make_interval(secs => least(greatest(p_seconds,60),3600)))
  on conflict(company_name) do update set token = claimed, expires_at = excluded.expires_at
  where public.scraper_leases.expires_at < now();
  if not found then return null; end if;
  return claimed;
end $$;
create or replace function public.finish_scraper_lease(p_company text,p_token uuid,p_run_group text,
  p_status text,p_started_at timestamptz,p_completed_at timestamptz,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.scraper_leases where company_name = p_company and token = p_token;
  if not found then return false; end if;
  insert into public.scraper_runs(company_name,run_group_id,status,started_at,completed_at,duration_seconds,error_message)
  values(p_company,p_run_group,p_status,p_started_at,p_completed_at,
    greatest(0,extract(epoch from p_completed_at-p_started_at)::integer),left(p_error,1000));
  return true;
end $$;

create table if not exists public.ai_enrichment_settings (
  singleton boolean primary key default true check (singleton),
  model text not null,
  prompt_version integer not null default 1
);
insert into public.ai_enrichment_settings(singleton, model, prompt_version)
values (true, 'gemma4:31b', 1) on conflict (singleton) do nothing;

create table if not exists public.ai_enrichment_queue (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.jobs(id) on delete cascade,
  source_hash text not null,
  model text not null,
  prompt_version integer not null,
  state text not null default 'pending' check (state in ('pending','leased','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  last_error text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, source_hash, model, prompt_version)
);
create index if not exists idx_ai_queue_claim on public.ai_enrichment_queue(state, available_at, created_at);

create table if not exists public.ai_worker_lease (
  singleton boolean primary key default true check (singleton),
  token uuid not null,
  expires_at timestamptz not null
);
create or replace function public.claim_ai_worker_lease() returns uuid
language plpgsql security definer set search_path = '' as $$
declare claimed uuid := gen_random_uuid();
begin
  insert into public.ai_worker_lease(singleton,token,expires_at)
  values(true,claimed,now()+interval '3 minutes')
  on conflict(singleton) do update set token = claimed, expires_at = excluded.expires_at
  where public.ai_worker_lease.expires_at < now();
  if not found then return null; end if;
  return claimed;
end $$;
create or replace function public.renew_ai_worker_lease(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_worker_lease set expires_at = now()+interval '3 minutes'
  where singleton and token = p_token and expires_at > now();
  return found;
end $$;
create or replace function public.release_ai_worker_lease(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ai_worker_lease where singleton and token = p_token;
  return found;
end $$;

create or replace function public.enqueue_job_enrichment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare settings public.ai_enrichment_settings%rowtype;
begin
  if new.is_active and new.source_content_hash is not null and
      (tg_op = 'INSERT' or new.source_content_hash is distinct from old.source_content_hash) then
    select * into settings from public.ai_enrichment_settings where singleton;
    insert into public.ai_enrichment_queue(job_id, source_hash, model, prompt_version)
    values (new.id, new.source_content_hash, settings.model, settings.prompt_version)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_enqueue_job_enrichment on public.jobs;
create trigger trg_enqueue_job_enrichment after insert or update of source_content_hash
on public.jobs for each row execute function public.enqueue_job_enrichment();

insert into public.ai_enrichment_queue(job_id,source_hash,model,prompt_version)
select j.id,j.source_content_hash,s.model,s.prompt_version from public.jobs j
cross join public.ai_enrichment_settings s
where j.is_active and j.source_content_hash is not null
on conflict do nothing;

create or replace function public.claim_ai_enrichment(p_model text, p_lease_seconds integer default 180,
  p_company text default null, p_state text default 'pending')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare queue_row public.ai_enrichment_queue%rowtype;
declare job_row public.jobs%rowtype;
begin
  select q.* into queue_row from public.ai_enrichment_queue q
  join public.jobs j on j.id = q.job_id and j.source_content_hash = q.source_hash and j.is_active
  join public.companies c on c.id = j.company_id
  where q.model = p_model and q.attempts < 3 and
    (p_company is null or c.name ilike '%' || p_company || '%') and
    ((q.state = p_state and q.available_at <= now()) or
      (p_state = 'pending' and q.state = 'leased' and q.leased_until < now()))
  order by q.created_at, q.id limit 1 for update of q skip locked;
  if not found then return null; end if;
  update public.ai_enrichment_queue set state = 'leased', attempts = attempts + 1,
    lease_token = gen_random_uuid(), leased_until = now() + make_interval(secs => least(greatest(p_lease_seconds, 60), 600)),
    updated_at = now() where id = queue_row.id returning * into queue_row;
  select * into job_row from public.jobs where id = queue_row.job_id;
  return jsonb_build_object('queue_id',queue_row.id,'lease_token',queue_row.lease_token,
    'attempts',queue_row.attempts,'job_id',job_row.id,'source_hash',queue_row.source_hash,
    'payload',job_row.raw_job_payload,'model',queue_row.model,'prompt_version',queue_row.prompt_version);
end $$;

create or replace function public.count_ai_enrichment_queue(p_model text, p_state text default 'pending',
  p_company text default null) returns bigint
language sql stable security definer set search_path = '' as $$
select count(*) from public.ai_enrichment_queue q
join public.jobs j on j.id = q.job_id and j.source_content_hash = q.source_hash and j.is_active
join public.companies c on c.id = j.company_id
where q.model = p_model and q.state = p_state and
  (p_company is null or c.name ilike '%' || p_company || '%');
$$;

create or replace function public.finish_ai_enrichment(p_queue_id bigint, p_lease_token uuid,
  p_result jsonb, p_latency_ms integer, p_input_tokens integer, p_output_tokens integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare q public.ai_enrichment_queue%rowtype;
begin
  select * into q from public.ai_enrichment_queue where id = p_queue_id and state = 'leased'
    and lease_token = p_lease_token and leased_until > now() for update;
  if not found then return false; end if;
  update public.jobs set ai_result = p_result, ai_result_source_hash = q.source_hash,
    ai_prompt_version = q.prompt_version, ai_enrichment_status = 'enriched',
    ai_enrichment_model = q.model, ai_enriched_at = now(), ai_enrichment_error = null
  where id = q.job_id and source_content_hash = q.source_hash and is_active;
  if not found then return false; end if;
  update public.ai_enrichment_queue set state = 'done', lease_token = null, leased_until = null,
    latency_ms = p_latency_ms, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
    updated_at = now() where id = q.id;
  return true;
end $$;

create or replace function public.fail_ai_enrichment(p_queue_id bigint, p_lease_token uuid,
  p_error text, p_retryable boolean, p_retry_after_seconds integer default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare q public.ai_enrichment_queue%rowtype;
begin
  select * into q from public.ai_enrichment_queue where id = p_queue_id and state = 'leased'
    and lease_token = p_lease_token for update;
  if not found then return false; end if;
  update public.ai_enrichment_queue set
    state = case when p_retryable and q.attempts < 3 then 'pending' else 'failed' end,
    available_at = now() + make_interval(secs => greatest(
      least(60 * power(2, q.attempts)::integer, 3600),
      least(greatest(coalesce(p_retry_after_seconds, 0), 0), 86400))),
    lease_token = null, leased_until = null, last_error = left(p_error, 1000), updated_at = now()
  where id = q.id;
  return true;
end $$;

create or replace function public.release_ai_enrichment(p_queue_id bigint, p_lease_token uuid,
  p_delay_seconds integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_enrichment_queue set state = 'pending',
    attempts = greatest(attempts - 1, 0), lease_token = null, leased_until = null,
    available_at = now() + make_interval(secs => least(greatest(p_delay_seconds, 0), 86400)),
    updated_at = now()
  where id = p_queue_id and state = 'leased' and lease_token = p_lease_token;
  return found;
end $$;

-- Public reads return only curated columns. Neither payloads nor model evidence are exposed.
create or replace view public.job_read_model as
select j.id, j.external_job_id, j.company_id, c.name as company, c.color as company_color,
  c."Company_icon" as company_icon, j.title, j.location,
  coalesce(j.location_type, case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'locationType' end) as location_type,
  coalesce(j.department, case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'department' end) as department,
  coalesce(j.employment_type, case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'employmentType' end) as employment_type,
  j.posted_date, j.first_seen_at::date as first_seen_date, j.date_provenance,
  j.end_date, j.description,
  coalesce(case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'summary' end, nullif(j.summary,'')) as summary,
  (j.ai_result_source_hash = j.source_content_hash and j.ai_result ? 'summary') as summary_generated,
  coalesce(nullif(j.pay_range,'Not specified'), case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'payRange' end) as pay_range,
  coalesce(nullif(j.h1b_sponsorship,'N/A'), case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'h1bSponsorship' end) as h1b_sponsorship,
  coalesce(nullif(j.security_clearance,'N/A'), case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'securityClearance' end) as security_clearance,
  case when coalesce(array_length(j.required_qualifications,1),0) = 0 and j.ai_result_source_hash = j.source_content_hash and
    jsonb_array_length(case when jsonb_typeof(j.ai_result->'requiredQualifications') = 'array'
      then j.ai_result->'requiredQualifications' else '[]'::jsonb end) > 0
    then array(select jsonb_array_elements_text(j.ai_result->'requiredQualifications'))
    else j.required_qualifications end as required_qualifications,
  case when coalesce(array_length(j.preferred_qualifications,1),0) = 0 and j.ai_result_source_hash = j.source_content_hash and
    jsonb_array_length(case when jsonb_typeof(j.ai_result->'preferredQualifications') = 'array'
      then j.ai_result->'preferredQualifications' else '[]'::jsonb end) > 0
    then array(select jsonb_array_elements_text(j.ai_result->'preferredQualifications'))
    else j.preferred_qualifications end as preferred_qualifications,
  j.job_url, j.is_active, j.search_text
from public.jobs j join public.companies c on c.id = j.company_id;

create or replace function public.search_jobs(p_query jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = '' set work_mem = '16MB' as $$
with params as (select
  left(coalesce(p_query->>'q',''),160) as q,
  replace(replace(replace(left(coalesce(p_query->>'q',''),160), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') as pattern,
  greatest(1,least(case when p_query->>'page' ~ '^[0-9]{1,6}$' then (p_query->>'page')::integer else 1 end,100000)) as page,
  greatest(1,least(case when p_query->>'pageSize' ~ '^[0-9]{1,3}$' then (p_query->>'pageSize')::integer else 20 end,100)) as page_size,
  coalesce(p_query->>'sort','recent') as sort,
  coalesce(p_query->>'datePosted','all') as date_posted),
filtered as (
  select r.id,r.company,r.title,r.posted_date from public.job_read_model r cross join params p
  where r.is_active and r.posted_date between current_date - 13 and current_date
    and (r.end_date is null or r.end_date >= current_date)
    and (p.q = '' or r.search_text ilike '%'||p.pattern||'%' or r.company ilike '%'||p.pattern||'%')
    and (coalesce(jsonb_array_length(p_query->'companies'),0) = 0 or r.company in (select jsonb_array_elements_text(p_query->'companies')))
    and (coalesce(jsonb_array_length(p_query->'locationTypes'),0) = 0 or coalesce(r.location_type,'Unknown') in (select jsonb_array_elements_text(p_query->'locationTypes')))
    and (coalesce(jsonb_array_length(p_query->'departments'),0) = 0 or coalesce(r.department,'Unknown') in (select jsonb_array_elements_text(p_query->'departments')))
    and (coalesce(jsonb_array_length(p_query->'employmentTypes'),0) = 0 or coalesce(r.employment_type,'Unknown') in (select jsonb_array_elements_text(p_query->'employmentTypes')))
    and (coalesce(jsonb_array_length(p_query->'visaSponsorship'),0) = 0 or coalesce(nullif(r.h1b_sponsorship,'N/A'),'Unknown') in (select jsonb_array_elements_text(p_query->'visaSponsorship')))
    and (coalesce(jsonb_array_length(p_query->'securityClearance'),0) = 0 or coalesce(nullif(r.security_clearance,'N/A'),'Unknown') in (select jsonb_array_elements_text(p_query->'securityClearance')))
    and (p.date_posted = 'all' or r.posted_date >= current_date -
      case p.date_posted when 'today' then 0 when '7days' then 6 else 13 end)
), page_ids as (
  select f.id,f.company,f.title,f.posted_date from filtered f cross join params p
  order by
    case when p.sort = 'company' then f.company end asc,
    case when p.sort = 'title' then f.title end asc,
    case when p.sort = 'recent' then f.posted_date end desc,
    f.id desc
  limit (select page_size from params)
  offset (select (page - 1) * page_size from params)
), page_rows as (
  select r.*, row_number() over (order by
    case when p.sort = 'company' then i.company end asc,
    case when p.sort = 'title' then i.title end asc,
    case when p.sort = 'recent' then i.posted_date end desc,
    i.id desc) as page_order
  from page_ids i join public.job_read_model r on r.id = i.id cross join params p
)
select jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(r) - 'description' - 'required_qualifications' - 'preferred_qualifications' - 'page_order' - 'search_text' order by r.page_order) from page_rows r),'[]'::jsonb),
  'total',(select count(*) from filtered), 'page',(select page from params),
  'pageSize',(select page_size from params));
$$;

create or replace function public.get_public_job(p_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(r) - 'search_text' from public.job_read_model r
  where r.id = p_id and r.is_active and r.posted_date between current_date - 13 and current_date
    and (r.end_date is null or r.end_date >= current_date);
$$;

create or replace function public.get_job_facets() returns jsonb
language sql stable security definer set search_path = '' as $$
with visible as (select * from public.job_read_model where is_active
  and posted_date between current_date - 13 and current_date
  and (end_date is null or end_date >= current_date))
select jsonb_build_object(
  'companies',(select coalesce(jsonb_agg(jsonb_build_object('value',company,'count',n) order by company),'[]'::jsonb)
    from (select company,count(*) n from visible group by company) x),
  'departments',(select coalesce(jsonb_agg(jsonb_build_object('value',department,'count',n) order by department),'[]'::jsonb)
    from (select coalesce(department,'Unknown') department,count(*) n from visible group by 1) x),
  'employmentTypes',(select coalesce(jsonb_agg(jsonb_build_object('value',employment_type,'count',n) order by employment_type),'[]'::jsonb)
    from (select coalesce(employment_type,'Unknown') employment_type,count(*) n from visible group by 1) x),
  'visaSponsorship',(select coalesce(jsonb_agg(jsonb_build_object('value',h1b_sponsorship,'count',n) order by h1b_sponsorship),'[]'::jsonb)
    from (select coalesce(nullif(h1b_sponsorship,'N/A'),'Unknown') h1b_sponsorship,count(*) n from visible group by 1) x),
  'securityClearance',(select coalesce(jsonb_agg(jsonb_build_object('value',security_clearance,'count',n) order by security_clearance),'[]'::jsonb)
    from (select coalesce(nullif(security_clearance,'N/A'),'Unknown') security_clearance,count(*) n from visible group by 1) x));
$$;

create or replace function public.get_public_scraper_statuses() returns jsonb
language sql stable security definer set search_path = '' as $$
with latest as (
  select distinct on (company_name) company_name,status,completed_at,duration_seconds
  from public.scraper_runs order by company_name,completed_at desc nulls last,id desc
), counts as (
  select company_id,count(*) total from public.jobs
  where is_active and posted_date between current_date - 13 and current_date
  group by company_id
)
select coalesce(jsonb_agg(jsonb_build_object('company_name',c.name,'company_icon',c."Company_icon",
  'status',coalesce(r.status,'Not Run'),'completed_at',r.completed_at,
  'duration_seconds',r.duration_seconds,'total_jobs',coalesce(n.total,0)) order by c.name),'[]'::jsonb)
from public.companies c
left join latest r on r.company_name = c.name
left join counts n on n.company_id = c.id
where c.is_active;
$$;

create or replace function public.get_public_enrichment_health() returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'pending', count(*) filter(where state in ('pending','leased')),
  'failed', count(*) filter(where state = 'failed'),
  'oldestPendingAt', min(created_at) filter(where state in ('pending','leased')),
  'attempts', coalesce(sum(attempts),0),
  'validationFailures', count(*) filter(where last_error ilike '%invalid extraction%'),
  'averageLatencyMs', round(avg(latency_ms)),
  'inputTokens', coalesce(sum(input_tokens),0),
  'outputTokens', coalesce(sum(output_tokens),0)
) from public.ai_enrichment_queue;
$$;

-- Jobs and company records may contain private source and operational fields.
alter table public.jobs enable row level security;
alter table public.companies enable row level security;
alter table public.job_source_identities enable row level security;
alter table public.ai_enrichment_usage enable row level security;
alter table public.ai_enrichment_queue enable row level security;
alter table public.ai_enrichment_settings enable row level security;
alter table public.ai_worker_lease enable row level security;
alter table public.scraper_runs enable row level security;
alter table public.scraper_leases enable row level security;
revoke all on public.jobs, public.companies, public.job_source_identities,
  public.ai_enrichment_usage, public.ai_enrichment_queue, public.ai_enrichment_settings,
  public.ai_worker_lease,
  public.scraper_runs, public.scraper_leases from public, anon, authenticated;
revoke all on public.job_read_model from public, anon, authenticated;
grant select on public.ai_enrichment_queue to service_role;
revoke all on function public.claim_ai_enrichment(text,integer,text,text),
  public.claim_ai_worker_lease(), public.renew_ai_worker_lease(uuid),
  public.release_ai_worker_lease(uuid),
  public.count_ai_enrichment_queue(text,text,text),
  public.finish_ai_enrichment(bigint,uuid,jsonb,integer,integer,integer),
  public.fail_ai_enrichment(bigint,uuid,text,boolean,integer),
  public.release_ai_enrichment(bigint,uuid,integer),
  public.consume_ai_enrichment_quota(date,text,integer) from public, anon, authenticated;
revoke all on function public.claim_scraper_lease(text,integer),
  public.finish_scraper_lease(text,uuid,text,text,timestamptz,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.claim_ai_enrichment(text,integer,text,text),
  public.claim_ai_worker_lease(), public.renew_ai_worker_lease(uuid),
  public.release_ai_worker_lease(uuid),
  public.count_ai_enrichment_queue(text,text,text),
  public.finish_ai_enrichment(bigint,uuid,jsonb,integer,integer,integer),
  public.fail_ai_enrichment(bigint,uuid,text,boolean,integer),
  public.release_ai_enrichment(bigint,uuid,integer),
  public.consume_ai_enrichment_quota(date,text,integer) to service_role;
grant execute on function public.claim_scraper_lease(text,integer),
  public.finish_scraper_lease(text,uuid,text,text,timestamptz,timestamptz,text)
  to service_role;
revoke all on function public.search_jobs(jsonb), public.get_public_job(bigint),
  public.get_job_facets(), public.get_public_scraper_statuses(),
  public.get_public_enrichment_health() from public;
grant execute on function public.search_jobs(jsonb), public.get_public_job(bigint),
  public.get_job_facets(), public.get_public_scraper_statuses(),
  public.get_public_enrichment_health() to anon, authenticated, service_role;
