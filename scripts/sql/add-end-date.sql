-- Add end_date column to jobs table for application deadlines/closing dates.
-- Most career APIs don't expose this, so it defaults to NULL (displayed as "N/A").
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS end_date date;
