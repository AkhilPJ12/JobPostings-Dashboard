-- ============================================================
-- Job Lifecycle: Soft-delete active rows older than 14 days, then
-- permanently purge rows that have been inactive for a longer window.
-- ============================================================
-- Option 1: pg_cron (recommended if available on your Supabase plan)
-- Option 2: Call the function manually or from scraper scripts
-- ============================================================

-- 1. Create the soft-delete cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_jobs(retention_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    deactivated_count integer;
BEGIN
    UPDATE public.jobs
    SET is_active = false,
        updated_at = now()
    WHERE is_active = true
      AND posted_date < (CURRENT_DATE - (retention_days - 1));

    GET DIAGNOSTICS deactivated_count = ROW_COUNT;

    RAISE NOTICE 'Deactivated % jobs older than % days', deactivated_count, retention_days;
    RETURN deactivated_count;
END;
$$;

-- 2. Create the inactive-row purge function
CREATE OR REPLACE FUNCTION purge_inactive_jobs(retention_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    purged_count integer;
BEGIN
    DELETE FROM public.jobs
    WHERE is_active = false
      AND updated_at < (now() - make_interval(days => retention_days));

    GET DIAGNOSTICS purged_count = ROW_COUNT;

    RAISE NOTICE 'Purged % inactive jobs older than % days', purged_count, retention_days;
    RETURN purged_count;
END;
$$;

-- 3. Schedule with pg_cron (run daily at 3:00 AM UTC)
--    NOTE: pg_cron must be enabled in your Supabase project
--    Go to: Database > Extensions > enable pg_cron
--
-- SELECT cron.schedule(
--     'cleanup-old-jobs',          -- job name
--     '0 3 * * *',                 -- daily at 3 AM UTC
--     $$SELECT cleanup_old_jobs(14); SELECT purge_inactive_jobs(180);$$
-- );
--
-- To verify the cron job:
-- SELECT * FROM cron.job;
--
-- To remove the cron job:
-- SELECT cron.unschedule('cleanup-old-jobs');
