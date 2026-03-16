-- ============================================================
-- Job Lifecycle: Auto-delete rows older than 14 days
-- ============================================================
-- Option 1: pg_cron (recommended if available on your Supabase plan)
-- Option 2: Call the function manually or from scraper scripts
-- ============================================================

-- 1. Create the cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_jobs(retention_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM jobs
    WHERE posted_date < (CURRENT_DATE - retention_days)
    RETURNING 1;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE 'Deleted % jobs older than % days', deleted_count, retention_days;
    RETURN deleted_count;
END;
$$;

-- 2. Schedule with pg_cron (run daily at 3:00 AM UTC)
--    NOTE: pg_cron must be enabled in your Supabase project
--    Go to: Database > Extensions > enable pg_cron
--
-- SELECT cron.schedule(
--     'cleanup-old-jobs',          -- job name
--     '0 3 * * *',                 -- daily at 3 AM UTC
--     $$SELECT cleanup_old_jobs(14)$$
-- );
--
-- To verify the cron job:
-- SELECT * FROM cron.job;
--
-- To remove the cron job:
-- SELECT cron.unschedule('cleanup-old-jobs');
