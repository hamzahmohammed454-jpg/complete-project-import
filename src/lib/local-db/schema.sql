SET check_function_bodies = off;
--@@
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'teller', 'accountant');
--@@
CREATE SEQUENCE public.account_groups_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.accounts_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.activity_log_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.agent_settlements_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.agents_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.areas_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.bank_accounts_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.banks_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.blacklist_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.box_closings_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.box_movements_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.boxes_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.branches_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.buy_currencies_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.cash_vouchers_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.check_books_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.checks_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.classifications_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.commission_rules_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.cost_centers_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.countries_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.currencies_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.currency_prices_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.currency_rate_history_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.customer_transfer_movements_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.customers_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.entries_details_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.entries_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.financial_years_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.forbidden_texts_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.funds_inventory_details_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.funds_inventory_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.governorates_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.group_screen_permissions_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.incoming_transfers_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.inventory_postings_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.journal_vouchers_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.loop_entries_details_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.loop_entries_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.loop_entries_runs_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.outgoing_transfers_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.period_closings_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.receiver_cards_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.sell_currencies_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.system_settings_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.transfer_entities_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.transfer_purposes_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.transfer_requests_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.user_group_members_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.user_groups_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.user_screen_permissions_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE SEQUENCE public.withdrawal_requests_id_seq AS bigint START 1 INCREMENT 1;
--@@
CREATE OR REPLACE FUNCTION public.accounts_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = 0 THEN
    NEW.account_number := public.next_account_number(NEW.father_number);
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.accounts_guard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE father_number = OLD.account_number) THEN
    RAISE EXCEPTION 'HAS_CHILDREN' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.aden_date(ts timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT (ts AT TIME ZONE 'Asia/Aden')::date $function$;
--@@
CREATE OR REPLACE FUNCTION public.apply_activation_code(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ DECLARE c public.activation_codes; BEGIN PERFORM public.require_staff_session(); IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE='42501'; END IF; IF p_code IS NULL OR upper(trim(p_code)) !~ '^[0-9A-F]{36}$' THEN RAISE EXCEPTION 'INVALID_ACTIVATION_CODE'; END IF; SELECT * INTO c FROM public.activation_codes WHERE code_hash=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex') FOR UPDATE; IF NOT FOUND OR c.used_at IS NOT NULL OR c.revoked_at IS NOT NULL OR (c.licensed_until IS NOT NULL AND c.licensed_until<=now()) THEN RAISE EXCEPTION 'INVALID_ACTIVATION_CODE'; END IF; UPDATE public.installation_license SET activated=true,licensed_until=c.licensed_until,activated_by=auth.uid(),activated_at=now() WHERE id=c.installation_id; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ACTIVATION_CODE'; END IF; UPDATE public.activation_codes SET used_at=now(),used_by=auth.uid() WHERE id=c.id; END $function$;
--@@
CREATE OR REPLACE FUNCTION public.assign_document_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE scope_value text; n bigint;
BEGIN
 scope_value:=public.document_scope(TG_TABLE_NAME,to_jsonb(NEW));
 IF TG_OP='UPDATE' THEN IF NEW.document_number IS DISTINCT FROM OLD.document_number OR scope_value IS DISTINCT FROM public.document_scope(TG_TABLE_NAME,to_jsonb(OLD)) THEN RAISE EXCEPTION 'DOCUMENT_NUMBER_IMMUTABLE'; END IF; RETURN NEW; END IF;
 IF TG_TABLE_NAME='cash_vouchers' AND to_jsonb(NEW)->>'batch_id' IS NOT NULL THEN
  IF current_setting('app.voucher_batch',true) IS DISTINCT FROM (to_jsonb(NEW)->>'batch_id') THEN RAISE EXCEPTION 'يجب حفظ السند متعدد العملات كاملاً'; END IF;
  SELECT v.document_number INTO n FROM public.cash_vouchers v WHERE v.batch_id=(to_jsonb(NEW)->>'batch_id')::uuid AND v.batch_position=1;
  IF n IS NOT NULL THEN NEW.document_number:=n; RETURN NEW; END IF;
 END IF;
 INSERT INTO public.document_counters(scope,last_number) VALUES(scope_value,1) ON CONFLICT(scope) DO UPDATE SET last_number=document_counters.last_number+1 RETURNING last_number INTO n;
 NEW.document_number:=n;
 INSERT INTO public.document_number_registry(scope,number,source_table,source_id) VALUES(scope_value,n,TG_TABLE_NAME,NEW.id);
 RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO activity_log (user_id, action, target, details)
  VALUES (auth.uid(), CASE TG_OP WHEN 'INSERT' THEN 'إضافة' WHEN 'UPDATE' THEN 'تعديل' ELSE 'حذف' END,
          TG_TABLE_NAME, CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('before', to_jsonb(OLD), 'after', r) ELSE r END);
  RETURN NULL;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.box_day_summary(p_date date)
 RETURNS TABLE(box_id bigint, currency_id bigint, opening numeric, receipts numeric, payments numeric, closing numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT m.box_id, m.currency_id,
    COALESCE(SUM(CASE WHEN aden_date(m.created_at) < p_date THEN CASE WHEN m.movement_type = 'صرف' THEN -m.amount ELSE m.amount END END), 0),
    COALESCE(SUM(CASE WHEN aden_date(m.created_at) = p_date AND m.movement_type <> 'صرف' THEN m.amount END), 0),
    COALESCE(SUM(CASE WHEN aden_date(m.created_at) = p_date AND m.movement_type = 'صرف' THEN m.amount END), 0),
    COALESCE(SUM(CASE WHEN m.movement_type = 'صرف' THEN -m.amount ELSE m.amount END), 0)
  FROM box_movements m
  WHERE aden_date(m.created_at) <= p_date
  GROUP BY m.box_id, m.currency_id
$function$;
--@@
CREATE OR REPLACE FUNCTION public.boxes_guard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM box_movements WHERE box_id = OLD.id)
     OR EXISTS (SELECT 1 FROM box_closings WHERE box_id = OLD.id) THEN
    RAISE EXCEPTION 'IN_USE' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.can_access_transfer_evidence(p_path text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE parts text[]:=string_to_array(p_path,'/'); transfer_id bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_screen_permission('/transfers',p_action) THEN RETURN false; END IF;
 IF array_length(parts,1)<>3 OR parts[1] NOT IN ('incoming','outgoing') OR parts[2] !~ '^[0-9]+$' THEN RETURN false; END IF;
 transfer_id:=parts[2]::bigint;
 IF p_action IN ('create','update') AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'teller')) THEN RETURN false; END IF;
 IF p_action='delete' AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN RETURN false; END IF;
 IF parts[1]='incoming' THEN RETURN EXISTS(SELECT 1 FROM incoming_transfers WHERE id=transfer_id); END IF;
 RETURN EXISTS(SELECT 1 FROM outgoing_transfers WHERE id=transfer_id);
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.cash_voucher_to_box()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM box_movements WHERE source_type = 'cash_vouchers' AND source_id = OLD.id;
    RETURN OLD;
  END IF;
  ref := 'سند ' || NEW.voucher_type || ' رقم ' || COALESCE(NEW.the_number, NEW.id);
  PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount,
    CASE WHEN NEW.voucher_type = 'صرف' THEN 'صرف' ELSE 'قبض' END,
    ref, 'cash_vouchers', NEW.id);
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.cash_vouchers_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('cash_vouchers'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM cash_vouchers;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.check_book_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_from bigint; v_to bigint; v_num bigint;
BEGIN
  IF NEW.book_id IS NULL THEN RETURN NEW; END IF;
  SELECT from_number, to_number INTO v_from, v_to FROM public.check_books WHERE id = NEW.book_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'دفتر الشيكات غير موجود'; END IF;
  BEGIN
    v_num := btrim(NEW.check_number)::bigint;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'رقم الشيك يجب أن يكون رقمًا صحيحًا ضمن الدفتر';
  END;
  IF v_num < v_from OR v_num > v_to THEN
    RAISE EXCEPTION 'رقم الشيك % خارج نطاق الدفتر (% - %)', NEW.check_number, v_from, v_to;
  END IF;
  IF EXISTS (SELECT 1 FROM public.checks WHERE book_id = NEW.book_id AND check_number = NEW.check_number AND id <> COALESCE(NEW.id, -1)) THEN
    RAISE EXCEPTION 'رقم الشيك % مستخدم مسبقًا من هذا الدفتر', NEW.check_number;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.check_to_box()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM box_movements WHERE source_type = 'checks' AND source_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.status = 'محصل' AND OLD.status <> 'محصل' THEN
    IF NEW.box_id IS NULL THEN
      RAISE EXCEPTION 'اختر الصندوق قبل تحصيل الشيك';
    END IF;
    ref := 'تحصيل شيك ' || NEW.check_type || ' رقم ' || COALESCE(NEW.the_number, NEW.id) || ' (شيك ' || NEW.check_number || ')';
    PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount,
      CASE WHEN NEW.check_type = 'وارد' THEN 'قبض' ELSE 'صرف' END,
      ref, 'checks', NEW.id);
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.checks_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('checks'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM checks;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.close_period(p_type text, p_from date, p_to date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint; v_entry_id bigint; v_profit_acc bigint;
  v_cur record; v_details jsonb; v_rev numeric; v_exp numeric; v_net numeric;
BEGIN
  PERFORM public.require_staff_session();
  IF NOT public.has_screen_permission('/period-closing','create') THEN RAISE EXCEPTION 'CLOSING_FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(78210391);
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'الإقفال المحاسبي للمدير فقط';
  END IF;
  IF p_type NOT IN ('يومي','أسبوعي','شهري','سنوي') THEN RAISE EXCEPTION 'نوع فترة غير صحيح'; END IF;
  IF p_from > p_to THEN RAISE EXCEPTION 'بداية الفترة بعد نهايتها'; END IF;
  IF p_to > current_date THEN RAISE EXCEPTION 'لا يمكن إقفال فترة مستقبلية'; END IF;
  IF EXISTS (SELECT 1 FROM public.period_closings WHERE daterange(from_date,to_date,'[]') && daterange(p_from,p_to,'[]')) THEN
    RAISE EXCEPTION 'توجد فترة مقفلة متداخلة مع هذه الفترة';
  END IF;

  INSERT INTO public.period_closings (period_type, from_date, to_date, closed_by)
  VALUES (p_type, p_from, p_to, auth.uid()) RETURNING id INTO v_id;

  PERFORM set_config('app.period_closing','on',true);

  SELECT a.id INTO v_profit_acc FROM public.accounts a
  WHERE a.father_number = 3 ORDER BY a.account_number LIMIT 1;

  FOR v_cur IN
    SELECT d.currency_id FROM public.entries e
    JOIN public.entries_details d ON d.entry_id = e.id
    WHERE e.the_date BETWEEN p_from AND p_to AND d.currency_id IS NOT NULL
    GROUP BY d.currency_id
  LOOP
    WITH RECURSIVE rev_tree AS (
      SELECT id, account_number FROM public.accounts WHERE account_number = 4 AND father_number IS NULL
      UNION ALL SELECT a.id, a.account_number FROM public.accounts a JOIN rev_tree t ON a.father_number = t.account_number
    ), exp_tree AS (
      SELECT id, account_number FROM public.accounts WHERE account_number = 5 AND father_number IS NULL
      UNION ALL SELECT a.id, a.account_number FROM public.accounts a JOIN exp_tree t ON a.father_number = t.account_number
    ), sums AS (
      SELECT d.account_id, SUM(CASE WHEN d.side='مدين' THEN d.amount ELSE -d.amount END) AS net
      FROM public.entries e JOIN public.entries_details d ON d.entry_id = e.id
      WHERE e.the_date BETWEEN p_from AND p_to AND d.currency_id = v_cur.currency_id
      GROUP BY d.account_id
    )
    SELECT COALESCE(jsonb_agg(x.line), '[]'::jsonb), COALESCE(SUM(x.rev_bal), 0), COALESCE(SUM(x.exp_bal), 0)
    INTO v_details, v_rev, v_exp
    FROM (
      SELECT -s.net AS rev_bal, 0::numeric AS exp_bal,
             jsonb_build_object('side','مدين','amount',-s.net,'currency_id',v_cur.currency_id,'account_id',s.account_id,'notes','إقفال إيرادات الفترة') AS line
      FROM sums s WHERE s.account_id IN (SELECT id FROM rev_tree) AND s.net < 0
      UNION ALL
      SELECT 0::numeric, s.net,
             jsonb_build_object('side','دائن','amount',s.net,'currency_id',v_cur.currency_id,'account_id',s.account_id,'notes','إقفال مصروفات الفترة')
      FROM sums s WHERE s.account_id IN (SELECT id FROM exp_tree) AND s.net > 0
    ) x;

    v_net := v_rev - v_exp;
    IF v_profit_acc IS NOT NULL AND (v_rev > 0 OR v_exp > 0) THEN
      IF v_net <> 0 THEN
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'side', CASE WHEN v_net >= 0 THEN 'دائن' ELSE 'مدين' END,
        'amount', abs(v_net), 'currency_id', v_cur.currency_id,
        'account_id', v_profit_acc, 'notes', 'صافي نتيجة الفترة'));
      END IF;
      SELECT public.create_balanced_entry(
        COALESCE((SELECT max(entry_number) FROM public.entries),0)+1,
        p_to, 'قيد إقفال ' || p_type || ' ' || p_from || ' — ' || p_to, NULL, v_details)
      INTO v_entry_id;
    END IF;
  END LOOP;

  UPDATE public.period_closings SET entry_id = v_entry_id WHERE id = v_id;
  PERFORM set_config('app.period_closing','off',true);
  RETURN v_id;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.closing_compute_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT COALESCE(SUM(CASE WHEN movement_type = 'صرف' THEN -amount ELSE amount END), 0)
    INTO NEW.system_balance
    FROM box_movements
   WHERE box_id = NEW.box_id AND currency_id = NEW.currency_id
     AND aden_date(created_at) <= NEW.close_date;
  NEW.closed_by := auth.uid();
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.cost_centers_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('cost_centers'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM cost_centers;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.create_balanced_entry(p_entry_number bigint, p_the_date date, p_notes text, p_branch_id bigint, p_details jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_entry_id bigint;
BEGIN
 PERFORM public.require_staff_session();
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'teller') OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/entries','create') THEN RAISE EXCEPTION 'ENTRY_CREATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_details IS NULL OR jsonb_typeof(p_details)<>'array' THEN RAISE EXCEPTION 'INVALID_ENTRY_DETAILS'; END IF;
 IF jsonb_array_length(p_details)<2 OR p_the_date IS NULL THEN RAISE EXCEPTION 'INVALID_ENTRY_DETAILS'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_details) d WHERE d->>'side' IS NULL OR d->>'side' NOT IN ('مدين','دائن') OR NULLIF(d->>'currency_id','') IS NULL OR NULLIF(d->>'account_id','') IS NULL OR NULLIF(d->>'amount','') IS NULL OR lower(d->>'amount') IN ('nan','infinity','-infinity') OR (d->>'amount')::numeric<=0) THEN RAISE EXCEPTION 'INVALID_ENTRY_DETAILS'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_details) d GROUP BY d->>'currency_id' HAVING sum(CASE WHEN d->>'side'='مدين' THEN round((d->>'amount')::numeric,4) ELSE -round((d->>'amount')::numeric,4) END)<>0 OR sum(CASE WHEN d->>'side'='مدين' THEN round((d->>'amount')::numeric,4) ELSE 0 END)<=0) THEN RAISE EXCEPTION 'القيد غير متوازن لكل عملة'; END IF;
 INSERT INTO public.entries(entry_number,the_date,notes,branch_id,created_by) VALUES(p_entry_number,p_the_date,p_notes,p_branch_id,auth.uid()) RETURNING id INTO v_entry_id;
 INSERT INTO public.entries_details(entry_id,entry_index,side,amount,currency_id,account_id,notes)
 SELECT v_entry_id,ord::bigint,d->>'side',round((d->>'amount')::numeric,4),(d->>'currency_id')::bigint,(d->>'account_id')::bigint,d->>'notes' FROM jsonb_array_elements(p_details) WITH ORDINALITY AS t(d,ord);
 RETURN v_entry_id;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.create_multi_cash_voucher(p_batch uuid, p_type text, p_customer bigint, p_name text, p_box bigint, p_date date, p_notes text, p_lines jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE l jsonb; pos integer:=0; first_id bigint; row_id bigint; existing bigint; expected integer;
BEGIN
 p_customer:=NULLIF(p_customer,0);
 PERFORM public.require_staff_session();
 IF NOT public.staff_active() OR NOT public.has_screen_permission('/vouchers','create') THEN RAISE EXCEPTION 'لا تملك صلاحية إنشاء السند'; END IF;
 IF p_batch IS NULL OR p_type NOT IN ('قبض','صرف','إيداع') OR p_date IS NULL OR p_box IS NULL OR p_box<=0 OR (p_customer IS NULL AND NULLIF(btrim(p_name),'') IS NULL) THEN RAISE EXCEPTION 'أكمل بيانات السند والصندوق'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'أدخل العملات والمبالغ'; END IF;
 expected:=jsonb_array_length(p_lines);
 IF expected<2 THEN RAISE EXCEPTION 'أدخل عملتين على الأقل'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE (x->>'amount')::numeric<=0 OR (x->>'amount') IN ('NaN','Infinity','-Infinity') OR x->>'amount' IS NULL OR x->>'currency_id' IS NULL) THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;
 IF (SELECT count(DISTINCT (x->>'currency_id')::bigint) FROM jsonb_array_elements(p_lines) x)<>expected THEN RAISE EXCEPTION 'اختر كل عملة مرة واحدة'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_batch::text,0));
 SELECT id INTO existing FROM public.cash_vouchers WHERE batch_id=p_batch AND batch_position=1 AND created_by=auth.uid();
 IF existing IS NOT NULL THEN
  IF (SELECT count(*) FROM public.cash_vouchers WHERE batch_id=p_batch AND voucher_type=p_type AND customer_id IS NOT DISTINCT FROM p_customer AND cash_name IS NOT DISTINCT FROM CASE WHEN p_customer IS NULL THEN NULLIF(btrim(p_name),'') ELSE NULL END AND box_id=p_box AND the_date=p_date AND notes IS NOT DISTINCT FROM NULLIF(btrim(p_notes),''))<>expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE NOT EXISTS(SELECT 1 FROM public.cash_vouchers v WHERE v.batch_id=p_batch AND v.currency_id=(x->>'currency_id')::bigint AND v.amount=(x->>'amount')::numeric)) THEN RAISE EXCEPTION 'مرجع السند مستخدم لبيانات أخرى'; END IF;
  RETURN existing;
 END IF;
 PERFORM set_config('app.voucher_batch',p_batch::text,true);
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  pos:=pos+1;
  INSERT INTO public.cash_vouchers(voucher_type,customer_id,cash_name,amount,currency_id,box_id,the_date,notes,batch_id,batch_position) VALUES(p_type,p_customer,CASE WHEN p_customer IS NULL THEN NULLIF(btrim(p_name),'') ELSE NULL END,(l->>'amount')::numeric,(l->>'currency_id')::bigint,p_box,p_date,NULLIF(btrim(p_notes),''),p_batch,pos) RETURNING id INTO row_id;
  IF pos=1 THEN first_id:=row_id; END IF;
 END LOOP;
 PERFORM set_config('app.voucher_batch','',true);
 RETURN first_id;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.daily_operations_report(p_date date, p_branch bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/daily-report','view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 WITH operations AS (
 SELECT 'حوالة صادرة'::text kind, amount, currency_id, branch_commission commission, COALESCE(commission_currency_id,currency_id) commission_currency, created_by, branch_id, the_date FROM outgoing_transfers WHERE NOT canceled
 UNION ALL SELECT 'حوالة واردة', amount,currency_id,branch_commission,COALESCE(commission_currency_id,currency_id),created_by,branch_id,the_date FROM incoming_transfers WHERE NOT canceled AND internal_outgoing_id IS NULL
 UNION ALL SELECT 'شراء',amount,currency_id,COALESCE(commission,0),COALESCE(exchange_currency_id,currency_id),created_by,branch_id,the_date FROM buy_currencies
 UNION ALL SELECT 'بيع',amount,currency_id,COALESCE(commission,0),COALESCE(exchange_currency_id,currency_id),created_by,branch_id,the_date FROM sell_currencies
 ), day_ops AS (SELECT * FROM operations WHERE the_date=p_date AND (p_branch IS NULL OR branch_id=p_branch)), volume AS (
 SELECT kind,currency_id,COUNT(*) count,SUM(amount) amount FROM day_ops GROUP BY kind,currency_id
 ), commissions AS (SELECT commission_currency currency_id,SUM(commission) amount FROM day_ops GROUP BY commission_currency), staff AS (
 SELECT created_by,kind,COUNT(*) count FROM day_ops GROUP BY created_by,kind
 ), cash AS (
 SELECT m.box_id,m.currency_id,COALESCE(SUM(CASE WHEN public.aden_date(m.created_at)<p_date THEN CASE WHEN m.movement_type='صرف' THEN -m.amount ELSE m.amount END ELSE 0 END),0) opening,
 COALESCE(SUM(CASE WHEN public.aden_date(m.created_at)=p_date AND m.movement_type<>'صرف' THEN m.amount ELSE 0 END),0) receipts,
 COALESCE(SUM(CASE WHEN public.aden_date(m.created_at)=p_date AND m.movement_type='صرف' THEN m.amount ELSE 0 END),0) payments,
 SUM(CASE WHEN m.movement_type='صرف' THEN -m.amount ELSE m.amount END) closing
 FROM box_movements m LEFT JOIN boxes b ON b.id=m.box_id WHERE public.aden_date(m.created_at)<=p_date AND (p_branch IS NULL OR b.branch_id=p_branch) GROUP BY m.box_id,m.currency_id
 ), positions AS (SELECT currency_id,SUM(closing) amount FROM cash GROUP BY currency_id)
 SELECT jsonb_build_object(
 'volume',COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM volume v),'[]'::jsonb),
 'commissions',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM commissions c),'[]'::jsonb),
 'staff',COALESCE((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('name',(SELECT COALESCE(NULLIF(full_name,''),username) FROM profiles WHERE id=s.created_by))) FROM staff s),'[]'::jsonb),
 'cash',COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('box_name',(SELECT box_name FROM boxes WHERE id=c.box_id))) FROM cash c),'[]'::jsonb),
 'positions',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM positions p),'[]'::jsonb),
 'closings',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM box_closings c JOIN boxes b ON b.id=c.box_id WHERE c.close_date=p_date AND (p_branch IS NULL OR b.branch_id=p_branch)),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.decide_transfer_request(p_id bigint, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.transfer_requests%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'قرار الطلبات للمدير فقط';
  END IF;
  SELECT * INTO r FROM public.transfer_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF r.status <> 'معلق' THEN RAISE EXCEPTION 'الطلب حُسم مسبقًا'; END IF;

  IF NOT p_approve THEN
    UPDATE public.transfer_requests SET status = 'مرفوض', decided_by = auth.uid(), decided_at = now() WHERE id = p_id;
    RETURN;
  END IF;

  IF r.request_type = 'cancel' THEN
    IF r.transfer_kind = 'outgoing' THEN
      UPDATE public.outgoing_transfers SET canceled = true WHERE id = r.transfer_id;
    ELSE
      UPDATE public.incoming_transfers SET canceled = true WHERE id = r.transfer_id;
    END IF;
  ELSIF r.request_type = 'stop' THEN
    IF r.transfer_kind = 'outgoing' THEN
      UPDATE public.outgoing_transfers SET state = 'موقوفة' WHERE id = r.transfer_id;
    ELSE
      UPDATE public.incoming_transfers SET state = 'موقوفة' WHERE id = r.transfer_id;
    END IF;
  ELSIF r.request_type = 'modify' THEN
    IF r.transfer_kind = 'outgoing' THEN
      UPDATE public.outgoing_transfers SET
        receiver_name = COALESCE(r.payload->>'receiver_name', receiver_name),
        receiver_phone = COALESCE(r.payload->>'receiver_phone', receiver_phone),
        sender_name = COALESCE(r.payload->>'sender_name', sender_name),
        sender_phone = COALESCE(r.payload->>'sender_phone', sender_phone),
        notes = COALESCE(r.payload->>'notes', notes)
      WHERE id = r.transfer_id;
    ELSE
      UPDATE public.incoming_transfers SET
        receiver_name = COALESCE(r.payload->>'receiver_name', receiver_name),
        receiver_phone = COALESCE(r.payload->>'receiver_phone', receiver_phone),
        sender_name = COALESCE(r.payload->>'sender_name', sender_name),
        sender_phone = COALESCE(r.payload->>'sender_phone', sender_phone),
        notes = COALESCE(r.payload->>'notes', notes)
      WHERE id = r.transfer_id;
    END IF;
  END IF;

  UPDATE public.transfer_requests SET status = 'مقبول', decided_by = auth.uid(), decided_at = now() WHERE id = p_id;
END;
$function$;
--@@
CREATE OR REPLACE FUNCTION public.decide_withdrawal_request(p_id bigint, p_approve boolean, p_response text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'قرار طلبات السحب للمدير فقط';
  END IF;
  SELECT * INTO r FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF r.status <> 'معلق' THEN RAISE EXCEPTION 'الطلب حُسم مسبقًا'; END IF;
  UPDATE public.withdrawal_requests
  SET status = CASE WHEN p_approve THEN 'مقبول' ELSE 'مرفوض' END,
      response = p_response,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_id;
END;
$function$;
--@@
CREATE OR REPLACE FUNCTION public.delete_cash_voucher(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE b uuid; expected integer; removed integer;
BEGIN
 PERFORM public.require_staff_session();
 IF NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/vouchers','delete') THEN RAISE EXCEPTION 'لا تملك صلاحية حذف السند'; END IF;
 SELECT batch_id INTO b FROM public.cash_vouchers WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'السند غير موجود أو غير مسموح'; END IF;
 IF b IS NULL THEN DELETE FROM public.cash_vouchers WHERE id=p_id; GET DIAGNOSTICS removed=ROW_COUNT; expected:=1;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended(b::text,0));
  SELECT count(*) INTO expected FROM public.cash_vouchers WHERE batch_id=b;
  PERFORM set_config('app.voucher_batch',b::text,true);
  DELETE FROM public.cash_vouchers WHERE batch_id=b;
  GET DIAGNOSTICS removed=ROW_COUNT;
  PERFORM set_config('app.voucher_batch','',true);
 END IF;
 IF removed<>expected THEN RAISE EXCEPTION 'تعذر حذف السند كاملاً'; END IF;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.delete_funds_inventory(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT public.license_writes_allowed() OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/funds-inventory','delete') THEN RAISE EXCEPTION 'لا تملك صلاحية حذف الجرد' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.funds_inventory WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'المحضر غير موجود'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_postings WHERE inventory_id=p_id) THEN UPDATE public.funds_inventory SET voided_at=now() WHERE id=p_id;
 ELSE DELETE FROM public.funds_inventory_details WHERE inventory_id=p_id; DELETE FROM public.funds_inventory WHERE id=p_id; END IF;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.document_scope(p_table text, p_row jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT CASE p_table WHEN 'cash_vouchers' THEN 'cash:'||COALESCE(p_row->>'voucher_type','') WHEN 'checks' THEN 'check:'||COALESCE(p_row->>'check_type','') ELSE p_table END $function$;
--@@
CREATE OR REPLACE FUNCTION public.enforce_customer_not_stopped()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_stopped boolean;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  SELECT stopped INTO is_stopped FROM public.customers WHERE id = NEW.customer_id;
  IF is_stopped THEN
    RAISE EXCEPTION 'حساب العميل موقوف — لا تقبل عمليات جديدة';
  END IF;
  RETURN NEW;
END;
$function$;
--@@
CREATE OR REPLACE FUNCTION public.entry_period_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('app.period_closing', true) = 'on' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.period_closings WHERE NEW.the_date BETWEEN from_date AND to_date) THEN
    RAISE EXCEPTION 'الفترة المحاسبية لهذا التاريخ (%) مقفلة', NEW.the_date;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.exchange_to_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.buy_currencies; ref text; buy boolean := TG_TABLE_NAME = 'buy_currencies'; sign int; d date;
  amt numeric; ex numeric; com numeric; cid bigint; cur bigint; xcur bigint; num bigint; rid bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payment_method <> 'account' THEN RETURN OLD; END IF;
    sign := -1; d := public.aden_date(now());
    amt := OLD.amount; ex := COALESCE(OLD.exchange_amount,0); com := COALESCE(OLD.commission,0);
    cid := OLD.customer_id; cur := OLD.currency_id; xcur := OLD.exchange_currency_id; num := COALESCE(OLD.the_number, OLD.id); rid := OLD.id;
  ELSE
    IF NEW.payment_method <> 'account' THEN RETURN NEW; END IF;
    sign := 1; d := NEW.the_date;
    amt := NEW.amount; ex := COALESCE(NEW.exchange_amount,0); com := COALESCE(NEW.commission,0);
    cid := NEW.customer_id; cur := NEW.currency_id; xcur := NEW.exchange_currency_id; num := COALESCE(NEW.the_number, NEW.id); rid := NEW.id;
  END IF;
  ref := CASE WHEN buy THEN 'شراء عملة رقم ' ELSE 'بيع عملة رقم ' END || num;
  IF sign = -1 THEN ref := 'حذف ' || ref; END IF;

  -- العملة الأساسية
  IF amt <> 0 THEN
    INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,debit,credit,the_date,notes,created_by)
    VALUES (cid, TG_TABLE_NAME, rid, cur,
      CASE WHEN (buy AND sign = -1) OR (NOT buy AND sign = 1) THEN amt ELSE 0 END,
      CASE WHEN (buy AND sign = 1) OR (NOT buy AND sign = -1) THEN amt ELSE 0 END,
      d, ref, auth.uid());
  END IF;
  -- عملة المقابل
  IF ex <> 0 AND xcur IS NOT NULL THEN
    INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,debit,credit,the_date,notes,created_by)
    VALUES (cid, TG_TABLE_NAME, rid, xcur,
      CASE WHEN (buy AND sign = 1) OR (NOT buy AND sign = -1) THEN ex ELSE 0 END,
      CASE WHEN (buy AND sign = -1) OR (NOT buy AND sign = 1) THEN ex ELSE 0 END,
      d, 'مقابل ' || ref, auth.uid());
  END IF;
  -- العمولة على العميل بعملة المقابل
  IF com <> 0 AND xcur IS NOT NULL THEN
    INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,debit,credit,the_date,notes,created_by)
    VALUES (cid, TG_TABLE_NAME, rid, xcur,
      CASE WHEN sign = 1 THEN com ELSE 0 END,
      CASE WHEN sign = -1 THEN com ELSE 0 END,
      d, 'عمولة ' || ref, auth.uid());
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.financial_setting_account(p_key text, p_branch bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint; a bigint;
BEGIN
 SELECT CASE WHEN jsonb_typeof(value) IN ('number','string') AND (value #>> '{}') ~ '^[0-9]+$' THEN (value #>> '{}')::bigint ELSE 0 END INTO n FROM public.system_settings WHERE key=p_key AND scope='branch' AND owner IN (COALESCE(p_branch::text,''),'all') ORDER BY CASE WHEN owner=p_branch::text THEN 0 ELSE 1 END LIMIT 1;
 IF COALESCE(n,0)=0 THEN RETURN NULL; END IF;
 SELECT id INTO a FROM public.accounts WHERE account_number=n AND NOT EXISTS(SELECT 1 FROM public.accounts c WHERE c.father_number=n);
 IF a IS NULL THEN RAISE EXCEPTION 'حدد حساباً تفصيلياً صحيحاً في إعداد %',p_key; END IF;
 IF EXISTS(SELECT 1 FROM public.boxes WHERE account_id=a) OR EXISTS(SELECT 1 FROM public.customers WHERE account_id=a) OR EXISTS(SELECT 1 FROM public.agents WHERE account_id=a) THEN RAISE EXCEPTION 'حساب الإيراد أو فرق الجرد لا يكون حساب صندوق أو عميل أو وكيل'; END IF;
 RETURN a;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.funds_inventory_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('funds_inventory'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM funds_inventory;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_action_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME IN ('outgoing_transfers','incoming_transfers') THEN
   IF NEW.delivered AND NOT OLD.delivered AND NOT public.has_screen_permission('/transfers','deliver') THEN RAISE EXCEPTION 'لا تملك صلاحية تسليم الحوالة'; END IF;
   IF NEW.canceled AND NOT OLD.canceled AND NOT public.has_screen_permission('/transfers','cancel') THEN RAISE EXCEPTION 'لا تملك صلاحية إلغاء الحوالة'; END IF;
   IF NEW.exported_at IS NOT NULL AND OLD.exported_at IS NULL AND NOT public.has_screen_permission('/transfers','export') THEN RAISE EXCEPTION 'لا تملك صلاحية تصدير الحوالة'; END IF;
 ELSIF TG_TABLE_NAME = 'checks' THEN
   IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'محصل' AND NOT public.has_screen_permission('/checks','collect') THEN RAISE EXCEPTION 'لا تملك صلاحية تحصيل الشيك'; END IF;
   IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'مرتجع' AND NOT public.has_screen_permission('/checks','bounce') THEN RAISE EXCEPTION 'لا تملك صلاحية إرجاع الشيك'; END IF;
 END IF;
 RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_closed_box()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; d date;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; d := aden_date(now()); ELSE r := OLD; d := aden_date(OLD.created_at); END IF;
  IF EXISTS (SELECT 1 FROM box_closings c WHERE c.box_id = r.box_id AND c.currency_id IS NOT DISTINCT FROM r.currency_id AND c.close_date >= d) THEN
    RAISE EXCEPTION 'BOX_CLOSED: الصندوق مقفل لهذا اليوم';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_closing_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
 IF TG_OP = 'INSERT' AND NOT public.has_screen_permission('/closing','close') THEN RAISE EXCEPTION 'لا تملك صلاحية إقفال الصندوق'; END IF;
 IF TG_OP = 'DELETE' AND NOT public.has_screen_permission('/closing','reopen') THEN RAISE EXCEPTION 'لا تملك صلاحية إعادة فتح الصندوق'; END IF;
 RETURN COALESCE(NEW, OLD);
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_internal_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE src public.outgoing_transfers;
BEGIN
 IF TG_TABLE_NAME='outgoing_transfers' THEN
  IF TG_OP='INSERT' THEN
   NEW.is_internal := NEW.is_internal OR btrim(COALESCE(NEW.destination_name,''))='المركز الرئيسي';
   IF NEW.is_internal THEN NEW.destination_name:='المركز الرئيسي'; NEW.agent_id:=NULL; END IF;
  ELSE
   IF ROW(NEW.is_internal,NEW.destination_name) IS DISTINCT FROM ROW(OLD.is_internal,OLD.destination_name) AND OLD.is_internal THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
   IF NEW.is_internal IS DISTINCT FROM OLD.is_internal THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
   IF OLD.is_internal THEN
    IF NEW.exported_at IS NOT NULL THEN RAISE EXCEPTION 'INTERNAL_TRANSFER_NO_EXPORT'; END IF;
    IF NEW.delivered AND NOT OLD.delivered AND NOT EXISTS(SELECT 1 FROM public.incoming_transfers WHERE internal_outgoing_id=OLD.id AND delivered) THEN RAISE EXCEPTION 'INTERNAL_TRANSFER_DELIVER_INCOMING'; END IF;
   END IF;
  END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.internal_outgoing_id IS DISTINCT FROM OLD.internal_outgoing_id THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
  IF NEW.internal_outgoing_id IS NOT NULL THEN
   SELECT * INTO src FROM public.outgoing_transfers WHERE id=NEW.internal_outgoing_id FOR UPDATE;
   IF NOT FOUND OR NOT src.is_internal THEN RAISE EXCEPTION 'INVALID_INTERNAL_TRANSFER'; END IF;
   IF TG_OP='INSERT' THEN
    IF pg_trigger_depth() < 2 OR ROW(NEW.amount,NEW.currency_id,NEW.sender_name,NEW.receiver_name,NEW.branch_commission,NEW.agent_id,NEW.box_id,NEW.customer_id) IS DISTINCT FROM ROW(src.amount,src.currency_id,src.sender_name,src.receiver_name,0::numeric,NULL::bigint,NULL::bigint,NULL::bigint) THEN RAISE EXCEPTION 'INVALID_INTERNAL_TRANSFER'; END IF;
   ELSE
    IF ROW(NEW.sender_name,NEW.receiver_name,NEW.source_name,NEW.destination_name,NEW.reference_number) IS DISTINCT FROM ROW(OLD.sender_name,OLD.receiver_name,OLD.source_name,OLD.destination_name,OLD.reference_number) THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
    IF NEW.delivered AND NOT OLD.delivered AND (src.canceled OR src.delivered) THEN RAISE EXCEPTION 'INVALID_INTERNAL_TRANSFER_STATE'; END IF;
    IF NEW.canceled AND NOT OLD.canceled AND NOT src.canceled THEN RAISE EXCEPTION 'INTERNAL_TRANSFER_CANCEL_OUTGOING'; END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_inventory_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_license_operation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF auth.uid() IS NOT NULL AND NOT public.license_writes_allowed() THEN RAISE EXCEPTION 'LICENSE_READ_ONLY' USING ERRCODE='42501'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_linked_transfer_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM public.outgoing_transfers WHERE check_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TRANSFER_CHECK_DELETE_FORBIDDEN'; END IF;
  IF ROW(NEW.amount,NEW.currency_id,NEW.check_type,NEW.check_number,NEW.customer_id) IS DISTINCT FROM ROW(OLD.amount,OLD.currency_id,OLD.check_type,OLD.check_number,OLD.customer_id) THEN RAISE EXCEPTION 'TRANSFER_CHECK_IMMUTABLE'; END IF;
  IF OLD.status='محصل' AND (NEW.status<>OLD.status OR NEW.box_id IS DISTINCT FROM OLD.box_id) THEN RAISE EXCEPTION 'TRANSFER_CHECK_ALREADY_COLLECTED'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_managed_financial_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_request_decision_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE screen text;
BEGIN
 screen:=CASE TG_TABLE_NAME WHEN 'transfer_requests' THEN '/transfer-requests' ELSE '/withdrawal-requests' END;
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.license_writes_allowed() OR NOT public.has_screen_permission(screen,'update') THEN RAISE EXCEPTION 'REQUEST_DECISION_DENIED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='transfer_requests' AND NEW.status='مقبول' THEN
  IF NOT public.has_screen_permission('/transfers','update') OR (NEW.request_type='cancel' AND NOT public.has_screen_permission('/transfers','cancel')) THEN RAISE EXCEPTION 'TRANSFER_ACTION_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_staff_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d public.staff_work_defaults; today date := public.aden_date(now());
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.the_date IS NOT DISTINCT FROM OLD.the_date THEN RETURN NEW; END IF;
  SELECT * INTO d FROM public.staff_work_defaults WHERE user_id = auth.uid();
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NOT d.allow_past_date AND NEW.the_date < today THEN RAISE EXCEPTION 'STAFF_PAST_DATE_DENIED'; END IF;
  IF NOT d.allow_future_date AND NEW.the_date > today THEN RAISE EXCEPTION 'STAFF_FUTURE_DATE_DENIED'; END IF;
  RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_staff_work_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d public.staff_work_defaults; r jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.staff_work_defaults WHERE user_id=auth.uid(); IF NOT FOUND THEN RETURN NEW; END IF;
 r:=to_jsonb(NEW);
 IF d.enforce_currency AND r?'currency_id' AND (r->>'currency_id')::bigint IS DISTINCT FROM d.currency_id THEN RAISE EXCEPTION 'STAFF_CURRENCY_RESTRICTED'; END IF;
 IF d.enforce_box AND r?'box_id' THEN
  IF r->>'payment_method' IN ('account','check') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='incoming_transfers' AND NOT COALESCE((r->>'delivered')::boolean,false) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='checks' AND r->>'status'<>'محصل' AND r->>'box_id' IS NULL THEN RETURN NEW; END IF;
  IF (r->>'box_id')::bigint IS DISTINCT FROM d.box_id THEN RAISE EXCEPTION 'STAFF_BOX_RESTRICTED'; END IF;
 END IF; RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_transfer_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE mgr boolean := is_admin(auth.uid()) OR has_role(auth.uid(), 'manager');
BEGIN
  IF NEW.canceled AND NOT OLD.canceled THEN
    IF NOT mgr THEN RAISE EXCEPTION 'FORBIDDEN_CANCEL: إلغاء الحوالة للمدير فقط'; END IF;
    IF OLD.delivered THEN RAISE EXCEPTION 'DELIVERED: لا تُلغى حوالة مسلّمة'; END IF;
    NEW.state := 'ملغاة';
  END IF;
  IF OLD.canceled AND NOT NEW.canceled AND NOT mgr THEN RAISE EXCEPTION 'FORBIDDEN_CANCEL'; END IF;
  IF OLD.delivered AND NOT NEW.delivered AND NOT mgr THEN RAISE EXCEPTION 'FORBIDDEN_UNDELIVER'; END IF;
  IF NEW.delivered AND NOT OLD.delivered THEN
    IF OLD.canceled THEN RAISE EXCEPTION 'CANCELED: الحوالة ملغاة'; END IF;
    NEW.state := 'مسلّمة';
    IF TG_TABLE_NAME = 'incoming_transfers' THEN
      NEW.delivered_at := now();
      NEW.delivered_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.guard_voucher_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.batch_position IS DISTINCT FROM OLD.batch_position OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency_id IS DISTINCT FROM OLD.currency_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.voucher_type IS DISTINCT FROM OLD.voucher_type OR NEW.the_date IS DISTINCT FROM OLD.the_date) THEN RAISE EXCEPTION 'السند المرحل لا يقبل تعديل البيانات المالية'; END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.batch_id IS NOT NULL AND current_setting('app.voucher_batch',true) IS DISTINCT FROM OLD.batch_id::text THEN RAISE EXCEPTION 'احذف السند متعدد العملات كاملاً'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' AND NEW.batch_id IS NOT NULL AND current_setting('app.voucher_batch',true) IS DISTINCT FROM NEW.batch_id::text THEN RAISE EXCEPTION 'يجب حفظ السند متعدد العملات كاملاً'; END IF;
 RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), COALESCE(NEW.raw_user_meta_data ->> 'phone', ''),
          NULLIF(NEW.raw_user_meta_data ->> 'username', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND _user_id=auth.uid() AND public.staff_session_unlocked() AND public.staff_mfa_satisfied() AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$function$;
--@@
CREATE OR REPLACE FUNCTION public.has_screen_permission(p_screen text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE permitted boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(),false) OR p_screen IS NULL OR p_action IS NULL OR p_action !~ '^[a-z_]{2,40}$' THEN RETURN false; END IF;
 IF p_screen='/license' THEN RETURN public.is_admin(auth.uid()); END IF;
 IF public.is_admin(auth.uid()) THEN RETURN true; END IF;
 SELECT u.can_view AND CASE p_action WHEN 'view' THEN true WHEN 'create' THEN u.can_create WHEN 'update' THEN u.can_update WHEN 'delete' THEN u.can_delete WHEN 'print' THEN u.can_print ELSE COALESCE((u.extra_actions->>p_action)::boolean, true) END INTO permitted
 FROM public.user_screen_permissions u WHERE u.user_id=auth.uid() AND u.screen_path=p_screen;
 IF FOUND THEN RETURN COALESCE(permitted,false); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_group_members WHERE user_id=auth.uid()) THEN RETURN true; END IF;
 SELECT bool_or(CASE WHEN p.id IS NOT NULL THEN p.can_view AND CASE p_action WHEN 'view' THEN true WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete WHEN 'print' THEN p.can_print ELSE COALESCE((p.extra_actions->>p_action)::boolean, true) END ELSE (cardinality(g.allowed_screens)=0 OR p_screen=ANY(g.allowed_screens)) END) INTO permitted
 FROM public.user_group_members m JOIN public.user_groups g ON g.id=m.group_id LEFT JOIN public.group_screen_permissions p ON p.group_id=g.id AND p.screen_path=p_screen WHERE m.user_id=auth.uid();
 RETURN COALESCE(permitted,false);
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin')
$function$;
--@@
CREATE OR REPLACE FUNCTION public.is_exchange_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT auth.uid() IS NOT NULL AND public.staff_active() AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','manager','accountant','teller')); $function$;
--@@
CREATE OR REPLACE FUNCTION public.is_platform_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT auth.uid() IS NOT NULL AND public.staff_session_unlocked() AND public.staff_mfa_satisfied() AND public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.platform_owners WHERE user_id=auth.uid()) $function$;
--@@
CREATE OR REPLACE FUNCTION public.issue_activation_code(p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ DECLARE code text; result uuid; target uuid; BEGIN PERFORM public.require_staff_session(); IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE='42501'; END IF; IF p_until IS NOT NULL AND p_until<=now() THEN RAISE EXCEPTION 'INVALID_LICENSE_DATE'; END IF; SELECT id INTO target FROM public.installation_license WHERE singleton=1; code:=upper(encode(extensions.gen_random_bytes(18),'hex')); INSERT INTO public.activation_codes(installation_id,code_hash,licensed_until,created_by) VALUES(target,encode(extensions.digest(code,'sha256'),'hex'),p_until,auth.uid()) RETURNING id INTO result; RETURN jsonb_build_object('id',result,'code',code); END $function$;
--@@
CREATE OR REPLACE FUNCTION public.journal_voucher_to_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.entry_id IS NOT NULL THEN
      DELETE FROM public.entries WHERE id = OLD.entry_id;
    END IF;
    RETURN OLD;
  END IF;
  INSERT INTO public.entries (entry_number, the_date, notes)
  VALUES (
    NEW.the_number,
    NEW.the_date,
    'سند قيد بسيط رقم ' || COALESCE(NEW.the_number, NEW.id) || COALESCE(' — ' || NULLIF(btrim(NEW.notes), ''), '')
  )
  RETURNING id INTO v_entry;
  UPDATE public.journal_vouchers SET entry_id = v_entry WHERE id = NEW.id;
  INSERT INTO public.entries_details (entry_id, entry_index, side, amount, currency_id, account_id)
  VALUES
    (v_entry, 1, 'مدين', NEW.amount, NEW.currency_id, NEW.debit_account_id),
    (v_entry, 2, 'دائن', NEW.amount, NEW.currency_id, NEW.credit_account_id);
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.journal_vouchers_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('journal_vouchers'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM journal_vouchers;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.license_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN PERFORM public.require_staff_session(); RETURN (SELECT jsonb_build_object('id',id,'company_name',company_name,'trial_started_at',trial_started_at,'trial_ends_at',trial_ends_at,'activated',activated,'licensed_until',licensed_until,'can_write',public.license_writes_allowed(),'is_owner',public.is_platform_owner()) FROM public.installation_license WHERE singleton=1); END $function$;
--@@
CREATE OR REPLACE FUNCTION public.license_writes_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT COALESCE((SELECT CASE WHEN activated THEN licensed_until IS NULL OR licensed_until>now() ELSE trial_ends_at>now() END FROM public.installation_license WHERE singleton=1),false) $function$;
--@@
CREATE OR REPLACE FUNCTION public.lock_box_for_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN PERFORM 1 FROM public.boxes WHERE id=NEW.box_id FOR UPDATE; RETURN NEW; END $function$;
--@@
CREATE OR REPLACE FUNCTION public.lock_staff_session()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 UPDATE staff_session_locks SET locked=true,updated_at=now() WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier();
 IF NOT FOUND THEN RAISE EXCEPTION 'PIN_REQUIRED'; END IF;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.log_activity_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT coalesce(username, full_name) INTO NEW.username FROM profiles WHERE id = NEW.user_id;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.loop_entries_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('loop_entries'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM loop_entries;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.management_alerts(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/alerts','view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN jsonb_build_object(
 'checks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'number',check_number,'amount',amount,'currency_id',currency_id,'date',due_date,'days',due_date-p_date)) FROM checks WHERE status='تحت التحصيل' AND due_date IS NOT NULL),'[]'::jsonb),
 'transfers',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
 SELECT id,'outgoing'::text direction,transfer_number number,amount,currency_id,the_date date,p_date-the_date days,sender_name,receiver_name FROM outgoing_transfers WHERE NOT delivered AND NOT canceled
 UNION ALL SELECT id,'incoming',transfer_number,amount,currency_id,the_date,p_date-the_date,sender_name,receiver_name FROM incoming_transfers WHERE NOT delivered AND NOT canceled AND internal_outgoing_id IS NULL) t),'[]'::jsonb),
 'prices',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
 SELECT DISTINCT ON (cp.source_currency_id,cp.target_currency_id) cp.source_currency_id currency_id,cp.buy_price,cp.sell_price,c.max_buy_price,c.min_sell_price,cp.updated_at FROM currency_prices cp JOIN currencies c ON c.id=cp.source_currency_id ORDER BY cp.source_currency_id,cp.target_currency_id,cp.updated_at DESC) p WHERE (p.max_buy_price IS NOT NULL AND p.buy_price>p.max_buy_price) OR (p.min_sell_price IS NOT NULL AND p.sell_price<p.min_sell_price)),'[]'::jsonb),
 'cash_differences',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'box_id',box_id,'currency_id',currency_id,'date',close_date,'difference',difference)) FROM box_closings WHERE difference<>0 AND close_date=p_date),'[]'::jsonb)
 );
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.next_account_number(p_father bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('acc:' || coalesce(p_father, 0)::text));
  IF p_father IS NULL THEN
    SELECT coalesce(max(account_number), 0) + 1 INTO n FROM accounts WHERE father_number IS NULL;
  ELSE
    SELECT max(account_number) + 1 INTO n FROM accounts WHERE father_number = p_father;
    IF n IS NULL THEN n := p_father * 100 + 1; END IF;
  END IF;
  RETURN n;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.ops_to_box()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM box_movements WHERE source_type = TG_TABLE_NAME AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'buy_currencies' AND TG_OP = 'INSERT' THEN
    ref := 'شراء رقم ' || COALESCE(NEW.the_number, NEW.id);
    PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount, 'قبض', ref, TG_TABLE_NAME, NEW.id);
    PERFORM post_box(NEW.box_id, NEW.exchange_currency_id, NEW.exchange_amount, 'صرف', ref, TG_TABLE_NAME, NEW.id);
    PERFORM post_box(NEW.box_id, NEW.exchange_currency_id, NEW.commission, 'قبض', 'عمولة ' || ref, TG_TABLE_NAME, NEW.id);
  ELSIF TG_TABLE_NAME = 'sell_currencies' AND TG_OP = 'INSERT' THEN
    ref := 'بيع رقم ' || COALESCE(NEW.the_number, NEW.id);
    PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount, 'صرف', ref, TG_TABLE_NAME, NEW.id);
    PERFORM post_box(NEW.box_id, NEW.exchange_currency_id, NEW.exchange_amount, 'قبض', ref, TG_TABLE_NAME, NEW.id);
    PERFORM post_box(NEW.box_id, NEW.exchange_currency_id, NEW.commission, 'قبض', 'عمولة ' || ref, TG_TABLE_NAME, NEW.id);
  ELSIF TG_TABLE_NAME = 'outgoing_transfers' THEN
    ref := 'حوالة صادرة رقم ' || COALESCE(NEW.transfer_number, NEW.id);
    IF TG_OP = 'INSERT' THEN
      PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount, 'قبض', ref, TG_TABLE_NAME, NEW.id);
      PERFORM post_box(NEW.box_id, COALESCE(NEW.commission_currency_id, NEW.currency_id), NEW.branch_commission, 'قبض', 'عمولة ' || ref, TG_TABLE_NAME, NEW.id);
    ELSIF NEW.canceled AND NOT OLD.canceled THEN
      PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount, 'صرف', 'إلغاء ' || ref, TG_TABLE_NAME, NEW.id);
      PERFORM post_box(NEW.box_id, COALESCE(NEW.commission_currency_id, NEW.currency_id), NEW.branch_commission, 'صرف', 'رد عمولة ' || ref, TG_TABLE_NAME, NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'incoming_transfers' AND TG_OP = 'UPDATE' THEN
    IF NEW.delivered AND NOT OLD.delivered THEN
      PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount, 'صرف', 'تسليم حوالة واردة رقم ' || COALESCE(NEW.transfer_number, NEW.id), TG_TABLE_NAME, NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'agent_settlements' AND TG_OP = 'INSERT' THEN
    PERFORM post_box(NEW.box_id, NEW.currency_id, NEW.amount,
      CASE WHEN NEW.direction = 'paid_to_agent' THEN 'صرف' ELSE 'قبض' END,
      'تسوية وكيل رقم ' || NEW.id, TG_TABLE_NAME, NEW.id);
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.party_autoaccount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE parent bigint; nm text; newid bigint;
BEGIN
  IF TG_TABLE_NAME = 'agents' THEN parent := 13; nm := NEW.agent_name;
    IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
      SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM agents; END IF;
  ELSIF TG_TABLE_NAME = 'boxes' THEN parent := 11; nm := NEW.box_name;
    IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
      SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM boxes; END IF;
  ELSE parent := 14; nm := NEW.full_name;
    IF NEW.the_user_id IS NULL OR NEW.the_user_id = 0 THEN
      SELECT coalesce(max(the_user_id), 0) + 1 INTO NEW.the_user_id FROM customers; END IF;
  END IF;
  IF NEW.account_id IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE account_number = parent) THEN
    INSERT INTO accounts (account_number, father_number, account_name, account_type, branch_id, created_by)
    VALUES (0, parent, nm, 'فرعي', NEW.branch_id, auth.uid()) RETURNING id INTO newid;
    NEW.account_id := newid;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.party_drop_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.account_id IS NOT NULL THEN
    DELETE FROM accounts WHERE id = OLD.account_id;
  END IF;
  RETURN NULL;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.party_sync_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE nm text;
