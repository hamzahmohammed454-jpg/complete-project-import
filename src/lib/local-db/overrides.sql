-- Applied after schema.sql in the offline "أبو الياس" app only.
-- A single phone has no remote licensing: writes are always allowed and the
-- device owner is the platform owner. Every other money rule stays identical.
CREATE OR REPLACE FUNCTION public.license_writes_allowed() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
--@@
CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL AND public.staff_session_unlocked() AND public.is_admin(auth.uid()) $$;
--@@
CREATE OR REPLACE FUNCTION public.license_status() RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.require_staff_session();
  RETURN jsonb_build_object('id', 1, 'company_name', 'أبو الياس', 'activated', true, 'licensed_until', NULL,
    'trial_started_at', NULL, 'trial_ends_at', NULL, 'can_write', true, 'is_owner', true, 'local', true);
END $$;
