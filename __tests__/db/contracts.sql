-- Run after all three migration files in a disposable PostgreSQL database.
do $$
declare token uuid; second_token uuid; q jsonb; current_hash text;
begin
  if pg_catalog.has_table_privilege('anon','public.jobs','select') then
    raise exception 'anon can still read source jobs';
  end if;
  if exists(select 1 from pg_catalog.pg_class where oid in (
      'public.jobs'::regclass,'public.companies'::regclass,'public.ai_enrichment_queue'::regclass,
      'public.scraper_runs'::regclass) and not relrowsecurity) then
    raise exception 'sensitive tables must have RLS enabled';
  end if;
  if not pg_catalog.has_function_privilege('anon','public.search_jobs(jsonb)','execute') then
    raise exception 'anon cannot query curated jobs';
  end if;
  if pg_catalog.has_function_privilege('anon','public.claim_ai_enrichment(text,integer,text,text)','execute') then
    raise exception 'anon can claim AI work';
  end if;
  if (public.search_jobs('{}'::jsonb)->>'total')::integer <> 1 then
    raise exception 'public search count is wrong';
  end if;
  if (public.search_jobs('{"companies":[],"locationTypes":[],"departments":[],"employmentTypes":[],"visaSponsorship":[],"securityClearance":[]}'::jsonb)->>'total')::integer <> 1 then
    raise exception 'empty filter arrays must not hide jobs';
  end if;
  if (public.search_jobs('{"q":"engineer"}'::jsonb)->>'total')::integer <> 1 or
      (public.search_jobs('{}'::jsonb)->'jobs'->0) ? 'search_text' or
      public.get_public_job(1) ? 'search_text' then
    raise exception 'substring search or curated payload is wrong';
  end if;

  token := public.claim_ai_worker_lease();
  if token is null or public.claim_ai_worker_lease() is not null then
    raise exception 'global AI worker lease is not exclusive';
  end if;
  if not public.renew_ai_worker_lease(token) or not public.release_ai_worker_lease(token) then
    raise exception 'AI worker lease could not be renewed/released';
  end if;

  token := public.claim_scraper_lease('Amazon',900);
  if token is null or public.claim_scraper_lease('Amazon',900) is not null then
    raise exception 'scraper lease is not exclusive';
  end if;
  if not public.finish_scraper_lease('Amazon',token,'test','Successful',now(),now(),null) then
    raise exception 'scraper lease did not finish';
  end if;
  if (select item->>'status' from jsonb_array_elements(public.get_public_scraper_statuses()) item
      where item->>'company_name' = 'Amazon') <> 'Successful' then
    raise exception 'latest scraper run missing from public status';
  end if;

  update public.jobs set raw_job_payload = '{"title":"Engineer","description":"Source text"}',
    source_content_hash = 'hash-one' where external_job_id = 'amazon_1';
  q := public.claim_ai_enrichment('gemma4:31b');
  if q is null or public.claim_ai_enrichment('gemma4:31b') is not null then
    raise exception 'AI claim is not exclusive';
  end if;
  update public.jobs set source_content_hash = 'hash-two' where external_job_id = 'amazon_1';
  if public.finish_ai_enrichment((q->>'queue_id')::bigint,(q->>'lease_token')::uuid,
    '{"summary":"Stale"}',10,1,1) then
    raise exception 'stale AI result was accepted';
  end if;
  q := public.claim_ai_enrichment('gemma4:31b');
  if q->>'source_hash' <> 'hash-two' then raise exception 'new source not queued'; end if;
  if not public.finish_ai_enrichment((q->>'queue_id')::bigint,(q->>'lease_token')::uuid,
    '{"summary":"Current"}',10,1,1) then
    raise exception 'current AI result was rejected';
  end if;
  select ai_result_source_hash into current_hash from public.jobs where external_job_id = 'amazon_1';
  if current_hash <> 'hash-two' then raise exception 'published hash mismatch'; end if;
  if (public.get_public_job(1)->>'summary') <> 'Current' then
    raise exception 'published AI summary missing from public detail';
  end if;
  update public.jobs set summary = 'Scraper excerpt' where external_job_id = 'amazon_1';
  if (public.get_public_job(1)->>'summary') <> 'Current' or
      (public.get_public_job(1)->>'summary_generated')::boolean is not true then
    raise exception 'AI summary was not labeled or scraper excerpt hid it';
  end if;
  update public.jobs set pay_range = '$150,000 source', required_qualifications = array['Source skill'],
    source_field_provenance = '{"pay_range":"structured","required_qualifications":"structured"}'::jsonb
    where external_job_id = 'amazon_1';
  update public.jobs set ai_result = ai_result || '{"payRange":"$200,000 AI","requiredQualifications":["AI skill"]}'::jsonb
    where external_job_id = 'amazon_1';
  if (public.get_public_job(1)->>'pay_range') <> '$150,000 source' or
      (public.get_public_job(1)->'required_qualifications'->>0) <> 'Source skill' then
    raise exception 'AI result displaced structured source fields';
  end if;
  update public.jobs set source_field_provenance = '{}'::jsonb,
    ai_result = ai_result - 'payRange' - 'requiredQualifications' where external_job_id = 'amazon_1';
  if (public.get_public_job(1)->>'pay_range') is not null or
      jsonb_array_length(public.get_public_job(1)->'required_qualifications') <> 0 then
    raise exception 'unproven scraper categories leaked into public reads';
  end if;
  update public.jobs set department = 'HiddenLegacyToken' where external_job_id = 'amazon_1';
  if (public.search_jobs('{"q":"HiddenLegacyToken"}'::jsonb)->>'total')::integer <> 0 then
    raise exception 'unproven scraper category leaked through search';
  end if;

  update public.jobs set source_content_hash = 'hash-three' where external_job_id = 'amazon_1';
  q := public.claim_ai_enrichment('gemma4:31b');
  update public.ai_enrichment_queue set leased_until = now() - interval '1 second'
    where id = (q->>'queue_id')::bigint;
  second_token := (public.claim_ai_enrichment('gemma4:31b')->>'lease_token')::uuid;
  if second_token is null or second_token = (q->>'lease_token')::uuid then
    raise exception 'expired lease was not recovered';
  end if;

  if not public.consume_ai_enrichment_quota(current_date,'test-model',1) then
    raise exception 'first quota call failed';
  end if;
  if public.consume_ai_enrichment_quota(current_date,'test-model',1) then
    raise exception 'quota exceeded cap';
  end if;

  insert into public.job_source_identities(external_job_id,first_seen_at,date_provenance)
  values('meta_old', now() - interval '30 days','first_seen');
  insert into public.jobs(company_id,external_job_id,title,posted_date,date_provenance,source_content_hash)
  values(2,'meta_old','Old Role',current_date,'first_seen','old-source');
  if exists(select 1 from public.jobs where external_job_id='meta_old' and is_active) then
    raise exception 'undated old job reactivated';
  end if;
end $$;

set role anon;
select (public.search_jobs('{}'::jsonb)->>'total')::integer;
select jsonb_array_length(public.get_job_facets()->'companies');
reset role;
set role service_role;
do $$ begin
  if (select count(*) from public.ai_enrichment_queue) < 1 then
    raise exception 'worker cannot read its RLS-protected queue';
  end if;
end $$;
reset role;