BEGIN
  IF TG_TABLE_NAME = 'agents' THEN nm := NEW.agent_name;
  ELSIF TG_TABLE_NAME = 'boxes' THEN nm := NEW.box_name;
  ELSE nm := NEW.full_name;
  END IF;
  IF NEW.account_id IS NOT NULL THEN
    UPDATE accounts SET account_name = nm WHERE id = NEW.account_id AND account_name IS DISTINCT FROM nm;
  END IF;
  RETURN NULL;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.post_box(p_box bigint, p_currency bigint, p_amount numeric, p_type text, p_notes text, p_src text, p_src_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_box IS NULL OR p_amount IS NULL OR p_amount = 0 THEN RETURN; END IF;
  INSERT INTO box_movements (box_id, currency_id, amount, movement_type, notes, source_type, source_id, created_by)
  VALUES (p_box, p_currency, p_amount, p_type, p_notes, p_src, p_src_id, auth.uid());
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.post_inventory_difference(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE h public.funds_inventory; b public.boxes; a bigint; e bigint; p bigint; l record; bal numeric; idx bigint:=0;
BEGIN
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT public.license_writes_allowed() OR NOT public.has_screen_permission('/funds-inventory','update') OR NOT public.has_screen_permission('/entries','create') THEN RAISE EXCEPTION 'لا تملك صلاحية الترحيل' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.funds_inventory WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR h.voided_at IS NOT NULL THEN RAISE EXCEPTION 'المحضر غير موجود أو ملغي'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_postings WHERE inventory_id=p_id AND reversal_entry_id IS NULL) THEN RAISE EXCEPTION 'تم ترحيل هذا المحضر مسبقاً'; END IF;
 SELECT * INTO b FROM public.boxes WHERE id=h.box_id FOR UPDATE;
 a:=public.financial_setting_account('acc.inventory_diff_account',b.branch_id);
 IF a IS NULL OR b.account_id IS NULL OR a=b.account_id THEN RAISE EXCEPTION 'حدد رقم حساب ترحيل فارق الجرد في الإعدادات واربط الصندوق بحسابه'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.funds_inventory_details WHERE inventory_id=p_id AND difference<>0) THEN RAISE EXCEPTION 'الجرد مطابق ولا يوجد فرق للترحيل'; END IF;
 FOR l IN SELECT * FROM public.funds_inventory_details WHERE inventory_id=p_id LOOP
  SELECT COALESCE(sum(CASE WHEN movement_type='قبض' THEN amount ELSE -amount END),0) INTO bal FROM public.box_movements WHERE box_id=h.box_id AND currency_id=l.currency_id;
  IF bal<>l.system_amount THEN RAISE EXCEPTION 'تغير رصيد الصندوق؛ عدل الجرد وأعد مراجعة المعدود قبل الترحيل'; END IF;
 END LOOP;
 INSERT INTO public.entries(entry_number,the_date,notes,branch_id,posting_source,posting_source_id) VALUES(0,public.aden_date(now()),'ترحيل فارق الجرد رقم '||COALESCE(h.the_number,h.id),b.branch_id,'inventory',h.id) RETURNING id INTO e;
 FOR l IN SELECT * FROM public.funds_inventory_details WHERE inventory_id=p_id AND difference<>0 LOOP
  INSERT INTO public.entries_details(entry_id,entry_index,side,amount,currency_id,account_id) VALUES(e,idx+1,CASE WHEN l.difference>0 THEN 'مدين' ELSE 'دائن' END,abs(l.difference),l.currency_id,b.account_id),(e,idx+2,CASE WHEN l.difference>0 THEN 'دائن' ELSE 'مدين' END,abs(l.difference),l.currency_id,a);
  idx:=idx+2;
  PERFORM public.post_box(h.box_id,l.currency_id,abs(l.difference),CASE WHEN l.difference>0 THEN 'قبض' ELSE 'صرف' END,'ترحيل فارق الجرد رقم '||COALESCE(h.the_number,h.id),'inventory',e);
 END LOOP;
 INSERT INTO public.inventory_postings(inventory_id,entry_id,difference_account_id) VALUES(h.id,e,a) RETURNING id INTO p;
 RETURN p;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.post_operation_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; src text:='commission:'||TG_TABLE_NAME; original public.entries; e bigint; n numeric; c bigint; a bigint; settlement bigint; branch bigint; ref text; mirror boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN r:=to_jsonb(OLD); ELSE r:=to_jsonb(NEW); END IF;
 IF TG_OP='DELETE' OR (TG_TABLE_NAME='outgoing_transfers' AND TG_OP='UPDATE' AND COALESCE((r->>'canceled')::boolean,false) AND NOT COALESCE((to_jsonb(OLD)->>'canceled')::boolean,false)) THEN
  SELECT * INTO original FROM public.entries WHERE posting_source=src AND posting_source_id=(r->>'id')::bigint AND posting_reversal_of IS NULL;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.entries WHERE posting_reversal_of=original.id) THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
  INSERT INTO public.entries(entry_number,the_date,notes,branch_id,posting_source,posting_source_id,posting_reversal_of) VALUES(0,public.aden_date(now()),'رد '||original.notes,original.branch_id,src,original.posting_source_id,original.id) RETURNING id INTO e;
  INSERT INTO public.entries_details(entry_id,entry_index,side,amount,currency_id,account_id,settlement_mirror) SELECT e,entry_index,CASE WHEN side='مدين' THEN 'دائن' ELSE 'مدين' END,amount,currency_id,account_id,settlement_mirror FROM public.entries_details WHERE entry_id=original.id;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' THEN RETURN NEW; END IF;
 branch:=(r->>'branch_id')::bigint;
 IF TG_TABLE_NAME='outgoing_transfers' THEN n:=COALESCE((r->>'branch_commission')::numeric,0); c:=COALESCE((r->>'commission_currency_id')::bigint,(r->>'currency_id')::bigint); a:=public.financial_setting_account('trf.commission_account',branch);
 ELSE n:=COALESCE((r->>'commission')::numeric,0); c:=(r->>'exchange_currency_id')::bigint; a:=public.financial_setting_account('exc.commission_account',branch); END IF;
 IF n<=0 OR a IS NULL THEN RETURN NEW; END IF;
 IF r->>'payment_method'='account' THEN SELECT account_id INTO settlement FROM public.customers WHERE id=(r->>'customer_id')::bigint; mirror:=true;
 ELSIF r->>'payment_method'='check' THEN settlement:=public.financial_setting_account('trf.commission_settlement_account',branch);
 ELSE SELECT account_id INTO settlement FROM public.boxes WHERE id=(r->>'box_id')::bigint; END IF;
 IF settlement IS NULL OR settlement=a THEN RAISE EXCEPTION 'حدد حساب التسوية للعمولة واربط الصندوق أو العميل بحسابه'; END IF;
 ref:='عمولة '||CASE WHEN TG_TABLE_NAME='outgoing_transfers' THEN 'حوالة' WHEN TG_TABLE_NAME='buy_currencies' THEN 'شراء' ELSE 'بيع' END||' رقم '||COALESCE(r->>'transfer_number',r->>'the_number',r->>'id');
 INSERT INTO public.entries(entry_number,the_date,notes,branch_id,posting_source,posting_source_id) VALUES(0,(r->>'the_date')::date,ref,branch,src,(r->>'id')::bigint) RETURNING id INTO e;
 INSERT INTO public.entries_details(entry_id,entry_index,side,amount,currency_id,account_id,settlement_mirror) VALUES(e,1,'مدين',n,c,settlement,mirror),(e,2,'دائن',n,c,a,false);
 RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.record_currency_rate_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='INSERT' OR ROW(NEW.buy_price,NEW.sell_price,NEW.exchange_price) IS DISTINCT FROM ROW(OLD.buy_price,OLD.sell_price,OLD.exchange_price) THEN
 INSERT INTO public.currency_rate_history(source_currency_id,target_currency_id,buy_price,sell_price,exchange_price,changed_by) VALUES(NEW.source_currency_id,NEW.target_currency_id,NEW.buy_price,NEW.sell_price,NEW.exchange_price,auth.uid());
 END IF;
 RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.reference_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    EXECUTE format('SELECT coalesce(max(the_number), 0) + 1 FROM public.%I', TG_TABLE_NAME)
      INTO NEW.the_number;
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.require_staff_session()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(),false) THEN RAISE EXCEPTION 'STAFF_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.reverse_inventory_difference(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE h public.funds_inventory; p public.inventory_postings; e bigint; l record;
BEGIN
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT public.license_writes_allowed() OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/funds-inventory','update') OR NOT public.has_screen_permission('/entries','create') THEN RAISE EXCEPTION 'لا تملك صلاحية إلغاء الترحيل' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.funds_inventory WHERE id=p_id FOR UPDATE;
 SELECT * INTO p FROM public.inventory_postings WHERE inventory_id=p_id AND reversal_entry_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'لا يوجد ترحيل فعال'; END IF;
 INSERT INTO public.entries(entry_number,the_date,notes,branch_id,posting_source,posting_source_id,posting_reversal_of) VALUES(0,public.aden_date(now()),'إلغاء ترحيل فارق الجرد رقم '||COALESCE(h.the_number,h.id),h.branch_id,'inventory',h.id,p.entry_id) RETURNING id INTO e;
 INSERT INTO public.entries_details(entry_id,entry_index,side,amount,currency_id,account_id) SELECT e,entry_index,CASE WHEN side='مدين' THEN 'دائن' ELSE 'مدين' END,amount,currency_id,account_id FROM public.entries_details WHERE entry_id=p.entry_id;
 FOR l IN SELECT * FROM public.box_movements WHERE source_type='inventory' AND source_id=p.entry_id LOOP
  PERFORM public.post_box(l.box_id,l.currency_id,l.amount,CASE WHEN l.movement_type='قبض' THEN 'صرف' ELSE 'قبض' END,'إلغاء ترحيل فارق الجرد رقم '||COALESCE(h.the_number,h.id),'inventory_reversal',e);
 END LOOP;
 UPDATE public.inventory_postings SET reversal_entry_id=e,reversed_at=now(),reversed_by=auth.uid() WHERE id=p.id;
 RETURN e;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.revoke_activation_code(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN PERFORM public.require_staff_session(); IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE='42501'; END IF; UPDATE public.activation_codes SET revoked_at=now() WHERE id=p_id AND used_at IS NULL AND revoked_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'CODE_UNAVAILABLE'; END IF; END $function$;
--@@
CREATE OR REPLACE FUNCTION public.route_internal_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_TABLE_NAME='outgoing_transfers' THEN
  IF NEW.is_internal THEN
   IF TG_OP='INSERT' THEN
    INSERT INTO public.incoming_transfers(internal_outgoing_id,amount,currency_id,sender_name,sender_phone,receiver_name,receiver_phone,branch_commission,commission_currency_id,the_date,state,source_name,destination_name,reference_number,transfer_purpose,receiver_identity_type,receiver_identity_number,country_id,governorate_id,area_id,notes)
    VALUES(NEW.id,NEW.amount,NEW.currency_id,NEW.sender_name,NEW.sender_phone,NEW.receiver_name,NEW.receiver_phone,0,NEW.currency_id,NEW.the_date,'معلقة',NEW.source_name,'المركز الرئيسي',NEW.reference_number,NEW.transfer_purpose,NEW.receiver_identity_type,NEW.receiver_identity_number,NEW.country_id,NEW.governorate_id,NEW.area_id,NEW.notes);
   ELSIF NEW.canceled AND NOT OLD.canceled THEN
    UPDATE public.incoming_transfers SET canceled=true WHERE internal_outgoing_id=NEW.id AND NOT canceled;
   END IF;
  END IF;
 ELSE
  IF TG_OP='UPDATE' THEN
   IF NEW.internal_outgoing_id IS NOT NULL AND NEW.delivered AND NOT OLD.delivered THEN
    UPDATE public.outgoing_transfers SET delivered=true WHERE id=NEW.internal_outgoing_id AND NOT delivered;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.save_funds_inventory(p_id bigint, p_box bigint, p_date date, p_notes text, p_lines jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id bigint; l jsonb; bal numeric; h public.funds_inventory; new_record boolean:=COALESCE(p_id,0)=0;
BEGIN
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT public.license_writes_allowed() OR NOT public.has_screen_permission('/funds-inventory',CASE WHEN new_record THEN 'create' ELSE 'update' END) THEN RAISE EXCEPTION 'لا تملك صلاحية حفظ الجرد' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'أدخل عملات ومبالغ الجرد'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE (x->>'currency_id') IS NULL OR (x->>'real_amount') IS NULL OR lower(x->>'real_amount') IN ('nan','infinity','-infinity') OR (x->>'real_amount')::numeric<0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x GROUP BY x->>'currency_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'مبالغ أو عملات الجرد غير صحيحة'; END IF;
 IF NOT new_record THEN
  SELECT * INTO h FROM public.funds_inventory WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'المحضر غير موجود'; END IF;
 END IF;
 PERFORM 1 FROM public.boxes WHERE id=p_box FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'اختر الصندوق'; END IF;
 IF new_record THEN
  INSERT INTO public.funds_inventory(box_id,the_date,notes,branch_id) SELECT id,p_date,NULLIF(btrim(p_notes),''),branch_id FROM public.boxes WHERE id=p_box RETURNING id INTO v_id;
 ELSE
  UPDATE public.funds_inventory SET box_id=p_box,the_date=p_date,notes=NULLIF(btrim(p_notes),''),branch_id=(SELECT branch_id FROM public.boxes WHERE id=p_box) WHERE id=p_id;
  v_id:=p_id;
  IF EXISTS(SELECT 1 FROM public.funds_inventory_details d WHERE inventory_id=v_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE (x->>'currency_id')::bigint=d.currency_id)) THEN
   IF NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.has_screen_permission('/funds-inventory','delete') THEN RAISE EXCEPTION 'حذف عملة من الجرد يحتاج صلاحية الحذف'; END IF;
   DELETE FROM public.funds_inventory_details d WHERE inventory_id=v_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE (x->>'currency_id')::bigint=d.currency_id);
  END IF;
 END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT COALESCE(sum(CASE WHEN movement_type='قبض' THEN amount ELSE -amount END),0) INTO bal FROM public.box_movements WHERE box_id=p_box AND currency_id=(l->>'currency_id')::bigint;
  UPDATE public.funds_inventory_details SET system_amount=bal,real_amount=round((l->>'real_amount')::numeric,4) WHERE inventory_id=v_id AND currency_id=(l->>'currency_id')::bigint;
  IF NOT FOUND THEN INSERT INTO public.funds_inventory_details(inventory_id,currency_id,system_amount,real_amount) VALUES(v_id,(l->>'currency_id')::bigint,bal,round((l->>'real_amount')::numeric,4)); END IF;
 END LOOP;
 RETURN v_id;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.set_staff_session_pin(p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.staff_mfa_satisfied() OR NOT public.staff_session_unlocked() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;
 INSERT INTO staff_session_locks(user_id,session_id,pin_hash) VALUES(auth.uid(),public.staff_session_identifier(),extensions.crypt(p_pin,extensions.gen_salt('bf',10)))
 ON CONFLICT(user_id,session_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,failed_attempts=0,updated_at=now();
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.setup_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME));
    EXECUTE format('SELECT coalesce(max(the_number), 0) + 1 FROM public.%I', TG_TABLE_NAME) INTO NEW.the_number;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(), false)
