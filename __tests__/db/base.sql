do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter role service_role with bypassrls;
grant usage on schema public to anon, authenticated, service_role;
\i scripts/sql/0000-base-schema.sql
grant select on public.jobs, public.companies to anon, authenticated;
insert into public.companies(name) values ('Amazon'),('Meta');
insert into public.jobs(company_id,external_job_id,title,description,posted_date,security_clearance,h1b_sponsorship)
values (1,'amazon_1','Engineer','No visa sponsorship. Must hold active TS/SCI clearance.',current_date,'Yes','No');
