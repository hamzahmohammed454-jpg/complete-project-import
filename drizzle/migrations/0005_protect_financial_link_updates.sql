CREATE OR REPLACE FUNCTION public.guard_managed_financial_entry() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE src text; target_src text;
BEGIN
 IF TG_TABLE_NAME='entries' THEN
  IF TG_OP='INSERT' THEN IF NEW.posting_source IS NOT NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'الترحيل المالي ينفذ من أمر الترحيل فقط'; END IF; RETURN NEW; END IF;
  src:=OLD.posting_source;
 ELSE
  IF TG_OP<>'DELETE' THEN SELECT posting_source INTO target_src FROM public.entries WHERE id=NEW.entry_id; END IF;
  IF TG_OP='INSERT' THEN IF (target_src IS NOT NULL OR NEW.settlement_mirror) AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'طرف القيد المرحل محمي'; END IF; RETURN NEW; END IF;
  SELECT posting_source INTO src FROM public.entries WHERE id=OLD.entry_id;
  IF TG_OP='UPDATE' AND target_src IS NOT NULL THEN RAISE EXCEPTION 'لا يمكن نقل طرف إلى قيد مرحل'; END IF;
 END IF;
 IF src IS NOT NULL THEN RAISE EXCEPTION 'القيد المرحل لا يعدل ولا يحذف؛ استخدم إلغاء الترحيل'; END IF;
 IF TG_TABLE_NAME='entries' AND TG_OP='UPDATE' AND (NEW.posting_source IS DISTINCT FROM OLD.posting_source OR NEW.posting_source_id IS DISTINCT FROM OLD.posting_source_id OR NEW.posting_reversal_of IS DISTINCT FROM OLD.posting_reversal_of) THEN RAISE EXCEPTION 'مصدر الترحيل محمي'; END IF;
 IF TG_TABLE_NAME='entries_details' AND TG_OP='UPDATE' AND NEW.settlement_mirror IS DISTINCT FROM OLD.settlement_mirror THEN RAISE EXCEPTION 'طرف التسوية محمي'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_inventory_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id bigint; v_void timestamptz;
BEGIN
 IF TG_TABLE_NAME='funds_inventory' THEN
  v_id:=OLD.id; v_void:=OLD.voided_at;
  IF TG_OP='UPDATE' AND NEW.voided_at IS DISTINCT FROM OLD.voided_at AND (NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/funds-inventory','delete')) THEN RAISE EXCEPTION 'إلغاء المحضر يحتاج صلاحية الحذف'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.inventory_id IS DISTINCT FROM OLD.inventory_id THEN RAISE EXCEPTION 'لا يمكن نقل تفاصيل الجرد إلى محضر آخر'; END IF;
  IF TG_OP='INSERT' THEN v_id:=NEW.inventory_id; ELSE v_id:=OLD.inventory_id; END IF;
  PERFORM 1 FROM public.funds_inventory WHERE id=v_id FOR UPDATE;
  SELECT voided_at INTO v_void FROM public.funds_inventory WHERE id=v_id;
 END IF;
 IF v_void IS NOT NULL THEN RAISE EXCEPTION 'محضر الجرد ملغي'; END IF;
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.inventory_postings WHERE inventory_id=v_id) THEN RAISE EXCEPTION 'محضر له ترحيلات محفوظة؛ استخدم حذف المحضر من شاشة الجرد'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_postings WHERE inventory_id=v_id AND reversal_entry_id IS NULL) THEN RAISE EXCEPTION 'ألغ ترحيل فارق الجرد قبل التعديل أو الحذف'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;