$function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_can_read(p_screens text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM unnest(p_screens) s WHERE public.has_screen_permission(s, 'view'))
$function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_mfa_satisfied()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND ((auth.jwt()->>'aal')='aal2' OR NOT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified'))
$function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_session_identifier()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 SELECT CASE WHEN NULLIF(auth.jwt()->>'session_id','') IS NOT NULL THEN (auth.jwt()->>'session_id')::uuid ELSE md5(COALESCE(auth.uid()::text,'')||':managed-preview')::uuid END
$function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_session_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.staff_session_locks;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO s FROM public.staff_session_locks WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier();
 RETURN jsonb_build_object('has_pin',FOUND,'locked',COALESCE(s.locked,false),'failed_attempts',COALESCE(s.failed_attempts,0));
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_session_unlocked()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_session_locks WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier() AND locked)
$function$;
--@@
CREATE OR REPLACE FUNCTION public.staff_trade_allowed(p_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND (public.is_admin(auth.uid()) OR COALESCE((SELECT CASE p_kind WHEN 'buy' THEN allow_buy WHEN 'sell' THEN allow_sell ELSE false END FROM public.staff_work_defaults WHERE user_id=auth.uid()), p_kind IN ('buy','sell')))
$function$;
--@@
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
--@@
CREATE OR REPLACE FUNCTION public.transfer_autonumber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  IF NEW.transfer_number IS NULL OR NEW.transfer_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME || ':' || coalesce(NEW.agent_id, 0)::text));
    EXECUTE format('SELECT coalesce(max(transfer_number), 0) + 1 FROM public.%I WHERE agent_id IS NOT DISTINCT FROM $1', TG_TABLE_NAME)
      INTO n USING NEW.agent_id;
    NEW.transfer_number := n;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.transfer_to_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref text; c bigint; n numeric;
