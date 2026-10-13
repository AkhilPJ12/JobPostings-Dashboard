-- Baseline for a new Supabase project. Existing installations keep their rows
-- and columns; apply before the additive dated migrations.
create table if not exists public.companies (
  id bigint generated always as identity primary key,
  name text not null unique,
  logo_url text,
  "Company_icon" text,
  website_url text,
  careers_url text,
  careers_url_1 text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  external_job_id text unique,
  title text not null,
  location text,
  location_type text,
  department text,
  employment_type text,
  posted_date date,
  end_date date,
  description text,
  summary text,
  required_qualifications text[],
  preferred_qualifications text[],
  pay_range text,
  security_clearance text,
  h1b_sponsorship text,
  job_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public clients receive only curated RPC access in the architecture migration.
grant all on public.companies, public.jobs to service_role;
grant usage, select on all sequences in schema public to service_role;
