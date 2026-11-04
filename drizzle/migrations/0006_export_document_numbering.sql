CREATE OR REPLACE FUNCTION public.export_document_numbering()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Read-only copy of document counters for the one-time "أبو الياس" phone export.
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid())
     OR NOT COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(), false) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'document_counters', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.document_counters c), '[]'::jsonb),
    'document_number_registry', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.document_number_registry r), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.export_document_numbering() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_document_numbering() TO authenticated;