BEGIN
 IF NEW.payment_method<>'account' THEN RETURN NEW; END IF;
 ref:='حوالة '||CASE WHEN TG_TABLE_NAME='outgoing_transfers' THEN 'صادرة' ELSE 'واردة' END||' رقم '||COALESCE(NEW.transfer_number,NEW.id);
 IF TG_TABLE_NAME='outgoing_transfers' AND TG_OP='INSERT' THEN
  INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,debit,the_date,notes,created_by) VALUES(NEW.customer_id,TG_TABLE_NAME,NEW.id,NEW.currency_id,NEW.amount,NEW.the_date,ref,auth.uid());
  IF NEW.branch_commission>0 THEN INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,debit,the_date,notes,created_by) VALUES(NEW.customer_id,TG_TABLE_NAME,NEW.id,COALESCE(NEW.commission_currency_id,NEW.currency_id),NEW.branch_commission,NEW.the_date,'عمولة '||ref,auth.uid()); END IF;
 ELSIF TG_TABLE_NAME='outgoing_transfers' AND TG_OP='UPDATE' AND NEW.canceled AND NOT OLD.canceled THEN
  INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,credit,the_date,notes,created_by) VALUES(NEW.customer_id,TG_TABLE_NAME,NEW.id,NEW.currency_id,NEW.amount,public.aden_date(now()),'إلغاء '||ref,auth.uid());
  IF NEW.branch_commission>0 THEN INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,credit,the_date,notes,created_by) VALUES(NEW.customer_id,TG_TABLE_NAME,NEW.id,COALESCE(NEW.commission_currency_id,NEW.currency_id),NEW.branch_commission,public.aden_date(now()),'رد عمولة '||ref,auth.uid()); END IF;
 ELSIF TG_TABLE_NAME='incoming_transfers' AND TG_OP='UPDATE' AND NEW.delivered AND NOT OLD.delivered THEN
  INSERT INTO public.customer_transfer_movements(customer_id,source_type,source_id,currency_id,credit,the_date,notes,created_by) VALUES(NEW.customer_id,TG_TABLE_NAME,NEW.id,NEW.currency_id,NEW.amount,public.aden_date(now()),'تسليم إلى الحساب '||ref,auth.uid());
 END IF;
 RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.unlock_staff_session(p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE s public.staff_session_locks;
BEGIN
 IF auth.uid() IS NULL OR NOT public.staff_mfa_satisfied() THEN RETURN false; END IF;
 SELECT * INTO s FROM staff_session_locks WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier() FOR UPDATE;
 IF NOT FOUND OR s.failed_attempts>=5 THEN RETURN false; END IF;
 IF p_pin ~ '^[0-9]{6}$' AND s.pin_hash=extensions.crypt(p_pin,s.pin_hash) THEN
 UPDATE staff_session_locks SET locked=false,failed_attempts=0,updated_at=now() WHERE user_id=s.user_id AND session_id=s.session_id;
 RETURN true;
 END IF;
 UPDATE staff_session_locks SET failed_attempts=failed_attempts+1,updated_at=now() WHERE user_id=s.user_id AND session_id=s.session_id;
 RETURN false;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.validate_exchange_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.payment_method IS DISTINCT FROM OLD.payment_method OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR (OLD.payment_method = 'account' AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.exchange_amount IS DISTINCT FROM OLD.exchange_amount
         OR NEW.commission IS DISTINCT FROM OLD.commission OR NEW.currency_id IS DISTINCT FROM OLD.currency_id OR NEW.exchange_currency_id IS DISTINCT FROM OLD.exchange_currency_id))) THEN
    RAISE EXCEPTION 'EXCHANGE_PAYMENT_IMMUTABLE';
  END IF;
  IF NEW.payment_method = 'account' THEN
    IF NEW.customer_id IS NULL THEN RAISE EXCEPTION 'EXCHANGE_CUSTOMER_REQUIRED'; END IF;
    NEW.box_id := NULL;
    SELECT account_id INTO NEW.account_id FROM public.customers WHERE id = NEW.customer_id;
  ELSE
    NEW.customer_id := NULL;
  END IF;
  RETURN NEW;
