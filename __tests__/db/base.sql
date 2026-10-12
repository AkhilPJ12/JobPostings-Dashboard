do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter role service_role with bypassrls;
create table public.companies (
 id bigint generated always as identity primary key,
 name text not null unique, color text, "Company_icon" text,
 is_active boolean not null default true, careers_url text, careers_url_1 text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.jobs (
 id bigint generated always as identity primary key,
 company_id bigint not null references public.companies(id),
 external_job_id text unique, title text not null, location text,
 location_type text, department text, employment_type text, posted_date date,
 end_date date, description text, summary text, required_qualifications text[],
 preferred_qualifications text[], pay_range text, security_clearance text,
 h1b_sponsorship text, job_url text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant usage on schema public to anon, authenticated, service_role;
grant all on public.jobs, public.companies to service_role;
grant select on public.jobs, public.companies to anon, authenticated;
insert into public.companies(name) values ('Amazon'),('Meta');
insert into public.jobs(company_id,external_job_id,title,description,posted_date,security_clearance,h1b_sponsorship)
values (1,'amazon_1','Engineer','No visa sponsorship. Must hold active TS/SCI clearance.',current_date,'Yes','No');
