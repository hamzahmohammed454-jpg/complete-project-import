ALTER TABLE public.wa_items
  ADD COLUMN IF NOT EXISTS posted_table text CHECK (posted_table IN ('incoming_transfers','outgoing_transfers')),
  ADD COLUMN IF NOT EXISTS posted_id bigint,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS wa_items_posted_transfer_uniq ON public.wa_items (posted_table, posted_id) WHERE posted_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_wa_item_transfer(p_item bigint, p_table text, p_transfer bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE found_transfer boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
     OR NOT COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(), false) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_table NOT IN ('incoming_transfers','outgoing_transfers') THEN RAISE EXCEPTION 'BAD_TABLE'; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', p_table) INTO found_transfer USING p_transfer;
  IF NOT found_transfer THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  UPDATE public.wa_items
     SET posted_table = p_table, posted_id = p_transfer, posted_at = now(), posted_by = auth.uid(),
         status = CASE WHEN status = 'pending' THEN 'approved' ELSE status END,
         decided_by = CASE WHEN status = 'pending' THEN auth.uid() ELSE decided_by END,
         decided_at = CASE WHEN status = 'pending' THEN now() ELSE decided_at END,
         decided_via = CASE WHEN status = 'pending' THEN 'posted' ELSE decided_via END
   WHERE id = p_item AND posted_id IS NULL AND status IN ('pending','approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'WA_ITEM_ALREADY_POSTED'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.link_wa_item_transfer(bigint, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_wa_item_transfer(bigint, text, bigint) TO authenticated;