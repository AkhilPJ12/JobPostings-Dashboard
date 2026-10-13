-- DISPOSABLE DATABASE ONLY: adds 100 companies and 100,000 active postings.
insert into public.companies(name)
select 'Benchmark Co ' || g from generate_series(3,100) g;

insert into public.jobs(company_id,title,location,posted_date,description,is_active)
select (g % 100) + 1, 'Software Engineer ' || g, 'Austin, TX', current_date,
  'Build reliable distributed systems and cloud services.', true
from generate_series(1,100000) g;

analyze public.jobs;
analyze public.companies;

do $$
declare durations numeric[] := '{}'; recent_times numeric[] := '{}'; deep_times numeric[] := '{}';
  search_times numeric[] := '{}'; elapsed numeric; started timestamptz; response jsonb; query jsonb;
begin
  for i in 1..30 loop
    query := case i % 3
      when 0 then '{"page":1,"pageSize":20,"sort":"recent"}'::jsonb
      when 1 then '{"page":100,"pageSize":20,"sort":"recent"}'::jsonb
      else '{"page":1,"pageSize":20,"sort":"company","q":"engineer"}'::jsonb end;
    started := clock_timestamp();
    response := public.search_jobs(query);
    elapsed := extract(epoch from clock_timestamp()-started)*1000;
    durations := array_append(durations, elapsed);
    if i % 3 = 0 then recent_times := array_append(recent_times, elapsed);
    elsif i % 3 = 1 then deep_times := array_append(deep_times, elapsed);
    else search_times := array_append(search_times, elapsed); end if;
    if (response->>'total')::integer < 100000 then
      raise exception 'Benchmark count too small';
    end if;
    if jsonb_array_length(response->'jobs') > 20 or octet_length(response::text) > 128000 then
      raise exception 'Benchmark page payload exceeded its bound';
    end if;
  end loop;
  raise notice 'Local 100-company, 100k-job SQL search p95: % ms',
    (select round((percentile_cont(0.95) within group(order by value))::numeric,1)
      from unnest(durations) value);
  raise notice 'Per query p95 recent %, page 100 %, company+search % ms',
    (select round((percentile_cont(0.95) within group(order by value))::numeric,1)
      from unnest(recent_times) value),
    (select round((percentile_cont(0.95) within group(order by value))::numeric,1)
      from unnest(deep_times) value),
    (select round((percentile_cont(0.95) within group(order by value))::numeric,1)
      from unnest(search_times) value);
end $$;