END $function$;
--@@
CREATE OR REPLACE FUNCTION public.validate_staff_work_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NEW.enforce_box AND NEW.box_id IS NULL THEN RAISE EXCEPTION 'ASSIGNED_BOX_REQUIRED'; END IF;
 IF NEW.enforce_currency AND NEW.currency_id IS NULL THEN RAISE EXCEPTION 'ASSIGNED_CURRENCY_REQUIRED'; END IF;
 IF NEW.box_id IS NOT NULL AND NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boxes WHERE id = NEW.box_id AND branch_id = NEW.branch_id) THEN RAISE EXCEPTION 'BOX_BRANCH_MISMATCH'; END IF;
 NEW.updated_at := now(); NEW.updated_by := auth.uid(); RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.validate_transfer_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.checks;
BEGIN
 IF NEW.payment_method='check' THEN
  SELECT * INTO c FROM public.checks WHERE id=NEW.check_id FOR UPDATE;
  IF NOT FOUND OR c.check_type<>'وارد' OR c.status='مرتجع' THEN RAISE EXCEPTION 'TRANSFER_CHECK_REQUIRED'; END IF;
  IF c.currency_id<>NEW.currency_id OR c.amount<>NEW.amount+NEW.branch_commission OR COALESCE(NEW.commission_currency_id,NEW.currency_id)<>NEW.currency_id THEN RAISE EXCEPTION 'TRANSFER_CHECK_AMOUNT_MISMATCH'; END IF;
  NEW.box_id:=NULL;
 ELSE
  IF NEW.check_id IS NOT NULL THEN RAISE EXCEPTION 'TRANSFER_CHECK_METHOD_REQUIRED'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.check_id IS DISTINCT FROM OLD.check_id THEN RAISE EXCEPTION 'TRANSFER_FINANCE_IMMUTABLE'; END IF;
  IF NEW.payment_method='check' AND NEW.canceled AND NOT OLD.canceled THEN RAISE EXCEPTION 'TRANSFER_CHECK_CANCEL_REQUIRES_SETTLEMENT'; END IF;
 END IF;
 RETURN NEW;
