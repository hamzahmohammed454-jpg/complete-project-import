-- Schema v2 (also applied to the cloud): staff with the transfers "delete"
-- permission can delete a saved outgoing transfer that is still pending.
-- Box movements are removed by ops_to_box, the commission entry is reversed by
-- post_operation_commission, and account-funded money gets an append-only
-- reversal, so no balance keeps a trace of the deleted transfer.
CREATE OR REPLACE FUNCTION public.validate_transfer_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d public.staff_work_defaults;
BEGIN
 IF TG_OP='DELETE' THEN
  IF auth.uid() IS NOT NULL AND COALESCE(current_setting('app.transfer_delete',true),'') IS DISTINCT FROM (CASE WHEN TG_TABLE_NAME='outgoing_transfers' THEN OLD.id ELSE (to_jsonb(OLD)->>'internal_outgoing_id')::bigint END)::text THEN RAISE EXCEPTION 'TRANSFER_DELETE_FORBIDDEN'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.amount<=0 OR NEW.branch_commission<0 THEN RAISE EXCEPTION 'INVALID_TRANSFER_AMOUNT'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.delivered OR NEW.canceled OR NEW.exported_at IS NOT NULL THEN RAISE EXCEPTION 'INVALID_INITIAL_TRANSFER_STATE'; END IF; NEW.created_by:=auth.uid();
 END IF;
 IF NEW.payment_method='account' THEN
  IF NEW.customer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=NEW.customer_id AND account_id IS NOT NULL) THEN RAISE EXCEPTION 'TRANSFER_CUSTOMER_REQUIRED'; END IF; NEW.box_id:=NULL;
 ELSIF NEW.payment_method='check' THEN NEW.box_id:=NULL;
 ELSIF TG_TABLE_NAME='outgoing_transfers' OR NEW.delivered THEN IF NEW.box_id IS NULL THEN RAISE EXCEPTION 'TRANSFER_BOX_REQUIRED'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.canceled AND NOT NEW.canceled OR OLD.delivered AND NOT NEW.delivered THEN RAISE EXCEPTION 'TRANSFER_REVERSE_FORBIDDEN'; END IF;
  IF NEW.delivered AND NEW.canceled THEN RAISE EXCEPTION 'INVALID_TRANSFER_STATE'; END IF;
  IF ROW(NEW.amount,NEW.currency_id,NEW.branch_commission,NEW.commission_currency_id,NEW.agent_id,NEW.the_date) IS DISTINCT FROM ROW(OLD.amount,OLD.currency_id,OLD.branch_commission,OLD.commission_currency_id,OLD.agent_id,OLD.the_date) THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
  IF (TG_TABLE_NAME='outgoing_transfers' OR OLD.delivered) AND ROW(NEW.payment_method,NEW.customer_id,NEW.box_id) IS DISTINCT FROM ROW(OLD.payment_method,OLD.customer_id,OLD.box_id) THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
  IF OLD.exported_at IS NOT NULL AND ROW(NEW.exported_at,NEW.export_agent_id) IS DISTINCT FROM ROW(OLD.exported_at,OLD.export_agent_id) THEN RAISE EXCEPTION 'TRANSFER_EXPORT_IMMUTABLE'; END IF;
  IF NEW.exported_at IS NOT NULL AND OLD.exported_at IS NULL THEN
   IF NEW.canceled OR NEW.delivered OR NEW.export_agent_id IS NULL OR NEW.export_agent_id IS DISTINCT FROM NEW.agent_id THEN RAISE EXCEPTION 'TRANSFER_EXPORT_AGENT_REQUIRED'; END IF;
   NEW.exported_at:=now(); NEW.exported_by:=auth.uid();
  END IF;
 END IF;
 SELECT * INTO d FROM public.staff_work_defaults WHERE user_id=auth.uid();
 IF NEW.payment_method='cash' AND d.enforce_box AND (TG_TABLE_NAME='outgoing_transfers' OR NEW.delivered) AND NEW.box_id IS DISTINCT FROM d.box_id THEN RAISE EXCEPTION 'STAFF_BOX_RESTRICTED'; END IF;
 RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.delete_outgoing_transfer(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.outgoing_transfers; ref text;
BEGIN
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT public.license_writes_allowed() OR NOT public.has_screen_permission('/transfers','delete') THEN
  RAISE EXCEPTION 'لا تملك صلاحية حذف الحوالة' USING ERRCODE='42501';
 END IF;
 SELECT * INTO t FROM public.outgoing_transfers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الحوالة غير موجودة'; END IF;
 IF t.delivered THEN RAISE EXCEPTION 'لا تُحذف حوالة مسلّمة'; END IF;
 IF t.exported_at IS NOT NULL THEN RAISE EXCEPTION 'لا تُحذف حوالة مصدّرة للوكيل'; END IF;
 IF t.check_id IS NOT NULL THEN RAISE EXCEPTION 'لا تُحذف حوالة مقبوضة بشيك'; END IF;
 IF EXISTS(SELECT 1 FROM public.incoming_transfers WHERE internal_outgoing_id=p_id AND delivered) THEN RAISE EXCEPTION 'الحوالة الداخلية صُرفت ولا تُحذف'; END IF;
 PERFORM set_config('app.transfer_delete', p_id::text, true);
 IF t.payment_method='account' AND NOT t.canceled THEN
  ref:='حوالة صادرة رقم '||COALESCE(t.transfer_number,t.id);
  INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,credit,the_date,notes,created_by) VALUES(t.customer_id,'outgoing_transfers',t.id,t.currency_id,t.amount,public.aden_date(now()),'حذف '||ref,auth.uid());
  IF t.branch_commission>0 THEN INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,credit,the_date,notes,created_by) VALUES(t.customer_id,'outgoing_transfers',t.id,COALESCE(t.commission_currency_id,t.currency_id),t.branch_commission,public.aden_date(now()),'رد عمولة '||ref,auth.uid()); END IF;
 END IF;
 DELETE FROM public.incoming_transfers WHERE internal_outgoing_id=p_id;
 DELETE FROM public.outgoing_transfers WHERE id=p_id;
 PERFORM set_config('app.transfer_delete', '', true);
END $function$;
--@@
REVOKE ALL ON FUNCTION public.delete_outgoing_transfer(bigint) FROM PUBLIC, anon;
--@@
GRANT EXECUTE ON FUNCTION public.delete_outgoing_transfer(bigint) TO authenticated;
