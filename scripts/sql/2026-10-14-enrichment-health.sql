-- Superseded source versions remain in queue history, but are not actionable.
-- Report pending and failed work only for the current active source version.
create or replace function public.get_public_enrichment_health() returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'pending', count(*) filter(where j.id is not null and q.state in ('pending','leased')),
  'failed', count(*) filter(where j.id is not null and q.state = 'failed'),
  'oldestPendingAt', min(q.created_at) filter(where j.id is not null and q.state in ('pending','leased')),
  'attempts', coalesce(sum(q.attempts) filter(where j.id is not null),0),
  'validationFailures', count(*) filter(where j.id is not null and q.last_error ilike '%invalid extraction%'),
  'averageLatencyMs', round(avg(q.latency_ms)),
  'inputTokens', coalesce(sum(q.input_tokens),0),
  'outputTokens', coalesce(sum(q.output_tokens),0)
) from public.ai_enrichment_queue q
left join public.jobs j on j.id = q.job_id and j.source_content_hash = q.source_hash and j.is_active;
$$;

revoke all on function public.get_public_enrichment_health() from public;
grant execute on function public.get_public_enrichment_health() to anon, authenticated, service_role;
