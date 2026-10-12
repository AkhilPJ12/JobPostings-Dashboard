-- Only values supplied as structured fields by a company may override AI extraction.
-- Existing scraper classifications have no trustworthy provenance and remain stored
-- for audit, but are not presented as source facts.
alter table public.jobs
  add column if not exists source_field_provenance jsonb not null default '{}'::jsonb;

-- Search must use the same provenance policy as visible fields.
alter table public.jobs add column if not exists visible_search_text text generated always as (
  coalesce(title,'') || ' ' || coalesce(location,'') || ' ' ||
  coalesce(case when source_field_provenance->>'department' = 'structured' then department
    when ai_result_source_hash = source_content_hash then ai_result->>'department' end,'') || ' ' ||
  coalesce(summary,'') || ' ' || coalesce(description,'') || ' ' ||
  coalesce(case when ai_result_source_hash = source_content_hash then ai_result->>'summary' end,'')
) stored;
create index if not exists idx_jobs_visible_search_trgm
  on public.jobs using gin (visible_search_text gin_trgm_ops);

create or replace view public.job_read_model as
select j.id, j.external_job_id, j.company_id, c.name as company, c.color as company_color,
  c."Company_icon" as company_icon, j.title, j.location,
  coalesce(case when j.source_field_provenance->>'location_type' = 'structured' then j.location_type end,
    case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'locationType' end) as location_type,
  coalesce(case when j.source_field_provenance->>'department' = 'structured' then j.department end,
    case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'department' end) as department,
  coalesce(case when j.source_field_provenance->>'employment_type' = 'structured' then j.employment_type end,
    case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'employmentType' end) as employment_type,
  j.posted_date, j.first_seen_at::date as first_seen_date, j.date_provenance,
  j.end_date, j.description,
  coalesce(case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'summary' end,
    nullif(j.summary,'')) as summary,
  (j.ai_result_source_hash = j.source_content_hash and j.ai_result ? 'summary') as summary_generated,
  coalesce(case when j.source_field_provenance->>'pay_range' = 'structured' then nullif(j.pay_range,'Not specified') end,
    case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'payRange' end) as pay_range,
  coalesce(case when j.source_field_provenance->>'h1b_sponsorship' = 'structured' then nullif(j.h1b_sponsorship,'N/A') end,
    case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'h1bSponsorship' end) as h1b_sponsorship,
  coalesce(case when j.source_field_provenance->>'security_clearance' = 'structured' then nullif(j.security_clearance,'N/A') end,
    case when j.ai_result_source_hash = j.source_content_hash then j.ai_result->>'securityClearance' end) as security_clearance,
  case when j.source_field_provenance->>'required_qualifications' = 'structured'
    then coalesce(j.required_qualifications,'{}'::text[])
    when j.ai_result_source_hash = j.source_content_hash and
      jsonb_typeof(j.ai_result->'requiredQualifications') = 'array'
    then array(select jsonb_array_elements_text(j.ai_result->'requiredQualifications'))
    else '{}'::text[] end as required_qualifications,
  case when j.source_field_provenance->>'preferred_qualifications' = 'structured'
    then coalesce(j.preferred_qualifications,'{}'::text[])
    when j.ai_result_source_hash = j.source_content_hash and
      jsonb_typeof(j.ai_result->'preferredQualifications') = 'array'
    then array(select jsonb_array_elements_text(j.ai_result->'preferredQualifications'))
    else '{}'::text[] end as preferred_qualifications,
  j.job_url, j.is_active, j.visible_search_text as search_text
from public.jobs j join public.companies c on c.id = j.company_id;