END; $function$;
--@@
CREATE OR REPLACE FUNCTION public.validate_transfer_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d public.staff_work_defaults;
BEGIN
 IF TG_OP='DELETE' THEN IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'TRANSFER_DELETE_FORBIDDEN'; END IF; RETURN OLD; END IF;
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
CREATE TABLE public.account_groups (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "group_name" text NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.accounts (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "account_number" bigint NOT NULL,
  "father_number" bigint,
  "account_name" text NOT NULL,
  "account_type" text DEFAULT 'فرعي'::text NOT NULL,
  "account_reference" text,
  "trade_name" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "group_id" bigint,
  "ceiling_amount" numeric,
  "ceiling_currency_id" bigint
);
--@@
CREATE TABLE public.activation_codes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "installation_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "licensed_until" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "used_at" timestamp with time zone,
  "used_by" uuid,
  "revoked_at" timestamp with time zone
);
--@@
CREATE TABLE public.activity_log (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" uuid DEFAULT auth.uid(),
  "username" text,
  "action" text NOT NULL,
  "target" text,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.admin_setup_claim (
  "id" integer DEFAULT 1 NOT NULL,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.agent_settlements (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "agent_id" bigint NOT NULL,
  "currency_id" bigint NOT NULL,
  "amount" numeric NOT NULL,
  "direction" text NOT NULL,
  "box_id" bigint,
  "the_date" date DEFAULT aden_date(now()) NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_ref" uuid,
  "document_number" bigint
);
--@@
CREATE TABLE public.agents (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "agent_name" text NOT NULL,
  "account_id" bigint,
  "phone" text,
  "address" text,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classification_id" bigint,
  "client_ref" uuid
);
--@@
CREATE TABLE public.areas (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "governorate_id" bigint NOT NULL,
  "area_name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.auto_reply_commands (
  "code" integer NOT NULL,
  "label" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--@@
CREATE TABLE public.auto_reply_settings (
  "id" smallint DEFAULT 1 NOT NULL,
  "phone_number" text DEFAULT ''::text NOT NULL,
  "display_name" text DEFAULT ''::text NOT NULL,
  "instructions_hours" integer DEFAULT 24 NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "instructions_enabled" boolean DEFAULT false NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.bank_accounts (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "bank_id" bigint NOT NULL,
  "account_number" text NOT NULL,
  "account_name" text,
  "account_type" text,
  "currency_id" bigint,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.banks (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "bank_name" text NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.blacklist (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "full_name" text NOT NULL,
  "identity_number" text,
  "phone_number" text,
  "reason" text,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.box_closings (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "box_id" bigint NOT NULL,
  "currency_id" bigint NOT NULL,
  "close_date" date NOT NULL,
  "system_balance" numeric DEFAULT 0 NOT NULL,
  "counted_amount" numeric NOT NULL,
  "difference" numeric GENERATED ALWAYS AS ((counted_amount - system_balance)) STORED,
  "notes" text,
  "closed_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.box_movements (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "box_id" bigint NOT NULL,
  "currency_id" bigint,
  "amount" numeric(20,4) DEFAULT 0 NOT NULL,
  "movement_type" text DEFAULT 'قبض'::text NOT NULL,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_type" text,
  "source_id" bigint,
  "client_ref" uuid
);
--@@
CREATE TABLE public.boxes (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "box_name" text NOT NULL,
  "account_id" bigint,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.branches (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "branch_name" text NOT NULL,
  "english_name" text,
  "phone" text,
  "address" text,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.buy_currencies (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "amount" numeric(18,6) NOT NULL,
  "currency_id" bigint,
  "price" numeric(18,6) NOT NULL,
  "account_id" bigint,
  "exchange_amount" numeric(18,6),
  "exchange_currency_id" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "cash_customer_name" text,
  "customer_phone" text,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "box_id" bigint,
  "commission" numeric DEFAULT 0 NOT NULL,
  "client_ref" uuid,
  "document_number" bigint,
  "payment_method" text DEFAULT 'cash'::text NOT NULL,
  "customer_id" bigint
);
--@@
CREATE TABLE public.cash_vouchers (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "voucher_type" text NOT NULL,
  "customer_id" bigint,
  "cash_name" text,
  "amount" numeric NOT NULL,
  "currency_id" bigint NOT NULL,
  "box_id" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_ref" uuid,
  "document_number" bigint,
  "batch_id" uuid,
  "batch_position" integer
);
--@@
CREATE TABLE public.check_books (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "bank_id" bigint,
  "account_number" text,
  "from_number" bigint NOT NULL,
  "to_number" bigint NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.checks (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "check_type" text NOT NULL,
  "check_number" text NOT NULL,
  "bank_name" text,
  "customer_id" bigint,
  "party_name" text,
  "amount" numeric NOT NULL,
  "currency_id" bigint NOT NULL,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "due_date" date,
  "status" text DEFAULT 'تحت التحصيل'::text NOT NULL,
  "box_id" bigint,
  "collected_date" date,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_ref" uuid,
  "document_number" bigint,
  "book_id" bigint,
  "bank_id" bigint,
  "check_account_number" text,
  "check_account_name" text,
  "beneficiary_name" text,
  "exchange_amount" numeric,
  "exchange_currency_id" bigint
);
--@@
CREATE TABLE public.classifications (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "classification_name" text NOT NULL,
  "applies_to" text DEFAULT 'customer'::text NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.commission_rules (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "document_type" text NOT NULL,
  "currency_id" bigint,
  "agent_id" bigint,
  "amount_from" numeric,
  "amount_to" numeric,
  "method" text NOT NULL,
  "commission_value" numeric NOT NULL,
  "min_commission" numeric,
  "max_commission" numeric,
  "commission_currency_id" bigint,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.cost_centers (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "center_name" text NOT NULL,
  "parent_id" bigint,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.countries (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "country_name" text NOT NULL,
  "phone_code" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.currencies (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "currency_name" text NOT NULL,
  "arabic_code" text,
  "english_code" text,
  "iso_code" text,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "min_sell_price" numeric,
  "max_buy_price" numeric
);
--@@
CREATE TABLE public.currency_prices (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "source_currency_id" bigint NOT NULL,
  "target_currency_id" bigint NOT NULL,
  "exchange_price" numeric(18,6) DEFAULT 0 NOT NULL,
  "buy_price" numeric(18,6) DEFAULT 0 NOT NULL,
  "sell_price" numeric(18,6) DEFAULT 0 NOT NULL,
  "min_price" numeric(18,6) DEFAULT 0 NOT NULL,
  "max_price" numeric(18,6) DEFAULT 0 NOT NULL,
  "notes" text,
  "updated_by" uuid DEFAULT auth.uid(),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.currency_rate_history (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "source_currency_id" bigint NOT NULL,
  "target_currency_id" bigint NOT NULL,
  "buy_price" numeric NOT NULL,
  "sell_price" numeric NOT NULL,
  "exchange_price" numeric NOT NULL,
  "changed_by" uuid DEFAULT auth.uid(),
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.customer_transfer_movements (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "customer_id" bigint NOT NULL,
  "source_type" text NOT NULL,
  "source_id" bigint NOT NULL,
  "currency_id" bigint NOT NULL,
  "debit" numeric DEFAULT 0 NOT NULL,
  "credit" numeric DEFAULT 0 NOT NULL,
  "the_date" date NOT NULL,
  "notes" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.customers (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_user_id" bigint,
  "account_id" bigint,
  "full_name" text NOT NULL,
  "phone_number" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classification_id" bigint,
  "client_ref" uuid,
  "credit_limit" numeric,
  "stopped" boolean DEFAULT false NOT NULL,
  "stop_reason" text
);
--@@
CREATE TABLE public.document_counters (
  "scope" text NOT NULL,
  "last_number" bigint DEFAULT 0 NOT NULL
);
--@@
CREATE TABLE public.document_number_registry (
  "scope" text NOT NULL,
  "number" bigint NOT NULL,
  "source_table" text NOT NULL,
  "source_id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.entries (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "entry_number" bigint NOT NULL,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "notes" text,
  "debited" boolean DEFAULT true NOT NULL,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "document_number" bigint,
  "posting_source" text,
  "posting_source_id" bigint,
  "posting_reversal_of" bigint
);
--@@
CREATE TABLE public.entries_details (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "entry_id" bigint NOT NULL,
  "entry_index" bigint,
  "side" text DEFAULT 'مدين'::text NOT NULL,
  "amount" numeric(20,4) DEFAULT 0 NOT NULL,
  "currency_id" bigint,
  "account_id" bigint,
  "notes" text,
  "settlement_mirror" boolean DEFAULT false NOT NULL
);
--@@
CREATE TABLE public.financial_years (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_year" integer NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.forbidden_texts (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "forbidden_text" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.funds_inventory (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "box_id" bigint NOT NULL,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "voided_at" timestamp with time zone
);
--@@
CREATE TABLE public.funds_inventory_details (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "inventory_id" bigint NOT NULL,
  "currency_id" bigint NOT NULL,
  "system_amount" numeric DEFAULT 0 NOT NULL,
  "real_amount" numeric DEFAULT 0 NOT NULL,
  "difference" numeric GENERATED ALWAYS AS ((real_amount - system_amount)) STORED,
  "notes" text
);
--@@
CREATE TABLE public.governorates (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "governorate_name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.group_screen_permissions (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "group_id" bigint NOT NULL,
  "screen_path" text NOT NULL,
  "can_view" boolean DEFAULT true NOT NULL,
  "can_create" boolean DEFAULT false NOT NULL,
  "can_update" boolean DEFAULT false NOT NULL,
  "can_delete" boolean DEFAULT false NOT NULL,
  "can_print" boolean DEFAULT false NOT NULL,
  "extra_actions" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--@@
CREATE TABLE public.incoming_transfers (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "transfer_number" bigint,
  "amount" numeric(18,6) NOT NULL,
  "currency_id" bigint NOT NULL,
  "receiver_name" text NOT NULL,
  "receiver_phone" text DEFAULT ''::text,
  "sender_name" text NOT NULL,
  "sender_phone" text DEFAULT ''::text,
  "agent_id" bigint,
  "state" text DEFAULT 'معلقة'::text,
  "branch_commission" numeric(18,6) DEFAULT 0 NOT NULL,
  "commission_currency_id" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "notes" text,
  "delivered" boolean DEFAULT false NOT NULL,
  "canceled" boolean DEFAULT false NOT NULL,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "box_id" bigint,
  "delivered_at" timestamp with time zone,
  "delivered_by" uuid,
  "receiver_id_number" text,
  "payment_method" text DEFAULT 'cash'::text NOT NULL,
  "customer_id" bigint,
  "source_name" text,
  "destination_name" text,
  "reference_number" text,
  "transfer_purpose" text,
  "receiver_identity_type" text,
  "receiver_identity_number" text,
  "exported_at" timestamp with time zone,
  "exported_by" uuid,
  "export_agent_id" bigint,
  "export_notes" text,
  "country_id" bigint,
  "governorate_id" bigint,
  "area_id" bigint,
  "internal_outgoing_id" bigint,
  "client_ref" uuid,
  "document_number" bigint
);
--@@
CREATE TABLE public.installation_license (
  "singleton" integer DEFAULT 1 NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_name" text NOT NULL,
  "trial_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trial_ends_at" timestamp with time zone DEFAULT (((now() AT TIME ZONE 'Asia/Aden'::text) + '1 mon'::interval) AT TIME ZONE 'Asia/Aden'::text) NOT NULL,
  "activated" boolean DEFAULT false NOT NULL,
  "licensed_until" timestamp with time zone,
  "activated_by" uuid,
  "activated_at" timestamp with time zone
);
--@@
CREATE TABLE public.journal_vouchers (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "debit_account_id" bigint NOT NULL,
  "credit_account_id" bigint NOT NULL,
  "amount" numeric(20,4) NOT NULL,
  "currency_id" bigint NOT NULL,
  "notes" text,
  "entry_id" bigint,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_ref" uuid,
  "document_number" bigint
);
--@@
CREATE TABLE public.loop_entries (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "title" text NOT NULL,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.loop_entries_details (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "loop_id" bigint NOT NULL,
  "side" text DEFAULT 'مدين'::text NOT NULL,
  "amount" numeric NOT NULL,
  "currency_id" bigint NOT NULL,
  "account_id" bigint,
  "notes" text
);
--@@
CREATE TABLE public.loop_entries_runs (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "loop_id" bigint NOT NULL,
  "run_date" date DEFAULT CURRENT_DATE NOT NULL,
  "entry_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.outgoing_transfers (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "transfer_number" bigint,
  "amount" numeric(18,6) NOT NULL,
  "currency_id" bigint NOT NULL,
  "receiver_name" text NOT NULL,
  "receiver_phone" text DEFAULT ''::text,
  "sender_name" text NOT NULL,
  "sender_phone" text DEFAULT ''::text,
  "agent_id" bigint,
  "state" text DEFAULT 'معلقة'::text,
  "branch_commission" numeric(18,6) DEFAULT 0 NOT NULL,
  "commission_currency_id" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "notes" text,
  "delivered" boolean DEFAULT false NOT NULL,
  "canceled" boolean DEFAULT false NOT NULL,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "box_id" bigint,
  "payment_method" text DEFAULT 'cash'::text NOT NULL,
  "customer_id" bigint,
  "source_name" text,
  "destination_name" text,
  "reference_number" text,
  "transfer_purpose" text,
  "receiver_identity_type" text,
  "receiver_identity_number" text,
  "exported_at" timestamp with time zone,
  "exported_by" uuid,
  "export_agent_id" bigint,
  "export_notes" text,
  "check_id" bigint,
  "country_id" bigint,
  "governorate_id" bigint,
  "area_id" bigint,
  "is_internal" boolean DEFAULT false NOT NULL,
  "client_ref" uuid,
  "document_number" bigint
);
--@@
CREATE TABLE public.period_closings (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "period_type" text NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "entry_id" bigint,
  "closed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.platform_owners (
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.profiles (
  "id" uuid NOT NULL,
  "full_name" text DEFAULT ''::text NOT NULL,
  "phone" text DEFAULT ''::text NOT NULL,
  "branch_name" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "username" text
);
--@@
CREATE TABLE public.profiles_probe_x (
  "id" integer
);
--@@
CREATE TABLE public.receiver_cards (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "full_name" text NOT NULL,
  "phone_number" text,
  "identity_type" text,
  "identity_number" text,
  "country_id" bigint,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.sell_currencies (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "the_number" bigint,
  "amount" numeric(18,6) NOT NULL,
  "currency_id" bigint,
  "price" numeric(18,6) NOT NULL,
  "account_id" bigint,
  "exchange_amount" numeric(18,6),
  "exchange_currency_id" bigint,
  "the_date" date DEFAULT CURRENT_DATE NOT NULL,
  "cash_customer_name" text,
  "customer_phone" text,
  "notes" text,
  "branch_id" bigint,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "box_id" bigint,
  "commission" numeric DEFAULT 0 NOT NULL,
  "client_ref" uuid,
  "document_number" bigint,
  "payment_method" text DEFAULT 'cash'::text NOT NULL,
  "customer_id" bigint
);
--@@
CREATE TABLE public.staff_announcements (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.staff_session_locks (
  "user_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "pin_hash" text NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.staff_work_defaults (
  "user_id" uuid NOT NULL,
  "branch_id" bigint,
  "box_id" bigint,
  "currency_id" bigint,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "enforce_box" boolean DEFAULT false NOT NULL,
  "enforce_currency" boolean DEFAULT false NOT NULL,
  "allow_past_date" boolean DEFAULT true NOT NULL,
  "allow_future_date" boolean DEFAULT true NOT NULL,
  "allow_buy" boolean DEFAULT true NOT NULL,
  "allow_sell" boolean DEFAULT true NOT NULL
);
--@@
CREATE TABLE public.system_settings (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "scope" text NOT NULL,
  "owner" text NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by" uuid DEFAULT auth.uid(),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.transfer_entities (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "entity_name" text NOT NULL,
  "country_id" bigint,
  "phone_number" text,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.transfer_purposes (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "purpose_name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.transfer_requests (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "transfer_kind" text NOT NULL,
  "transfer_id" bigint NOT NULL,
  "request_type" text NOT NULL,
  "reason" text NOT NULL,
  "payload" jsonb,
  "status" text DEFAULT 'معلق'::text NOT NULL,
  "requested_by" uuid,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.user_group_members (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "group_id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.user_groups (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "the_number" bigint NOT NULL,
  "group_name" text NOT NULL,
  "allowed_screens" text[] DEFAULT '{}'::text[] NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.user_roles (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" app_role NOT NULL
);
--@@
CREATE TABLE public.user_screen_permissions (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" uuid NOT NULL,
  "screen_path" text NOT NULL,
  "can_view" boolean DEFAULT true NOT NULL,
  "can_create" boolean DEFAULT false NOT NULL,
  "can_update" boolean DEFAULT false NOT NULL,
  "can_delete" boolean DEFAULT false NOT NULL,
  "can_print" boolean DEFAULT false NOT NULL,
  "extra_actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.withdrawal_requests (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "customer_id" bigint NOT NULL,
  "currency_id" bigint NOT NULL,
  "amount" numeric NOT NULL,
  "reason" text,
  "status" text DEFAULT 'معلق'::text NOT NULL,
  "response" text,
  "requested_by" uuid,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--@@
CREATE TABLE public.zz_probe (
  "id" integer
);
--@@
CREATE TABLE public.inventory_postings (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "inventory_id" bigint NOT NULL,
  "entry_id" bigint NOT NULL,
  "difference_account_id" bigint NOT NULL,
  "posted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "posted_by" uuid DEFAULT auth.uid() NOT NULL,
  "reversal_entry_id" bigint,
  "reversed_at" timestamp with time zone,
  "reversed_by" uuid
);
--@@
ALTER TABLE public.account_groups ADD CONSTRAINT "account_groups_group_name_key" UNIQUE (group_name);
--@@
ALTER TABLE public.account_groups ADD CONSTRAINT "account_groups_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.accounts ADD CONSTRAINT "accounts_account_number_key" UNIQUE (account_number);
--@@
ALTER TABLE public.activation_codes ADD CONSTRAINT "activation_codes_code_hash_key" UNIQUE (code_hash);
--@@
ALTER TABLE public.agents ADD CONSTRAINT "agents_agent_name_key" UNIQUE (agent_name);
--@@
ALTER TABLE public.agents ADD CONSTRAINT "agents_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.areas ADD CONSTRAINT "areas_governorate_id_area_name_key" UNIQUE (governorate_id, area_name);
--@@
ALTER TABLE public.areas ADD CONSTRAINT "areas_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.bank_accounts ADD CONSTRAINT "bank_accounts_unique" UNIQUE (bank_id, account_number);
--@@
ALTER TABLE public.banks ADD CONSTRAINT "banks_bank_name_key" UNIQUE (bank_name);
--@@
ALTER TABLE public.blacklist ADD CONSTRAINT "blacklist_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.box_closings ADD CONSTRAINT "box_closings_box_id_currency_id_close_date_key" UNIQUE (box_id, currency_id, close_date);
--@@
ALTER TABLE public.boxes ADD CONSTRAINT "boxes_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.branches ADD CONSTRAINT "branches_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.classifications ADD CONSTRAINT "classifications_classification_name_applies_to_key" UNIQUE (classification_name, applies_to);
--@@
ALTER TABLE public.classifications ADD CONSTRAINT "classifications_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.countries ADD CONSTRAINT "countries_country_name_key" UNIQUE (country_name);
--@@
ALTER TABLE public.countries ADD CONSTRAINT "countries_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.currencies ADD CONSTRAINT "currencies_currency_name_key" UNIQUE (currency_name);
--@@
ALTER TABLE public.currencies ADD CONSTRAINT "currencies_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.currency_prices ADD CONSTRAINT "currency_prices_source_currency_id_target_currency_id_key" UNIQUE (source_currency_id, target_currency_id);
--@@
ALTER TABLE public.customers ADD CONSTRAINT "customers_phone_number_key" UNIQUE (phone_number);
--@@
ALTER TABLE public.customers ADD CONSTRAINT "customers_the_user_id_key" UNIQUE (the_user_id);
--@@
ALTER TABLE public.document_number_registry ADD CONSTRAINT "document_number_registry_source_table_source_id_key" UNIQUE (source_table, source_id);
--@@
ALTER TABLE public.financial_years ADD CONSTRAINT "financial_years_the_year_key" UNIQUE (the_year);
--@@
ALTER TABLE public.forbidden_texts ADD CONSTRAINT "forbidden_texts_forbidden_text_key" UNIQUE (forbidden_text);
--@@
ALTER TABLE public.forbidden_texts ADD CONSTRAINT "forbidden_texts_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.governorates ADD CONSTRAINT "governorates_country_id_governorate_name_key" UNIQUE (country_id, governorate_name);
--@@
ALTER TABLE public.governorates ADD CONSTRAINT "governorates_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.group_screen_permissions ADD CONSTRAINT "group_screen_permissions_group_id_screen_path_key" UNIQUE (group_id, screen_path);
--@@
ALTER TABLE public.installation_license ADD CONSTRAINT "installation_license_id_key" UNIQUE (id);
--@@
ALTER TABLE public.receiver_cards ADD CONSTRAINT "receiver_cards_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.system_settings ADD CONSTRAINT "system_settings_scope_owner_key_key" UNIQUE (scope, owner, key);
--@@
ALTER TABLE public.transfer_entities ADD CONSTRAINT "transfer_entities_entity_name_key" UNIQUE (entity_name);
--@@
ALTER TABLE public.transfer_entities ADD CONSTRAINT "transfer_entities_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.transfer_purposes ADD CONSTRAINT "transfer_purposes_purpose_name_key" UNIQUE (purpose_name);
--@@
ALTER TABLE public.transfer_purposes ADD CONSTRAINT "transfer_purposes_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.user_group_members ADD CONSTRAINT "user_group_members_group_id_user_id_key" UNIQUE (group_id, user_id);
--@@
ALTER TABLE public.user_groups ADD CONSTRAINT "user_groups_group_name_key" UNIQUE (group_name);
--@@
ALTER TABLE public.user_groups ADD CONSTRAINT "user_groups_the_number_key" UNIQUE (the_number);
--@@
ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
--@@
ALTER TABLE public.user_screen_permissions ADD CONSTRAINT "user_screen_permissions_user_id_screen_path_key" UNIQUE (user_id, screen_path);
--@@
ALTER TABLE public.account_groups ADD CONSTRAINT "account_groups_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.accounts ADD CONSTRAINT "accounts_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.activation_codes ADD CONSTRAINT "activation_codes_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.activity_log ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.admin_setup_claim ADD CONSTRAINT "admin_setup_claim_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.agent_settlements ADD CONSTRAINT "agent_settlements_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.agents ADD CONSTRAINT "agents_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.areas ADD CONSTRAINT "areas_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.auto_reply_commands ADD CONSTRAINT "auto_reply_commands_pkey" PRIMARY KEY (code);
--@@
ALTER TABLE public.auto_reply_settings ADD CONSTRAINT "auto_reply_settings_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.bank_accounts ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.banks ADD CONSTRAINT "banks_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.blacklist ADD CONSTRAINT "blacklist_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.box_closings ADD CONSTRAINT "box_closings_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.box_movements ADD CONSTRAINT "box_movements_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.boxes ADD CONSTRAINT "boxes_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.branches ADD CONSTRAINT "branches_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.check_books ADD CONSTRAINT "check_books_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.classifications ADD CONSTRAINT "classifications_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.cost_centers ADD CONSTRAINT "cost_centers_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.countries ADD CONSTRAINT "countries_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.currencies ADD CONSTRAINT "currencies_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.currency_prices ADD CONSTRAINT "currency_prices_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.currency_rate_history ADD CONSTRAINT "currency_rate_history_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.customer_transfer_movements ADD CONSTRAINT "customer_transfer_movements_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.customers ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.document_counters ADD CONSTRAINT "document_counters_pkey" PRIMARY KEY (scope);
--@@
ALTER TABLE public.document_number_registry ADD CONSTRAINT "document_number_registry_pkey" PRIMARY KEY (scope, number);
--@@
ALTER TABLE public.entries ADD CONSTRAINT "entries_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.entries_details ADD CONSTRAINT "entries_details_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.financial_years ADD CONSTRAINT "financial_years_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.forbidden_texts ADD CONSTRAINT "forbidden_texts_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.funds_inventory ADD CONSTRAINT "funds_inventory_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.funds_inventory_details ADD CONSTRAINT "funds_inventory_details_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.governorates ADD CONSTRAINT "governorates_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.group_screen_permissions ADD CONSTRAINT "group_screen_permissions_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.installation_license ADD CONSTRAINT "installation_license_pkey" PRIMARY KEY (singleton);
--@@
ALTER TABLE public.inventory_postings ADD CONSTRAINT "inventory_postings_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.loop_entries ADD CONSTRAINT "loop_entries_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.loop_entries_details ADD CONSTRAINT "loop_entries_details_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.loop_entries_runs ADD CONSTRAINT "loop_entries_runs_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.period_closings ADD CONSTRAINT "period_closings_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.platform_owners ADD CONSTRAINT "platform_owners_pkey" PRIMARY KEY (user_id);
--@@
ALTER TABLE public.profiles ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.receiver_cards ADD CONSTRAINT "receiver_cards_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.staff_announcements ADD CONSTRAINT "staff_announcements_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.staff_session_locks ADD CONSTRAINT "staff_session_locks_pkey" PRIMARY KEY (user_id, session_id);
--@@
ALTER TABLE public.staff_work_defaults ADD CONSTRAINT "staff_work_defaults_pkey" PRIMARY KEY (user_id);
--@@
ALTER TABLE public.system_settings ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.transfer_entities ADD CONSTRAINT "transfer_entities_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.transfer_purposes ADD CONSTRAINT "transfer_purposes_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.transfer_requests ADD CONSTRAINT "transfer_requests_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.user_group_members ADD CONSTRAINT "user_group_members_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.user_groups ADD CONSTRAINT "user_groups_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.user_screen_permissions ADD CONSTRAINT "user_screen_permissions_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY (id);
--@@
ALTER TABLE public.admin_setup_claim ADD CONSTRAINT "admin_setup_claim_id_check" CHECK ((id = 1));
--@@
ALTER TABLE public.agent_settlements ADD CONSTRAINT "agent_settlements_amount_check" CHECK ((amount > (0)::numeric));
--@@
ALTER TABLE public.agent_settlements ADD CONSTRAINT "agent_settlements_direction_check" CHECK ((direction = ANY (ARRAY['paid_to_agent'::text, 'received_from_agent'::text])));
--@@
ALTER TABLE public.auto_reply_settings ADD CONSTRAINT "auto_reply_settings_id_check" CHECK ((id = 1));
--@@
ALTER TABLE public.auto_reply_settings ADD CONSTRAINT "auto_reply_settings_instructions_hours_check" CHECK (((instructions_hours >= 1) AND (instructions_hours <= 720)));
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_payment_method_chk" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text])));
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_voucher_batch_shape" CHECK ((((batch_id IS NULL) AND (batch_position IS NULL)) OR ((batch_id IS NOT NULL) AND (batch_position > 0))));
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_amount_chk" CHECK ((amount > (0)::numeric));
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_party_chk" CHECK (((customer_id IS NOT NULL) OR (NULLIF(btrim(cash_name), ''::text) IS NOT NULL)));
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_type_chk" CHECK ((voucher_type = ANY (ARRAY['قبض'::text, 'صرف'::text, 'إيداع'::text])));
--@@
ALTER TABLE public.check_books ADD CONSTRAINT "check_books_range_chk" CHECK (((from_number > 0) AND (to_number >= from_number)));
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_amount_chk" CHECK ((amount > (0)::numeric));
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_party_chk" CHECK (((customer_id IS NOT NULL) OR (NULLIF(btrim(party_name), ''::text) IS NOT NULL)));
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_status_chk" CHECK ((status = ANY (ARRAY['تحت التحصيل'::text, 'محصل'::text, 'مرتجع'::text])));
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_type_chk" CHECK ((check_type = ANY (ARRAY['وارد'::text, 'صادر'::text])));
--@@
ALTER TABLE public.classifications ADD CONSTRAINT "classifications_applies_to_check" CHECK ((applies_to = ANY (ARRAY['customer'::text, 'agent'::text, 'both'::text])));
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_document_type_check" CHECK ((document_type = ANY (ARRAY['outgoing'::text, 'incoming'::text, 'buy'::text, 'sell'::text])));
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_method_check" CHECK ((method = ANY (ARRAY['percent'::text, 'fixed'::text])));
--@@
ALTER TABLE public.financial_years ADD CONSTRAINT "financial_years_dates_chk" CHECK ((end_date > start_date));
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_payment_method" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text])));
--@@
ALTER TABLE public.installation_license ADD CONSTRAINT "installation_license_singleton_check" CHECK ((singleton = 1));
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_accounts_chk" CHECK ((debit_account_id <> credit_account_id));
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_amount_chk" CHECK ((amount > (0)::numeric));
--@@
ALTER TABLE public.loop_entries_details ADD CONSTRAINT "loop_entries_details_amount_chk" CHECK ((amount > (0)::numeric));
--@@
ALTER TABLE public.loop_entries_details ADD CONSTRAINT "loop_entries_details_side_chk" CHECK ((side = ANY (ARRAY['مدين'::text, 'دائن'::text])));
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_payment_method" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text, 'check'::text])));
--@@
ALTER TABLE public.period_closings ADD CONSTRAINT "period_closings_check" CHECK ((from_date <= to_date));
--@@
ALTER TABLE public.period_closings ADD CONSTRAINT "period_closings_period_type_check" CHECK ((period_type = ANY (ARRAY['يومي'::text, 'أسبوعي'::text, 'شهري'::text, 'سنوي'::text])));
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_payment_method_chk" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text])));
--@@
ALTER TABLE public.staff_announcements ADD CONSTRAINT "staff_announcements_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));
--@@
ALTER TABLE public.staff_announcements ADD CONSTRAINT "staff_announcements_check" CHECK (((ends_at IS NULL) OR (ends_at > starts_at)));
--@@
ALTER TABLE public.staff_announcements ADD CONSTRAINT "staff_announcements_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));
--@@
ALTER TABLE public.system_settings ADD CONSTRAINT "system_settings_scope_check" CHECK ((scope = ANY (ARRAY['branch'::text, 'user'::text])));
--@@
ALTER TABLE public.transfer_requests ADD CONSTRAINT "transfer_requests_request_type_check" CHECK ((request_type = ANY (ARRAY['modify'::text, 'cancel'::text, 'stop'::text])));
--@@
ALTER TABLE public.transfer_requests ADD CONSTRAINT "transfer_requests_status_check" CHECK ((status = ANY (ARRAY['معلق'::text, 'مقبول'::text, 'مرفوض'::text])));
--@@
ALTER TABLE public.transfer_requests ADD CONSTRAINT "transfer_requests_transfer_kind_check" CHECK ((transfer_kind = ANY (ARRAY['outgoing'::text, 'incoming'::text])));
--@@
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT "withdrawal_requests_amount_check" CHECK ((amount > (0)::numeric));
--@@
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT "withdrawal_requests_status_check" CHECK ((status = ANY (ARRAY['معلق'::text, 'مقبول'::text, 'مرفوض'::text])));
--@@
ALTER TABLE public.accounts ADD CONSTRAINT "accounts_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.accounts ADD CONSTRAINT "accounts_group_id_fkey" FOREIGN KEY (group_id) REFERENCES account_groups(id);
--@@
ALTER TABLE public.activation_codes ADD CONSTRAINT "activation_codes_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES installation_license(id);
--@@
ALTER TABLE public.agent_settlements ADD CONSTRAINT "agent_settlements_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id);
--@@
ALTER TABLE public.agent_settlements ADD CONSTRAINT "agent_settlements_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.agent_settlements ADD CONSTRAINT "agent_settlements_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.agents ADD CONSTRAINT "agents_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.agents ADD CONSTRAINT "agents_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.agents ADD CONSTRAINT "agents_classification_id_fkey" FOREIGN KEY (classification_id) REFERENCES classifications(id);
--@@
ALTER TABLE public.areas ADD CONSTRAINT "areas_governorate_id_fkey" FOREIGN KEY (governorate_id) REFERENCES governorates(id);
--@@
ALTER TABLE public.bank_accounts ADD CONSTRAINT "bank_accounts_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES banks(id);
--@@
ALTER TABLE public.bank_accounts ADD CONSTRAINT "bank_accounts_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.box_closings ADD CONSTRAINT "box_closings_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.box_closings ADD CONSTRAINT "box_closings_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.box_movements ADD CONSTRAINT "box_movements_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.box_movements ADD CONSTRAINT "box_movements_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.box_movements ADD CONSTRAINT "box_movements_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.boxes ADD CONSTRAINT "boxes_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.boxes ADD CONSTRAINT "boxes_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.buy_currencies ADD CONSTRAINT "buy_currencies_exchange_currency_id_fkey" FOREIGN KEY (exchange_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.cash_vouchers ADD CONSTRAINT "cash_vouchers_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.check_books ADD CONSTRAINT "check_books_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES banks(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES banks(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_book_id_fkey" FOREIGN KEY (book_id) REFERENCES check_books(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.checks ADD CONSTRAINT "checks_exchange_currency_id_fkey" FOREIGN KEY (exchange_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id);
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_commission_currency_id_fkey" FOREIGN KEY (commission_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.commission_rules ADD CONSTRAINT "commission_rules_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.cost_centers ADD CONSTRAINT "cost_centers_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES cost_centers(id);
--@@
ALTER TABLE public.currency_prices ADD CONSTRAINT "currency_prices_source_currency_id_fkey" FOREIGN KEY (source_currency_id) REFERENCES currencies(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.currency_prices ADD CONSTRAINT "currency_prices_target_currency_id_fkey" FOREIGN KEY (target_currency_id) REFERENCES currencies(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.currency_rate_history ADD CONSTRAINT "currency_rate_history_source_currency_id_fkey" FOREIGN KEY (source_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.currency_rate_history ADD CONSTRAINT "currency_rate_history_target_currency_id_fkey" FOREIGN KEY (target_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.customer_transfer_movements ADD CONSTRAINT "customer_transfer_movements_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.customer_transfer_movements ADD CONSTRAINT "customer_transfer_movements_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.customers ADD CONSTRAINT "customers_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.customers ADD CONSTRAINT "customers_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.customers ADD CONSTRAINT "customers_classification_id_fkey" FOREIGN KEY (classification_id) REFERENCES classifications(id);
--@@
ALTER TABLE public.entries ADD CONSTRAINT "entries_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.entries ADD CONSTRAINT "entries_posting_reversal_of_fkey" FOREIGN KEY (posting_reversal_of) REFERENCES entries(id);
--@@
ALTER TABLE public.entries_details ADD CONSTRAINT "entries_details_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.entries_details ADD CONSTRAINT "entries_details_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.entries_details ADD CONSTRAINT "entries_details_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.funds_inventory ADD CONSTRAINT "funds_inventory_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.funds_inventory ADD CONSTRAINT "funds_inventory_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.funds_inventory_details ADD CONSTRAINT "funds_inventory_details_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.funds_inventory_details ADD CONSTRAINT "funds_inventory_details_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES funds_inventory(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.governorates ADD CONSTRAINT "governorates_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id);
--@@
ALTER TABLE public.group_screen_permissions ADD CONSTRAINT "group_screen_permissions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_area_id_fkey" FOREIGN KEY (area_id) REFERENCES areas(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_commission_currency_id_fkey" FOREIGN KEY (commission_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_export_agent_id_fkey" FOREIGN KEY (export_agent_id) REFERENCES agents(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_governorate_id_fkey" FOREIGN KEY (governorate_id) REFERENCES governorates(id);
--@@
ALTER TABLE public.incoming_transfers ADD CONSTRAINT "incoming_transfers_internal_outgoing_id_fkey" FOREIGN KEY (internal_outgoing_id) REFERENCES outgoing_transfers(id);
--@@
ALTER TABLE public.inventory_postings ADD CONSTRAINT "inventory_postings_difference_account_id_fkey" FOREIGN KEY (difference_account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.inventory_postings ADD CONSTRAINT "inventory_postings_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES entries(id);
--@@
ALTER TABLE public.inventory_postings ADD CONSTRAINT "inventory_postings_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES funds_inventory(id);
--@@
ALTER TABLE public.inventory_postings ADD CONSTRAINT "inventory_postings_reversal_entry_id_fkey" FOREIGN KEY (reversal_entry_id) REFERENCES entries(id);
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_credit_account_id_fkey" FOREIGN KEY (credit_account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_debit_account_id_fkey" FOREIGN KEY (debit_account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.journal_vouchers ADD CONSTRAINT "journal_vouchers_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL;
--@@
ALTER TABLE public.loop_entries ADD CONSTRAINT "loop_entries_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.loop_entries_details ADD CONSTRAINT "loop_entries_details_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.loop_entries_details ADD CONSTRAINT "loop_entries_details_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.loop_entries_details ADD CONSTRAINT "loop_entries_details_loop_id_fkey" FOREIGN KEY (loop_id) REFERENCES loop_entries(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.loop_entries_runs ADD CONSTRAINT "loop_entries_runs_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES entries(id);
--@@
ALTER TABLE public.loop_entries_runs ADD CONSTRAINT "loop_entries_runs_loop_id_fkey" FOREIGN KEY (loop_id) REFERENCES loop_entries(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_area_id_fkey" FOREIGN KEY (area_id) REFERENCES areas(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_check_id_fkey" FOREIGN KEY (check_id) REFERENCES checks(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_commission_currency_id_fkey" FOREIGN KEY (commission_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_export_agent_id_fkey" FOREIGN KEY (export_agent_id) REFERENCES agents(id);
--@@
ALTER TABLE public.outgoing_transfers ADD CONSTRAINT "outgoing_transfers_governorate_id_fkey" FOREIGN KEY (governorate_id) REFERENCES governorates(id);
--@@
ALTER TABLE public.profiles ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.receiver_cards ADD CONSTRAINT "receiver_cards_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
ALTER TABLE public.sell_currencies ADD CONSTRAINT "sell_currencies_exchange_currency_id_fkey" FOREIGN KEY (exchange_currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.staff_work_defaults ADD CONSTRAINT "staff_work_defaults_box_id_fkey" FOREIGN KEY (box_id) REFERENCES boxes(id);
--@@
ALTER TABLE public.staff_work_defaults ADD CONSTRAINT "staff_work_defaults_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);
--@@
ALTER TABLE public.staff_work_defaults ADD CONSTRAINT "staff_work_defaults_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.staff_work_defaults ADD CONSTRAINT "staff_work_defaults_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.transfer_entities ADD CONSTRAINT "transfer_entities_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id);
--@@
ALTER TABLE public.user_group_members ADD CONSTRAINT "user_group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.user_screen_permissions ADD CONSTRAINT "user_screen_permissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
--@@
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT "withdrawal_requests_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
--@@
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT "withdrawal_requests_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
--@@
CREATE INDEX activity_log_created_idx ON public.activity_log USING btree (created_at DESC);
--@@
CREATE UNIQUE INDEX cash_voucher_batch_position ON public.cash_vouchers USING btree (batch_id, batch_position) WHERE (batch_id IS NOT NULL);
--@@
CREATE UNIQUE INDEX customers_client_ref_key ON public.customers USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX incoming_internal_outgoing_unique ON public.incoming_transfers USING btree (internal_outgoing_id) WHERE (internal_outgoing_id IS NOT NULL);
--@@
CREATE UNIQUE INDEX box_movements_client_ref_key ON public.box_movements USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE INDEX box_movements_source_idx ON public.box_movements USING btree (source_type, source_id);
--@@
CREATE UNIQUE INDEX sell_currencies_client_ref_key ON public.sell_currencies USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX outgoing_transfers_client_ref_key ON public.outgoing_transfers USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX journal_vouchers_client_ref_key ON public.journal_vouchers USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX agents_client_ref_key ON public.agents USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX agent_settlements_client_ref_key ON public.agent_settlements USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE INDEX accounts_father_idx ON public.accounts USING btree (father_number);
--@@
CREATE UNIQUE INDEX commission_one_original ON public.entries USING btree (posting_source, posting_source_id) WHERE ((posting_source ~~ 'commission:%'::text) AND (posting_reversal_of IS NULL));
--@@
CREATE UNIQUE INDEX cash_voucher_batch_currency ON public.cash_vouchers USING btree (batch_id, currency_id) WHERE (batch_id IS NOT NULL);
--@@
CREATE UNIQUE INDEX buy_currencies_client_ref_key ON public.buy_currencies USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX outgoing_unique_check ON public.outgoing_transfers USING btree (check_id) WHERE (check_id IS NOT NULL);
--@@
CREATE UNIQUE INDEX checks_client_ref_key ON public.checks USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX financial_one_reversal ON public.entries USING btree (posting_reversal_of) WHERE (posting_reversal_of IS NOT NULL);
--@@
CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (lower(username));
--@@
CREATE INDEX announcements_current_idx ON public.staff_announcements USING btree (active, starts_at, ends_at);
--@@
CREATE UNIQUE INDEX cash_vouchers_client_ref_key ON public.cash_vouchers USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX incoming_transfers_client_ref_key ON public.incoming_transfers USING btree (client_ref) WHERE (client_ref IS NOT NULL);
--@@
CREATE UNIQUE INDEX inventory_one_active_posting ON public.inventory_postings USING btree (inventory_id) WHERE (reversal_entry_id IS NULL);
--@@
CREATE TRIGGER account_groups_autonumber BEFORE INSERT ON public.account_groups FOR EACH ROW EXECUTE FUNCTION setup_autonumber();
--@@
CREATE TRIGGER accounts_autonumber BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION accounts_autonumber();
--@@
CREATE TRIGGER accounts_guard_delete BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION accounts_guard_delete();
--@@
CREATE TRIGGER audit_accounts AFTER INSERT OR DELETE OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER activity_log_username BEFORE INSERT ON public.activity_log FOR EACH ROW EXECUTE FUNCTION log_activity_username();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER audit_agent_settlements AFTER INSERT OR DELETE OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER settlements_to_box AFTER INSERT OR DELETE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION ops_to_box();
--@@
CREATE TRIGGER agents_autoaccount BEFORE INSERT ON public.agents FOR EACH ROW EXECUTE FUNCTION party_autoaccount();
--@@
CREATE TRIGGER agents_drop_account AFTER DELETE ON public.agents FOR EACH ROW EXECUTE FUNCTION party_drop_account();
--@@
CREATE TRIGGER agents_sync_account AFTER UPDATE OF agent_name ON public.agents FOR EACH ROW EXECUTE FUNCTION party_sync_account();
--@@
CREATE TRIGGER audit_agents AFTER INSERT OR DELETE OR UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER areas_autonumber BEFORE INSERT ON public.areas FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER audit_areas AFTER INSERT OR DELETE OR UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_bank_accounts AFTER INSERT OR DELETE OR UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_banks AFTER INSERT OR DELETE OR UPDATE ON public.banks FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_blacklist AFTER INSERT OR DELETE OR UPDATE ON public.blacklist FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER blacklist_autonumber BEFORE INSERT ON public.blacklist FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER audit_box_closings AFTER INSERT OR DELETE OR UPDATE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER box_closings_action_permissions BEFORE INSERT OR DELETE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION guard_closing_permissions();
--@@
CREATE TRIGGER box_closings_balance BEFORE INSERT ON public.box_closings FOR EACH ROW EXECUTE FUNCTION closing_compute_balance();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aac_lock_box_movement BEFORE INSERT ON public.box_movements FOR EACH ROW EXECUTE FUNCTION lock_box_for_movement();
--@@
CREATE TRIGGER audit_box_movements AFTER INSERT OR DELETE OR UPDATE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER box_movements_guard BEFORE INSERT OR DELETE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION guard_closed_box();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER audit_boxes AFTER INSERT OR DELETE OR UPDATE ON public.boxes FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER boxes_autoaccount BEFORE INSERT ON public.boxes FOR EACH ROW EXECUTE FUNCTION party_autoaccount();
--@@
CREATE TRIGGER boxes_drop_account AFTER DELETE ON public.boxes FOR EACH ROW EXECUTE FUNCTION party_drop_account();
--@@
CREATE TRIGGER boxes_guard_delete BEFORE DELETE ON public.boxes FOR EACH ROW EXECUTE FUNCTION boxes_guard_delete();
--@@
CREATE TRIGGER boxes_sync_account AFTER UPDATE OF box_name ON public.boxes FOR EACH ROW EXECUTE FUNCTION party_sync_account();
--@@
CREATE TRIGGER audit_branches AFTER INSERT OR DELETE OR UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER branches_autonumber BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION setup_autonumber();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER aac_validate_exchange_payment BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION validate_exchange_payment();
--@@
CREATE TRIGGER audit_buy_currencies AFTER INSERT OR DELETE OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER buy_to_box AFTER INSERT OR DELETE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION ops_to_box();
--@@
CREATE TRIGGER exchange_to_customer AFTER INSERT OR DELETE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION exchange_to_customer();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER operation_commission AFTER INSERT OR DELETE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION post_operation_commission();
--@@
CREATE TRIGGER trg_buy_customer_stopped BEFORE INSERT ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION enforce_customer_not_stopped();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER aac_voucher_batch BEFORE INSERT OR DELETE OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION guard_voucher_batch();
--@@
CREATE TRIGGER audit_cash_vouchers AFTER INSERT OR DELETE OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER cash_vouchers_autonumber BEFORE INSERT ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION cash_vouchers_autonumber();
--@@
CREATE TRIGGER cash_vouchers_to_box_del AFTER DELETE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION cash_voucher_to_box();
--@@
CREATE TRIGGER cash_vouchers_to_box_ins AFTER INSERT ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION cash_voucher_to_box();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER trg_cash_vouchers_customer_stopped BEFORE INSERT ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION enforce_customer_not_stopped();
--@@
CREATE TRIGGER audit_check_books AFTER INSERT OR DELETE OR UPDATE ON public.check_books FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER a_guard_linked_transfer_check BEFORE DELETE OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION guard_linked_transfer_check();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER audit_checks AFTER INSERT OR DELETE OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER check_book_guard BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION check_book_guard();
--@@
CREATE TRIGGER check_to_box_del AFTER DELETE ON public.checks FOR EACH ROW EXECUTE FUNCTION check_to_box();
--@@
CREATE TRIGGER check_to_box_upd AFTER UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION check_to_box();
--@@
CREATE TRIGGER checks_action_permissions BEFORE UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION guard_action_permissions();
--@@
CREATE TRIGGER checks_autonumber BEFORE INSERT ON public.checks FOR EACH ROW EXECUTE FUNCTION checks_autonumber();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER classifications_autonumber BEFORE INSERT ON public.classifications FOR EACH ROW EXECUTE FUNCTION setup_autonumber();
--@@
CREATE TRIGGER audit_commission_rules AFTER INSERT OR DELETE OR UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_cost_centers AFTER INSERT OR DELETE OR UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER cost_centers_autonumber BEFORE INSERT ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION cost_centers_autonumber();
--@@
CREATE TRIGGER audit_countries AFTER INSERT OR DELETE OR UPDATE ON public.countries FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER countries_autonumber BEFORE INSERT ON public.countries FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER audit_currencies AFTER INSERT OR DELETE OR UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_currency_prices AFTER INSERT OR DELETE OR UPDATE ON public.currency_prices FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER record_currency_rate_history AFTER INSERT OR UPDATE ON public.currency_prices FOR EACH ROW EXECUTE FUNCTION record_currency_rate_history();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.customer_transfer_movements FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER audit_customer_transfer_movements AFTER INSERT ON public.customer_transfer_movements FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_customers AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER customers_autoaccount BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION party_autoaccount();
--@@
CREATE TRIGGER customers_drop_account AFTER DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION party_drop_account();
--@@
CREATE TRIGGER customers_sync_account AFTER UPDATE OF full_name ON public.customers FOR EACH ROW EXECUTE FUNCTION party_sync_account();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER audit_entries AFTER INSERT OR DELETE OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER entries_period_guard BEFORE INSERT ON public.entries FOR EACH ROW EXECUTE FUNCTION entry_period_guard();
--@@
CREATE TRIGGER guard_managed_entry BEFORE INSERT OR DELETE OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION guard_managed_financial_entry();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER audit_entries_details AFTER INSERT OR DELETE OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER guard_managed_entry_detail BEFORE INSERT OR DELETE OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION guard_managed_financial_entry();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER audit_financial_years AFTER INSERT OR DELETE OR UPDATE ON public.financial_years FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_forbidden_texts AFTER INSERT OR DELETE OR UPDATE ON public.forbidden_texts FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER forbidden_texts_autonumber BEFORE INSERT ON public.forbidden_texts FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER audit_funds_inventory AFTER INSERT OR DELETE OR UPDATE ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER funds_inventory_autonumber BEFORE INSERT ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION funds_inventory_autonumber();
--@@
CREATE TRIGGER guard_inventory_header BEFORE DELETE OR UPDATE ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION guard_inventory_history();
--@@
CREATE TRIGGER inventory_staff_box BEFORE INSERT OR UPDATE ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER inventory_staff_date BEFORE INSERT OR UPDATE ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER audit_funds_inventory_details AFTER INSERT OR DELETE OR UPDATE ON public.funds_inventory_details FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER guard_inventory_detail BEFORE INSERT OR DELETE OR UPDATE ON public.funds_inventory_details FOR EACH ROW EXECUTE FUNCTION guard_inventory_history();
--@@
CREATE TRIGGER inventory_staff_currency BEFORE INSERT OR UPDATE ON public.funds_inventory_details FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER audit_governorates AFTER INSERT OR DELETE OR UPDATE ON public.governorates FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER governorates_autonumber BEFORE INSERT ON public.governorates FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER audit_group_screen_permissions AFTER INSERT OR DELETE OR UPDATE ON public.group_screen_permissions FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER "00_guard_internal" BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION guard_internal_transfer();
--@@
CREATE TRIGGER a_validate_transfer_payment BEFORE INSERT OR DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION validate_transfer_payment();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER audit_incoming_transfers AFTER INSERT OR DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER incoming_autonumber BEFORE INSERT ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION transfer_autonumber();
--@@
CREATE TRIGGER incoming_customer AFTER UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION transfer_to_customer();
--@@
CREATE TRIGGER incoming_state_guard BEFORE UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION guard_transfer_state();
--@@
CREATE TRIGGER incoming_to_box AFTER DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION ops_to_box();
--@@
CREATE TRIGGER incoming_transfers_action_permissions BEFORE UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION guard_action_permissions();
--@@
CREATE TRIGGER trg_incoming_customer_stopped BEFORE INSERT ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION enforce_customer_not_stopped();
--@@
CREATE TRIGGER zz_route_internal AFTER UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION route_internal_transfer();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER audit_journal_vouchers AFTER INSERT OR DELETE OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER journal_vouchers_autonumber BEFORE INSERT ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION journal_vouchers_autonumber();
--@@
CREATE TRIGGER journal_vouchers_to_entry_del AFTER DELETE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION journal_voucher_to_entry();
--@@
CREATE TRIGGER journal_vouchers_to_entry_ins AFTER INSERT ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION journal_voucher_to_entry();
--@@
CREATE TRIGGER audit_loop_entries AFTER INSERT OR DELETE OR UPDATE ON public.loop_entries FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER loop_entries_autonumber BEFORE INSERT ON public.loop_entries FOR EACH ROW EXECUTE FUNCTION loop_entries_autonumber();
--@@
CREATE TRIGGER audit_loop_entries_details AFTER INSERT OR DELETE OR UPDATE ON public.loop_entries_details FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_loop_entries_runs AFTER INSERT OR DELETE OR UPDATE ON public.loop_entries_runs FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER "00_guard_internal" BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION guard_internal_transfer();
--@@
CREATE TRIGGER a_validate_transfer_payment BEFORE INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION validate_transfer_payment();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER audit_outgoing_transfers AFTER INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER operation_commission AFTER INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION post_operation_commission();
--@@
CREATE TRIGGER outgoing_autonumber BEFORE INSERT ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION transfer_autonumber();
--@@
CREATE TRIGGER outgoing_customer AFTER INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION transfer_to_customer();
--@@
CREATE TRIGGER outgoing_state_guard BEFORE UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION guard_transfer_state();
--@@
CREATE TRIGGER outgoing_to_box AFTER INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION ops_to_box();
--@@
CREATE TRIGGER outgoing_transfers_action_permissions BEFORE UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION guard_action_permissions();
--@@
CREATE TRIGGER trg_outgoing_customer_stopped BEFORE INSERT ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION enforce_customer_not_stopped();
--@@
CREATE TRIGGER z_validate_transfer_check BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION validate_transfer_check();
--@@
CREATE TRIGGER zz_route_internal AFTER INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION route_internal_transfer();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.period_closings FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER audit_period_closings AFTER INSERT OR DELETE OR UPDATE ON public.period_closings FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_profiles AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--@@
CREATE TRIGGER audit_receiver_cards AFTER INSERT OR DELETE OR UPDATE ON public.receiver_cards FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER receiver_cards_autonumber BEFORE INSERT ON public.receiver_cards FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION guard_license_operation();
--@@
CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION assign_document_number();
--@@
CREATE TRIGGER aac_validate_exchange_payment BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION validate_exchange_payment();
--@@
CREATE TRIGGER audit_sell_currencies AFTER INSERT OR DELETE OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER exchange_to_customer AFTER INSERT OR DELETE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION exchange_to_customer();
--@@
CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION guard_staff_work_assignment();
--@@
CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION guard_staff_date();
--@@
CREATE TRIGGER operation_commission AFTER INSERT OR DELETE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION post_operation_commission();
--@@
CREATE TRIGGER sell_to_box AFTER INSERT OR DELETE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION ops_to_box();
--@@
CREATE TRIGGER trg_sell_customer_stopped BEFORE INSERT ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION enforce_customer_not_stopped();
--@@
CREATE TRIGGER audit_staff_work_defaults AFTER INSERT OR DELETE OR UPDATE ON public.staff_work_defaults FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER validate_staff_work_defaults BEFORE INSERT OR UPDATE ON public.staff_work_defaults FOR EACH ROW EXECUTE FUNCTION validate_staff_work_defaults();
--@@
CREATE TRIGGER audit_transfer_entities AFTER INSERT OR DELETE OR UPDATE ON public.transfer_entities FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER transfer_entities_autonumber BEFORE INSERT ON public.transfer_entities FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER audit_transfer_purposes AFTER INSERT OR DELETE OR UPDATE ON public.transfer_purposes FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER transfer_purposes_autonumber BEFORE INSERT ON public.transfer_purposes FOR EACH ROW EXECUTE FUNCTION reference_autonumber();
--@@
CREATE TRIGGER request_decision_access BEFORE UPDATE ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION guard_request_decision_access();
--@@
CREATE TRIGGER user_groups_autonumber BEFORE INSERT ON public.user_groups FOR EACH ROW EXECUTE FUNCTION setup_autonumber();
--@@
CREATE TRIGGER audit_user_roles AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER audit_user_screen_permissions AFTER INSERT OR DELETE OR UPDATE ON public.user_screen_permissions FOR EACH ROW EXECUTE FUNCTION audit_row();
--@@
CREATE TRIGGER withdrawal_decision_access BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION guard_request_decision_access();
