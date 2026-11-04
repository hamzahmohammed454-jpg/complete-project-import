SET check_function_bodies = false;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6 (Debian 18.6-3)


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'manager',
    'teller',
    'accountant'
);


--
-- Name: accounts_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accounts_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = 0 THEN
    NEW.account_number := public.next_account_number(NEW.father_number);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: accounts_guard_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accounts_guard_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE father_number = OLD.account_number) THEN
    RAISE EXCEPTION 'HAS_CHILDREN' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;


--
-- Name: aden_date(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aden_date(ts timestamp with time zone) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ SELECT (ts AT TIME ZONE 'Asia/Aden')::date $$;


--
-- Name: apply_activation_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_activation_code(p_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$ DECLARE c public.activation_codes; BEGIN PERFORM public.require_staff_session(); IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE='42501'; END IF; IF p_code IS NULL OR upper(trim(p_code)) !~ '^[0-9A-F]{36}$' THEN RAISE EXCEPTION 'INVALID_ACTIVATION_CODE'; END IF; SELECT * INTO c FROM public.activation_codes WHERE code_hash=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex') FOR UPDATE; IF NOT FOUND OR c.used_at IS NOT NULL OR c.revoked_at IS NOT NULL OR (c.licensed_until IS NOT NULL AND c.licensed_until<=now()) THEN RAISE EXCEPTION 'INVALID_ACTIVATION_CODE'; END IF; UPDATE public.installation_license SET activated=true,licensed_until=c.licensed_until,activated_by=auth.uid(),activated_at=now() WHERE id=c.installation_id; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ACTIVATION_CODE'; END IF; UPDATE public.activation_codes SET used_at=now(),used_by=auth.uid() WHERE id=c.id; END $_$;


--
-- Name: assign_document_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_document_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: audit_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_row() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r jsonb;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO activity_log (user_id, action, target, details)
  VALUES (auth.uid(), CASE TG_OP WHEN 'INSERT' THEN 'إضافة' WHEN 'UPDATE' THEN 'تعديل' ELSE 'حذف' END,
          TG_TABLE_NAME, CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('before', to_jsonb(OLD), 'after', r) ELSE r END);
  RETURN NULL;
END $$;


--
-- Name: box_day_summary(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.box_day_summary(p_date date) RETURNS TABLE(box_id bigint, currency_id bigint, opening numeric, receipts numeric, payments numeric, closing numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT m.box_id, m.currency_id,
    COALESCE(SUM(CASE WHEN aden_date(m.created_at) < p_date THEN CASE WHEN m.movement_type = 'صرف' THEN -m.amount ELSE m.amount END END), 0),
    COALESCE(SUM(CASE WHEN aden_date(m.created_at) = p_date AND m.movement_type <> 'صرف' THEN m.amount END), 0),
    COALESCE(SUM(CASE WHEN aden_date(m.created_at) = p_date AND m.movement_type = 'صرف' THEN m.amount END), 0),
    COALESCE(SUM(CASE WHEN m.movement_type = 'صرف' THEN -m.amount ELSE m.amount END), 0)
  FROM box_movements m
  WHERE aden_date(m.created_at) <= p_date
  GROUP BY m.box_id, m.currency_id
$$;


--
-- Name: boxes_guard_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boxes_guard_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM box_movements WHERE box_id = OLD.id)
     OR EXISTS (SELECT 1 FROM box_closings WHERE box_id = OLD.id) THEN
    RAISE EXCEPTION 'IN_USE' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;


--
-- Name: can_access_transfer_evidence(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_transfer_evidence(p_path text, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
DECLARE parts text[]:=string_to_array(p_path,'/'); transfer_id bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_screen_permission('/transfers',p_action) THEN RETURN false; END IF;
 IF array_length(parts,1)<>3 OR parts[1] NOT IN ('incoming','outgoing') OR parts[2] !~ '^[0-9]+$' THEN RETURN false; END IF;
 transfer_id:=parts[2]::bigint;
 IF p_action IN ('create','update') AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'teller')) THEN RETURN false; END IF;
 IF p_action='delete' AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN RETURN false; END IF;
 IF parts[1]='incoming' THEN RETURN EXISTS(SELECT 1 FROM incoming_transfers WHERE id=transfer_id); END IF;
 RETURN EXISTS(SELECT 1 FROM outgoing_transfers WHERE id=transfer_id);
END $_$;


--
-- Name: cash_voucher_to_box(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cash_voucher_to_box() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: cash_vouchers_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cash_vouchers_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('cash_vouchers'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM cash_vouchers;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: check_book_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_book_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: check_to_box(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_to_box() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: checks_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checks_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('checks'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM checks;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: close_period(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_period(p_type text, p_from date, p_to date) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: closing_compute_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.closing_compute_balance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  SELECT COALESCE(SUM(CASE WHEN movement_type = 'صرف' THEN -amount ELSE amount END), 0)
    INTO NEW.system_balance
    FROM box_movements
   WHERE box_id = NEW.box_id AND currency_id = NEW.currency_id
     AND aden_date(created_at) <= NEW.close_date;
  NEW.closed_by := auth.uid();
  RETURN NEW;
END $$;


--
-- Name: cost_centers_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cost_centers_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('cost_centers'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM cost_centers;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: create_balanced_entry(bigint, date, text, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_balanced_entry(p_entry_number bigint, p_the_date date, p_notes text, p_branch_id bigint, p_details jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: create_multi_cash_voucher(uuid, text, bigint, text, bigint, date, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_multi_cash_voucher(p_batch uuid, p_type text, p_customer bigint, p_name text, p_box bigint, p_date date, p_notes text, p_lines jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: daily_operations_report(date, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.daily_operations_report(p_date date, p_branch bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: decide_transfer_request(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decide_transfer_request(p_id bigint, p_approve boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: decide_withdrawal_request(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decide_withdrawal_request(p_id bigint, p_approve boolean, p_response text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: delete_cash_voucher(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_cash_voucher(p_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: document_scope(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.document_scope(p_table text, p_row jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ SELECT CASE p_table WHEN 'cash_vouchers' THEN 'cash:'||COALESCE(p_row->>'voucher_type','') WHEN 'checks' THEN 'check:'||COALESCE(p_row->>'check_type','') ELSE p_table END $$;


--
-- Name: enforce_customer_not_stopped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_customer_not_stopped() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: entry_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entry_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.period_closing', true) = 'on' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.period_closings WHERE NEW.the_date BETWEEN from_date AND to_date) THEN
    RAISE EXCEPTION 'الفترة المحاسبية لهذا التاريخ (%) مقفلة', NEW.the_date;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: exchange_to_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exchange_to_customer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: funds_inventory_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funds_inventory_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('funds_inventory'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM funds_inventory;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_action_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_action_permissions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: guard_closed_box(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_closed_box() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r record; d date;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; d := aden_date(now()); ELSE r := OLD; d := aden_date(OLD.created_at); END IF;
  IF EXISTS (SELECT 1 FROM box_closings c WHERE c.box_id = r.box_id AND c.currency_id IS NOT DISTINCT FROM r.currency_id AND c.close_date >= d) THEN
    RAISE EXCEPTION 'BOX_CLOSED: الصندوق مقفل لهذا اليوم';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_closing_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_closing_permissions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
 IF TG_OP = 'INSERT' AND NOT public.has_screen_permission('/closing','close') THEN RAISE EXCEPTION 'لا تملك صلاحية إقفال الصندوق'; END IF;
 IF TG_OP = 'DELETE' AND NOT public.has_screen_permission('/closing','reopen') THEN RAISE EXCEPTION 'لا تملك صلاحية إعادة فتح الصندوق'; END IF;
 RETURN COALESCE(NEW, OLD);
END $$;


--
-- Name: guard_internal_transfer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_internal_transfer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END; $$;


--
-- Name: guard_license_operation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_license_operation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF auth.uid() IS NOT NULL AND NOT public.license_writes_allowed() THEN RAISE EXCEPTION 'LICENSE_READ_ONLY' USING ERRCODE='42501'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;


--
-- Name: guard_linked_transfer_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_linked_transfer_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.outgoing_transfers WHERE check_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TRANSFER_CHECK_DELETE_FORBIDDEN'; END IF;
  IF ROW(NEW.amount,NEW.currency_id,NEW.check_type,NEW.check_number,NEW.customer_id) IS DISTINCT FROM ROW(OLD.amount,OLD.currency_id,OLD.check_type,OLD.check_number,OLD.customer_id) THEN RAISE EXCEPTION 'TRANSFER_CHECK_IMMUTABLE'; END IF;
  IF OLD.status='محصل' AND (NEW.status<>OLD.status OR NEW.box_id IS DISTINCT FROM OLD.box_id) THEN RAISE EXCEPTION 'TRANSFER_CHECK_ALREADY_COLLECTED'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;


--
-- Name: guard_request_decision_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_request_decision_access() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE screen text;
BEGIN
 screen:=CASE TG_TABLE_NAME WHEN 'transfer_requests' THEN '/transfer-requests' ELSE '/withdrawal-requests' END;
 PERFORM public.require_staff_session();
 IF NOT public.is_exchange_staff() OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')) OR NOT public.license_writes_allowed() OR NOT public.has_screen_permission(screen,'update') THEN RAISE EXCEPTION 'REQUEST_DECISION_DENIED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='transfer_requests' AND NEW.status='مقبول' THEN
  IF NOT public.has_screen_permission('/transfers','update') OR (NEW.request_type='cancel' AND NOT public.has_screen_permission('/transfers','cancel')) THEN RAISE EXCEPTION 'TRANSFER_ACTION_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_staff_date(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_staff_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d public.staff_work_defaults; today date := public.aden_date(now());
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.the_date IS NOT DISTINCT FROM OLD.the_date THEN RETURN NEW; END IF;
  SELECT * INTO d FROM public.staff_work_defaults WHERE user_id = auth.uid();
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NOT d.allow_past_date AND NEW.the_date < today THEN RAISE EXCEPTION 'STAFF_PAST_DATE_DENIED'; END IF;
  IF NOT d.allow_future_date AND NEW.the_date > today THEN RAISE EXCEPTION 'STAFF_FUTURE_DATE_DENIED'; END IF;
  RETURN NEW;
END; $$;


--
-- Name: guard_staff_work_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_staff_work_assignment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END; $$;


--
-- Name: guard_transfer_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_transfer_state() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: guard_voucher_batch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_voucher_batch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.batch_position IS DISTINCT FROM OLD.batch_position OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency_id IS DISTINCT FROM OLD.currency_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.voucher_type IS DISTINCT FROM OLD.voucher_type OR NEW.the_date IS DISTINCT FROM OLD.the_date) THEN RAISE EXCEPTION 'السند المرحل لا يقبل تعديل البيانات المالية'; END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.batch_id IS NOT NULL AND current_setting('app.voucher_batch',true) IS DISTINCT FROM OLD.batch_id::text THEN RAISE EXCEPTION 'احذف السند متعدد العملات كاملاً'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' AND NEW.batch_id IS NOT NULL AND current_setting('app.voucher_batch',true) IS DISTINCT FROM NEW.batch_id::text THEN RAISE EXCEPTION 'يجب حفظ السند متعدد العملات كاملاً'; END IF;
 RETURN NEW;
END $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), COALESCE(NEW.raw_user_meta_data ->> 'phone', ''),
          NULLIF(NEW.raw_user_meta_data ->> 'username', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT auth.uid() IS NOT NULL AND _user_id=auth.uid() AND public.staff_session_unlocked() AND public.staff_mfa_satisfied() AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;


--
-- Name: has_screen_permission(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_screen_permission(p_screen text, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;


--
-- Name: FUNCTION has_screen_permission(p_screen text, p_action text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_screen_permission(p_screen text, p_action text) IS 'License activation is admin-only; group permissions cannot elevate staff into license management. Code issuance additionally requires platform owner authority.';


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;


--
-- Name: is_exchange_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_exchange_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT auth.uid() IS NOT NULL AND public.staff_active() AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','manager','accountant','teller')); $$;


--
-- Name: is_platform_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_owner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT auth.uid() IS NOT NULL AND public.staff_session_unlocked() AND public.staff_mfa_satisfied() AND public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.platform_owners WHERE user_id=auth.uid()) $$;


--
-- Name: issue_activation_code(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_activation_code(p_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ DECLARE code text; result uuid; target uuid; BEGIN PERFORM public.require_staff_session(); IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE='42501'; END IF; IF p_until IS NOT NULL AND p_until<=now() THEN RAISE EXCEPTION 'INVALID_LICENSE_DATE'; END IF; SELECT id INTO target FROM public.installation_license WHERE singleton=1; code:=upper(encode(extensions.gen_random_bytes(18),'hex')); INSERT INTO public.activation_codes(installation_id,code_hash,licensed_until,created_by) VALUES(target,encode(extensions.digest(code,'sha256'),'hex'),p_until,auth.uid()) RETURNING id INTO result; RETURN jsonb_build_object('id',result,'code',code); END $$;


--
-- Name: journal_voucher_to_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_voucher_to_entry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: journal_vouchers_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_vouchers_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('journal_vouchers'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM journal_vouchers;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: license_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.license_status() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN PERFORM public.require_staff_session(); RETURN (SELECT jsonb_build_object('id',id,'company_name',company_name,'trial_started_at',trial_started_at,'trial_ends_at',trial_ends_at,'activated',activated,'licensed_until',licensed_until,'can_write',public.license_writes_allowed(),'is_owner',public.is_platform_owner()) FROM public.installation_license WHERE singleton=1); END $$;


--
-- Name: license_writes_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.license_writes_allowed() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT COALESCE((SELECT CASE WHEN activated THEN licensed_until IS NULL OR licensed_until>now() ELSE trial_ends_at>now() END FROM public.installation_license WHERE singleton=1),false) $$;


--
-- Name: lock_staff_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_staff_session() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 UPDATE staff_session_locks SET locked=true,updated_at=now() WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier();
 IF NOT FOUND THEN RAISE EXCEPTION 'PIN_REQUIRED'; END IF;
END $$;


--
-- Name: log_activity_username(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_activity_username() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  SELECT coalesce(username, full_name) INTO NEW.username FROM profiles WHERE id = NEW.user_id;
  RETURN NEW;
END $$;


--
-- Name: loop_entries_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.loop_entries_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('loop_entries'));
    SELECT coalesce(max(the_number), 0) + 1 INTO NEW.the_number FROM loop_entries;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: management_alerts(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.management_alerts(p_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: next_account_number(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_account_number(p_father bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: ops_to_box(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_to_box() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: party_autoaccount(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.party_autoaccount() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: party_drop_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.party_drop_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.account_id IS NOT NULL THEN
    DELETE FROM accounts WHERE id = OLD.account_id;
  END IF;
  RETURN NULL;
END $$;


--
-- Name: party_sync_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.party_sync_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: post_box(bigint, bigint, numeric, text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_box(p_box bigint, p_currency bigint, p_amount numeric, p_type text, p_notes text, p_src text, p_src_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_box IS NULL OR p_amount IS NULL OR p_amount = 0 THEN RETURN; END IF;
  INSERT INTO box_movements (box_id, currency_id, amount, movement_type, notes, source_type, source_id, created_by)
  VALUES (p_box, p_currency, p_amount, p_type, p_notes, p_src, p_src_id, auth.uid());
END $$;


--
-- Name: record_currency_rate_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_currency_rate_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF TG_OP='INSERT' OR ROW(NEW.buy_price,NEW.sell_price,NEW.exchange_price) IS DISTINCT FROM ROW(OLD.buy_price,OLD.sell_price,OLD.exchange_price) THEN
 INSERT INTO public.currency_rate_history(source_currency_id,target_currency_id,buy_price,sell_price,exchange_price,changed_by) VALUES(NEW.source_currency_id,NEW.target_currency_id,NEW.buy_price,NEW.sell_price,NEW.exchange_price,auth.uid());
 END IF;
 RETURN NEW;
END $$;


--
-- Name: reference_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reference_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    EXECUTE format('SELECT coalesce(max(the_number), 0) + 1 FROM public.%I', TG_TABLE_NAME)
      INTO NEW.the_number;
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;


--
-- Name: require_staff_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_staff_session() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF NOT COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(),false) THEN RAISE EXCEPTION 'STAFF_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;


--
-- Name: revoke_activation_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_activation_code(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN PERFORM public.require_staff_session(); IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE='42501'; END IF; UPDATE public.activation_codes SET revoked_at=now() WHERE id=p_id AND used_at IS NULL AND revoked_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'CODE_UNAVAILABLE'; END IF; END $$;


--
-- Name: route_internal_transfer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.route_internal_transfer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END; $$;


--
-- Name: set_staff_session_pin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_staff_session_pin(p_pin text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
BEGIN
 IF auth.uid() IS NULL OR NOT public.staff_mfa_satisfied() OR NOT public.staff_session_unlocked() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;
 INSERT INTO staff_session_locks(user_id,session_id,pin_hash) VALUES(auth.uid(),public.staff_session_identifier(),extensions.crypt(p_pin,extensions.gen_salt('bf',10)))
 ON CONFLICT(user_id,session_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,failed_attempts=0,updated_at=now();
END $_$;


--
-- Name: setup_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.setup_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.the_number IS NULL OR NEW.the_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME));
    EXECUTE format('SELECT coalesce(max(the_number), 0) + 1 FROM public.%I', TG_TABLE_NAME) INTO NEW.the_number;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: staff_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT auth.uid() IS NOT NULL AND COALESCE(public.staff_session_unlocked() AND public.staff_mfa_satisfied(), false)
$$;


--
-- Name: staff_can_read(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_can_read(p_screens text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(p_screens) s WHERE public.has_screen_permission(s, 'view'))
$$;


--
-- Name: staff_mfa_satisfied(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_mfa_satisfied() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT auth.uid() IS NOT NULL AND ((auth.jwt()->>'aal')='aal2' OR NOT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified'))
$$;


--
-- Name: staff_session_identifier(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_session_identifier() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
 SELECT CASE WHEN NULLIF(auth.jwt()->>'session_id','') IS NOT NULL THEN (auth.jwt()->>'session_id')::uuid ELSE md5(COALESCE(auth.uid()::text,'')||':managed-preview')::uuid END
$$;


--
-- Name: FUNCTION staff_session_identifier(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.staff_session_identifier() IS 'Real Auth sessions use session_id; signed managed preview tokens without session_id share an account-scoped lock that cannot be bypassed by token refresh.';


--
-- Name: staff_session_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_session_status() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE s public.staff_session_locks;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO s FROM public.staff_session_locks WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier();
 RETURN jsonb_build_object('has_pin',FOUND,'locked',COALESCE(s.locked,false),'failed_attempts',COALESCE(s.failed_attempts,0));
END $$;


--
-- Name: staff_session_unlocked(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_session_unlocked() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_session_locks WHERE user_id=auth.uid() AND session_id=public.staff_session_identifier() AND locked)
$$;


--
-- Name: staff_trade_allowed(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_trade_allowed(p_kind text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT auth.uid() IS NOT NULL AND (public.is_admin(auth.uid()) OR COALESCE((SELECT CASE p_kind WHEN 'buy' THEN allow_buy WHEN 'sell' THEN allow_sell ELSE false END FROM public.staff_work_defaults WHERE user_id=auth.uid()), p_kind IN ('buy','sell')))
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: transfer_autonumber(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_autonumber() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE n bigint;
BEGIN
  IF NEW.transfer_number IS NULL OR NEW.transfer_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME || ':' || coalesce(NEW.agent_id, 0)::text));
    EXECUTE format('SELECT coalesce(max(transfer_number), 0) + 1 FROM public.%I WHERE agent_id IS NOT DISTINCT FROM $1', TG_TABLE_NAME)
      INTO n USING NEW.agent_id;
    NEW.transfer_number := n;
  END IF;
  RETURN NEW;
END $_$;


--
-- Name: transfer_to_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_to_customer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END; $$;


--
-- Name: unlock_staff_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlock_staff_session(p_pin text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
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
END $_$;


--
-- Name: validate_exchange_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_exchange_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: validate_staff_work_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_staff_work_defaults() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
 IF NEW.enforce_box AND NEW.box_id IS NULL THEN RAISE EXCEPTION 'ASSIGNED_BOX_REQUIRED'; END IF;
 IF NEW.enforce_currency AND NEW.currency_id IS NULL THEN RAISE EXCEPTION 'ASSIGNED_CURRENCY_REQUIRED'; END IF;
 IF NEW.box_id IS NOT NULL AND NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boxes WHERE id = NEW.box_id AND branch_id = NEW.branch_id) THEN RAISE EXCEPTION 'BOX_BRANCH_MISMATCH'; END IF;
 NEW.updated_at := now(); NEW.updated_by := auth.uid(); RETURN NEW;
END; $$;


--
-- Name: validate_transfer_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_transfer_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END; $$;


--
-- Name: validate_transfer_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_transfer_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END; $$;




--
-- Name: account_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_groups (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    group_name text NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.account_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.account_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id bigint NOT NULL,
    account_number bigint NOT NULL,
    father_number bigint,
    account_name text NOT NULL,
    account_type text DEFAULT 'فرعي'::text NOT NULL,
    account_reference text,
    trade_name text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id bigint,
    ceiling_amount numeric,
    ceiling_currency_id bigint
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accounts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: activation_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activation_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid NOT NULL,
    code_hash text NOT NULL,
    licensed_until timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    used_by uuid,
    revoked_at timestamp with time zone
);


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid(),
    username text,
    action text NOT NULL,
    target text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_setup_claim; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_setup_claim (
    id integer DEFAULT 1 NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_setup_claim_id_check CHECK ((id = 1))
);


--
-- Name: TABLE admin_setup_claim; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_setup_claim IS 'Single-use first-administrator setup reservation; not accessible from the browser and retained after successful setup.';


--
-- Name: agent_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_settlements (
    id bigint NOT NULL,
    agent_id bigint NOT NULL,
    currency_id bigint NOT NULL,
    amount numeric NOT NULL,
    direction text NOT NULL,
    box_id bigint,
    the_date date DEFAULT public.aden_date(now()) NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_ref uuid,
    document_number bigint,
    CONSTRAINT agent_settlements_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT agent_settlements_direction_check CHECK ((direction = ANY (ARRAY['paid_to_agent'::text, 'received_from_agent'::text])))
);


--
-- Name: agent_settlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.agent_settlements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.agent_settlements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    agent_name text NOT NULL,
    account_id bigint,
    phone text,
    address text,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    classification_id bigint,
    client_ref uuid
);


--
-- Name: agents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.agents ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.agents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    governorate_id bigint NOT NULL,
    area_name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: areas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.areas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.areas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auto_reply_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_reply_commands (
    code integer NOT NULL,
    label text NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: auto_reply_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_reply_settings (
    id smallint DEFAULT 1 NOT NULL,
    phone_number text DEFAULT ''::text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    instructions_hours integer DEFAULT 24 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    instructions_enabled boolean DEFAULT false NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auto_reply_settings_id_check CHECK ((id = 1)),
    CONSTRAINT auto_reply_settings_instructions_hours_check CHECK (((instructions_hours >= 1) AND (instructions_hours <= 720)))
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id bigint NOT NULL,
    bank_id bigint NOT NULL,
    account_number text NOT NULL,
    account_name text,
    account_type text,
    currency_id bigint,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.bank_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: banks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banks (
    id bigint NOT NULL,
    bank_name text NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.banks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.banks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blacklist (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    full_name text NOT NULL,
    identity_number text,
    phone_number text,
    reason text,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blacklist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.blacklist ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.blacklist_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: box_closings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.box_closings (
    id bigint NOT NULL,
    box_id bigint NOT NULL,
    currency_id bigint NOT NULL,
    close_date date NOT NULL,
    system_balance numeric DEFAULT 0 NOT NULL,
    counted_amount numeric NOT NULL,
    difference numeric GENERATED ALWAYS AS ((counted_amount - system_balance)) STORED,
    notes text,
    closed_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: box_closings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.box_closings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.box_closings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: box_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.box_movements (
    id bigint NOT NULL,
    box_id bigint NOT NULL,
    currency_id bigint,
    amount numeric(20,4) DEFAULT 0 NOT NULL,
    movement_type text DEFAULT 'قبض'::text NOT NULL,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type text,
    source_id bigint,
    client_ref uuid
);


--
-- Name: box_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.box_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.box_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: boxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boxes (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    box_name text NOT NULL,
    account_id bigint,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boxes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.boxes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.boxes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    branch_name text NOT NULL,
    english_name text,
    phone text,
    address text,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branches ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buy_currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buy_currencies (
    id bigint NOT NULL,
    the_number bigint,
    amount numeric(18,6) NOT NULL,
    currency_id bigint,
    price numeric(18,6) NOT NULL,
    account_id bigint,
    exchange_amount numeric(18,6),
    exchange_currency_id bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    cash_customer_name text,
    customer_phone text,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    box_id bigint,
    commission numeric DEFAULT 0 NOT NULL,
    client_ref uuid,
    document_number bigint,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    customer_id bigint,
    CONSTRAINT buy_currencies_payment_method_chk CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text])))
);


--
-- Name: buy_currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.buy_currencies ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.buy_currencies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cash_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_vouchers (
    id bigint NOT NULL,
    the_number bigint,
    voucher_type text NOT NULL,
    customer_id bigint,
    cash_name text,
    amount numeric NOT NULL,
    currency_id bigint NOT NULL,
    box_id bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_ref uuid,
    document_number bigint,
    batch_id uuid,
    batch_position integer,
    CONSTRAINT cash_voucher_batch_shape CHECK ((((batch_id IS NULL) AND (batch_position IS NULL)) OR ((batch_id IS NOT NULL) AND (batch_position > 0)))),
    CONSTRAINT cash_vouchers_amount_chk CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_vouchers_party_chk CHECK (((customer_id IS NOT NULL) OR (NULLIF(btrim(cash_name), ''::text) IS NOT NULL))),
    CONSTRAINT cash_vouchers_type_chk CHECK ((voucher_type = ANY (ARRAY['قبض'::text, 'صرف'::text, 'إيداع'::text])))
);


--
-- Name: COLUMN cash_vouchers.batch_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cash_vouchers.batch_id IS 'Atomic multi-currency voucher; one row per currency, one shared document number. Existing cash and statement paths consume each currency once.';


--
-- Name: cash_vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cash_vouchers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cash_vouchers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: check_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_books (
    id bigint NOT NULL,
    bank_id bigint,
    account_number text,
    from_number bigint NOT NULL,
    to_number bigint NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_books_range_chk CHECK (((from_number > 0) AND (to_number >= from_number)))
);


--
-- Name: check_books_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.check_books ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.check_books_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checks (
    id bigint NOT NULL,
    the_number bigint,
    check_type text NOT NULL,
    check_number text NOT NULL,
    bank_name text,
    customer_id bigint,
    party_name text,
    amount numeric NOT NULL,
    currency_id bigint NOT NULL,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    status text DEFAULT 'تحت التحصيل'::text NOT NULL,
    box_id bigint,
    collected_date date,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_ref uuid,
    document_number bigint,
    book_id bigint,
    bank_id bigint,
    check_account_number text,
    check_account_name text,
    beneficiary_name text,
    exchange_amount numeric,
    exchange_currency_id bigint,
    CONSTRAINT checks_amount_chk CHECK ((amount > (0)::numeric)),
    CONSTRAINT checks_party_chk CHECK (((customer_id IS NOT NULL) OR (NULLIF(btrim(party_name), ''::text) IS NOT NULL))),
    CONSTRAINT checks_status_chk CHECK ((status = ANY (ARRAY['تحت التحصيل'::text, 'محصل'::text, 'مرتجع'::text]))),
    CONSTRAINT checks_type_chk CHECK ((check_type = ANY (ARRAY['وارد'::text, 'صادر'::text])))
);


--
-- Name: checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.checks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.checks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: classifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classifications (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    classification_name text NOT NULL,
    applies_to text DEFAULT 'customer'::text NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classifications_applies_to_check CHECK ((applies_to = ANY (ARRAY['customer'::text, 'agent'::text, 'both'::text])))
);


--
-- Name: classifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.classifications ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.classifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_rules (
    id bigint NOT NULL,
    the_number bigint,
    document_type text NOT NULL,
    currency_id bigint,
    agent_id bigint,
    amount_from numeric,
    amount_to numeric,
    method text NOT NULL,
    commission_value numeric NOT NULL,
    min_commission numeric,
    max_commission numeric,
    commission_currency_id bigint,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_rules_document_type_check CHECK ((document_type = ANY (ARRAY['outgoing'::text, 'incoming'::text, 'buy'::text, 'sell'::text]))),
    CONSTRAINT commission_rules_method_check CHECK ((method = ANY (ARRAY['percent'::text, 'fixed'::text])))
);


--
-- Name: commission_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.commission_rules ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.commission_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_centers (
    id bigint NOT NULL,
    the_number bigint,
    center_name text NOT NULL,
    parent_id bigint,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cost_centers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cost_centers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cost_centers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    country_name text NOT NULL,
    phone_code text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: countries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.countries ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.countries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    currency_name text NOT NULL,
    arabic_code text,
    english_code text,
    iso_code text,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    min_sell_price numeric,
    max_buy_price numeric
);


--
-- Name: COLUMN currencies.min_sell_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.currencies.min_sell_price IS 'أقل سعر بيع مسموح — تنبيه عند النزول عنه';


--
-- Name: COLUMN currencies.max_buy_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.currencies.max_buy_price IS 'أعلى سعر شراء مسموح — تنبيه عند تجاوزه';


--
-- Name: currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.currencies ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.currencies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: currency_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_prices (
    id bigint NOT NULL,
    source_currency_id bigint NOT NULL,
    target_currency_id bigint NOT NULL,
    exchange_price numeric(18,6) DEFAULT 0 NOT NULL,
    buy_price numeric(18,6) DEFAULT 0 NOT NULL,
    sell_price numeric(18,6) DEFAULT 0 NOT NULL,
    min_price numeric(18,6) DEFAULT 0 NOT NULL,
    max_price numeric(18,6) DEFAULT 0 NOT NULL,
    notes text,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: currency_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.currency_prices ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.currency_prices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: currency_rate_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_rate_history (
    id bigint NOT NULL,
    source_currency_id bigint NOT NULL,
    target_currency_id bigint NOT NULL,
    buy_price numeric NOT NULL,
    sell_price numeric NOT NULL,
    exchange_price numeric NOT NULL,
    changed_by uuid DEFAULT auth.uid(),
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: currency_rate_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.currency_rate_history ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.currency_rate_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customer_transfer_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_transfer_movements (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    source_type text NOT NULL,
    source_id bigint NOT NULL,
    currency_id bigint NOT NULL,
    debit numeric DEFAULT 0 NOT NULL,
    credit numeric DEFAULT 0 NOT NULL,
    the_date date NOT NULL,
    notes text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_transfer_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customer_transfer_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customer_transfer_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    the_user_id bigint,
    account_id bigint,
    full_name text NOT NULL,
    phone_number text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    classification_id bigint,
    client_ref uuid,
    credit_limit numeric,
    stopped boolean DEFAULT false NOT NULL,
    stop_reason text
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: document_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_counters (
    scope text NOT NULL,
    last_number bigint DEFAULT 0 NOT NULL
);


--
-- Name: document_number_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_number_registry (
    scope text NOT NULL,
    number bigint NOT NULL,
    source_table text NOT NULL,
    source_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE document_number_registry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.document_number_registry IS 'Reservations are retained after deletion; type-specific document numbers are never reused.';


--
-- Name: entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entries (
    id bigint NOT NULL,
    entry_number bigint NOT NULL,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    debited boolean DEFAULT true NOT NULL,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_number bigint
);


--
-- Name: entries_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entries_details (
    id bigint NOT NULL,
    entry_id bigint NOT NULL,
    entry_index bigint,
    side text DEFAULT 'مدين'::text NOT NULL,
    amount numeric(20,4) DEFAULT 0 NOT NULL,
    currency_id bigint,
    account_id bigint,
    notes text
);


--
-- Name: entries_details_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.entries_details ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.entries_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: financial_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_years (
    id bigint NOT NULL,
    the_year integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_years_dates_chk CHECK ((end_date > start_date))
);


--
-- Name: financial_years_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.financial_years ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.financial_years_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: forbidden_texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forbidden_texts (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    forbidden_text text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: forbidden_texts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.forbidden_texts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.forbidden_texts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: funds_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funds_inventory (
    id bigint NOT NULL,
    the_number bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    box_id bigint NOT NULL,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: funds_inventory_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funds_inventory_details (
    id bigint NOT NULL,
    inventory_id bigint NOT NULL,
    currency_id bigint NOT NULL,
    system_amount numeric DEFAULT 0 NOT NULL,
    real_amount numeric DEFAULT 0 NOT NULL,
    difference numeric GENERATED ALWAYS AS ((real_amount - system_amount)) STORED,
    notes text
);


--
-- Name: funds_inventory_details_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.funds_inventory_details ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.funds_inventory_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: funds_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.funds_inventory ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.funds_inventory_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: governorates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governorates (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    country_id bigint NOT NULL,
    governorate_name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: governorates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.governorates ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.governorates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: group_screen_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_screen_permissions (
    id bigint NOT NULL,
    group_id bigint NOT NULL,
    screen_path text NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_create boolean DEFAULT false NOT NULL,
    can_update boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    can_print boolean DEFAULT false NOT NULL,
    extra_actions jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: group_screen_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.group_screen_permissions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.group_screen_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: incoming_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incoming_transfers (
    id bigint NOT NULL,
    transfer_number bigint,
    amount numeric(18,6) NOT NULL,
    currency_id bigint NOT NULL,
    receiver_name text NOT NULL,
    receiver_phone text DEFAULT ''::text,
    sender_name text NOT NULL,
    sender_phone text DEFAULT ''::text,
    agent_id bigint,
    state text DEFAULT 'معلقة'::text,
    branch_commission numeric(18,6) DEFAULT 0 NOT NULL,
    commission_currency_id bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    delivered boolean DEFAULT false NOT NULL,
    canceled boolean DEFAULT false NOT NULL,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    box_id bigint,
    delivered_at timestamp with time zone,
    delivered_by uuid,
    receiver_id_number text,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    customer_id bigint,
    source_name text,
    destination_name text,
    reference_number text,
    transfer_purpose text,
    receiver_identity_type text,
    receiver_identity_number text,
    exported_at timestamp with time zone,
    exported_by uuid,
    export_agent_id bigint,
    export_notes text,
    country_id bigint,
    governorate_id bigint,
    area_id bigint,
    internal_outgoing_id bigint,
    client_ref uuid,
    document_number bigint,
    CONSTRAINT incoming_payment_method CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text])))
);


--
-- Name: COLUMN incoming_transfers.internal_outgoing_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incoming_transfers.internal_outgoing_id IS 'Internal payout leg; principal received only on source outgoing, zero duplicate commission, no agent ledger.';


--
-- Name: incoming_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.incoming_transfers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.incoming_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: installation_license; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installation_license (
    singleton integer DEFAULT 1 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    trial_started_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_ends_at timestamp with time zone DEFAULT (((now() AT TIME ZONE 'Asia/Aden'::text) + '1 mon'::interval) AT TIME ZONE 'Asia/Aden'::text) NOT NULL,
    activated boolean DEFAULT false NOT NULL,
    licensed_until timestamp with time zone,
    activated_by uuid,
    activated_at timestamp with time zone,
    CONSTRAINT installation_license_singleton_check CHECK ((singleton = 1))
);


--
-- Name: TABLE installation_license; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.installation_license IS 'Installation-level licensing only; does not provide multi-company data isolation.';


--
-- Name: journal_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_vouchers (
    id bigint NOT NULL,
    the_number bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    debit_account_id bigint NOT NULL,
    credit_account_id bigint NOT NULL,
    amount numeric(20,4) NOT NULL,
    currency_id bigint NOT NULL,
    notes text,
    entry_id bigint,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_ref uuid,
    document_number bigint,
    CONSTRAINT journal_vouchers_accounts_chk CHECK ((debit_account_id <> credit_account_id)),
    CONSTRAINT journal_vouchers_amount_chk CHECK ((amount > (0)::numeric))
);


--
-- Name: journal_vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.journal_vouchers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.journal_vouchers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: loop_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loop_entries (
    id bigint NOT NULL,
    the_number bigint,
    title text NOT NULL,
    notes text,
    active boolean DEFAULT true NOT NULL,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loop_entries_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loop_entries_details (
    id bigint NOT NULL,
    loop_id bigint NOT NULL,
    side text DEFAULT 'مدين'::text NOT NULL,
    amount numeric NOT NULL,
    currency_id bigint NOT NULL,
    account_id bigint,
    notes text,
    CONSTRAINT loop_entries_details_amount_chk CHECK ((amount > (0)::numeric)),
    CONSTRAINT loop_entries_details_side_chk CHECK ((side = ANY (ARRAY['مدين'::text, 'دائن'::text])))
);


--
-- Name: loop_entries_details_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.loop_entries_details ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loop_entries_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: loop_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.loop_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loop_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: loop_entries_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loop_entries_runs (
    id bigint NOT NULL,
    loop_id bigint NOT NULL,
    run_date date DEFAULT CURRENT_DATE NOT NULL,
    entry_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loop_entries_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.loop_entries_runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loop_entries_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: outgoing_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outgoing_transfers (
    id bigint NOT NULL,
    transfer_number bigint,
    amount numeric(18,6) NOT NULL,
    currency_id bigint NOT NULL,
    receiver_name text NOT NULL,
    receiver_phone text DEFAULT ''::text,
    sender_name text NOT NULL,
    sender_phone text DEFAULT ''::text,
    agent_id bigint,
    state text DEFAULT 'معلقة'::text,
    branch_commission numeric(18,6) DEFAULT 0 NOT NULL,
    commission_currency_id bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    delivered boolean DEFAULT false NOT NULL,
    canceled boolean DEFAULT false NOT NULL,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    box_id bigint,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    customer_id bigint,
    source_name text,
    destination_name text,
    reference_number text,
    transfer_purpose text,
    receiver_identity_type text,
    receiver_identity_number text,
    exported_at timestamp with time zone,
    exported_by uuid,
    export_agent_id bigint,
    export_notes text,
    check_id bigint,
    country_id bigint,
    governorate_id bigint,
    area_id bigint,
    is_internal boolean DEFAULT false NOT NULL,
    client_ref uuid,
    document_number bigint,
    CONSTRAINT outgoing_payment_method CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text, 'check'::text])))
);


--
-- Name: COLUMN outgoing_transfers.document_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outgoing_transfers.document_number IS 'Immutable per-document-type number independent of preserved per-agent transfer_number.';


--
-- Name: outgoing_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.outgoing_transfers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.outgoing_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: period_closings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.period_closings (
    id bigint NOT NULL,
    period_type text NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    entry_id bigint,
    closed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT period_closings_check CHECK ((from_date <= to_date)),
    CONSTRAINT period_closings_period_type_check CHECK ((period_type = ANY (ARRAY['يومي'::text, 'أسبوعي'::text, 'شهري'::text, 'سنوي'::text])))
);


--
-- Name: period_closings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.period_closings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.period_closings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: platform_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_owners (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_owners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_owners IS 'Platform owner authority is separate from company admin roles; only privileged provisioning may assign it.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    branch_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    username text
);


--
-- Name: profiles_probe_x; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles_probe_x (
    id integer
);


--
-- Name: TABLE profiles_probe_x; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles_probe_x IS 'DEPRECATED: unused import check table';


--
-- Name: receiver_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receiver_cards (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    full_name text NOT NULL,
    phone_number text,
    identity_type text,
    identity_number text,
    country_id bigint,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: receiver_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.receiver_cards ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.receiver_cards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sell_currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sell_currencies (
    id bigint NOT NULL,
    the_number bigint,
    amount numeric(18,6) NOT NULL,
    currency_id bigint,
    price numeric(18,6) NOT NULL,
    account_id bigint,
    exchange_amount numeric(18,6),
    exchange_currency_id bigint,
    the_date date DEFAULT CURRENT_DATE NOT NULL,
    cash_customer_name text,
    customer_phone text,
    notes text,
    branch_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    box_id bigint,
    commission numeric DEFAULT 0 NOT NULL,
    client_ref uuid,
    document_number bigint,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    customer_id bigint,
    CONSTRAINT sell_currencies_payment_method_chk CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text])))
);


--
-- Name: sell_currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sell_currencies ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sell_currencies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_announcements_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000))),
    CONSTRAINT staff_announcements_check CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT staff_announcements_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);


--
-- Name: staff_session_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_session_locks (
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    pin_hash text NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_work_defaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_work_defaults (
    user_id uuid NOT NULL,
    branch_id bigint,
    box_id bigint,
    currency_id bigint,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    enforce_box boolean DEFAULT false NOT NULL,
    enforce_currency boolean DEFAULT false NOT NULL,
    allow_past_date boolean DEFAULT true NOT NULL,
    allow_future_date boolean DEFAULT true NOT NULL,
    allow_buy boolean DEFAULT true NOT NULL,
    allow_sell boolean DEFAULT true NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id bigint NOT NULL,
    scope text NOT NULL,
    owner text NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_settings_scope_check CHECK ((scope = ANY (ARRAY['branch'::text, 'user'::text])))
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.system_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: transfer_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_entities (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    entity_name text NOT NULL,
    country_id bigint,
    phone_number text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transfer_entities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transfer_entities ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.transfer_entities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: transfer_purposes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_purposes (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    purpose_name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transfer_purposes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transfer_purposes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.transfer_purposes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: transfer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_requests (
    id bigint NOT NULL,
    transfer_kind text NOT NULL,
    transfer_id bigint NOT NULL,
    request_type text NOT NULL,
    reason text NOT NULL,
    payload jsonb,
    status text DEFAULT 'معلق'::text NOT NULL,
    requested_by uuid,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transfer_requests_request_type_check CHECK ((request_type = ANY (ARRAY['modify'::text, 'cancel'::text, 'stop'::text]))),
    CONSTRAINT transfer_requests_status_check CHECK ((status = ANY (ARRAY['معلق'::text, 'مقبول'::text, 'مرفوض'::text]))),
    CONSTRAINT transfer_requests_transfer_kind_check CHECK ((transfer_kind = ANY (ARRAY['outgoing'::text, 'incoming'::text])))
);


--
-- Name: transfer_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transfer_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.transfer_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_group_members (
    id bigint NOT NULL,
    group_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_group_members ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.user_group_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    id bigint NOT NULL,
    the_number bigint NOT NULL,
    group_name text NOT NULL,
    allowed_screens text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN user_groups.allowed_screens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_groups.allowed_screens IS 'route paths this group may see; empty array means no restriction (admin always sees everything)';


--
-- Name: user_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.user_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: user_screen_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_screen_permissions (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    screen_path text NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_create boolean DEFAULT false NOT NULL,
    can_update boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    can_print boolean DEFAULT false NOT NULL,
    extra_actions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_screen_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_screen_permissions IS 'Per-employee screen permission override: a row here replaces the employee group result for that screen; never grants roles.';


--
-- Name: user_screen_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_screen_permissions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_screen_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_requests (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    currency_id bigint NOT NULL,
    amount numeric NOT NULL,
    reason text,
    status text DEFAULT 'معلق'::text NOT NULL,
    response text,
    requested_by uuid,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT withdrawal_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT withdrawal_requests_status_check CHECK ((status = ANY (ARRAY['معلق'::text, 'مقبول'::text, 'مرفوض'::text])))
);


--
-- Name: withdrawal_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.withdrawal_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.withdrawal_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: zz_probe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zz_probe (
    id integer
);


--
-- Name: TABLE zz_probe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.zz_probe IS 'DEPRECATED: internal probe; no client access';


--
-- Name: account_groups account_groups_group_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_group_name_key UNIQUE (group_name);


--
-- Name: account_groups account_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_pkey PRIMARY KEY (id);


--
-- Name: account_groups account_groups_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_the_number_key UNIQUE (the_number);


--
-- Name: accounts accounts_account_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_account_number_key UNIQUE (account_number);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: activation_codes activation_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_code_hash_key UNIQUE (code_hash);


--
-- Name: activation_codes activation_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: admin_setup_claim admin_setup_claim_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_setup_claim
    ADD CONSTRAINT admin_setup_claim_pkey PRIMARY KEY (id);


--
-- Name: agent_settlements agent_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_settlements
    ADD CONSTRAINT agent_settlements_pkey PRIMARY KEY (id);


--
-- Name: agents agents_agent_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_agent_name_key UNIQUE (agent_name);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: agents agents_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_the_number_key UNIQUE (the_number);


--
-- Name: areas areas_governorate_id_area_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_governorate_id_area_name_key UNIQUE (governorate_id, area_name);


--
-- Name: areas areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);


--
-- Name: areas areas_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_the_number_key UNIQUE (the_number);


--
-- Name: auto_reply_commands auto_reply_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_reply_commands
    ADD CONSTRAINT auto_reply_commands_pkey PRIMARY KEY (code);


--
-- Name: auto_reply_settings auto_reply_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_reply_settings
    ADD CONSTRAINT auto_reply_settings_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_unique UNIQUE (bank_id, account_number);


--
-- Name: banks banks_bank_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_bank_name_key UNIQUE (bank_name);


--
-- Name: banks banks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_pkey PRIMARY KEY (id);


--
-- Name: blacklist blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blacklist
    ADD CONSTRAINT blacklist_pkey PRIMARY KEY (id);


--
-- Name: blacklist blacklist_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blacklist
    ADD CONSTRAINT blacklist_the_number_key UNIQUE (the_number);


--
-- Name: box_closings box_closings_box_id_currency_id_close_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_closings
    ADD CONSTRAINT box_closings_box_id_currency_id_close_date_key UNIQUE (box_id, currency_id, close_date);


--
-- Name: box_closings box_closings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_closings
    ADD CONSTRAINT box_closings_pkey PRIMARY KEY (id);


--
-- Name: box_movements box_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_movements
    ADD CONSTRAINT box_movements_pkey PRIMARY KEY (id);


--
-- Name: boxes boxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boxes
    ADD CONSTRAINT boxes_pkey PRIMARY KEY (id);


--
-- Name: boxes boxes_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boxes
    ADD CONSTRAINT boxes_the_number_key UNIQUE (the_number);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: branches branches_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_the_number_key UNIQUE (the_number);


--
-- Name: buy_currencies buy_currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_pkey PRIMARY KEY (id);


--
-- Name: cash_vouchers cash_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_vouchers
    ADD CONSTRAINT cash_vouchers_pkey PRIMARY KEY (id);


--
-- Name: check_books check_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_books
    ADD CONSTRAINT check_books_pkey PRIMARY KEY (id);


--
-- Name: checks checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_pkey PRIMARY KEY (id);


--
-- Name: classifications classifications_classification_name_applies_to_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_classification_name_applies_to_key UNIQUE (classification_name, applies_to);


--
-- Name: classifications classifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_pkey PRIMARY KEY (id);


--
-- Name: classifications classifications_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_the_number_key UNIQUE (the_number);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: countries countries_country_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_country_name_key UNIQUE (country_name);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: countries countries_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_the_number_key UNIQUE (the_number);


--
-- Name: currencies currencies_currency_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_currency_name_key UNIQUE (currency_name);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_the_number_key UNIQUE (the_number);


--
-- Name: currency_prices currency_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_prices
    ADD CONSTRAINT currency_prices_pkey PRIMARY KEY (id);


--
-- Name: currency_prices currency_prices_source_currency_id_target_currency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_prices
    ADD CONSTRAINT currency_prices_source_currency_id_target_currency_id_key UNIQUE (source_currency_id, target_currency_id);


--
-- Name: currency_rate_history currency_rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rate_history
    ADD CONSTRAINT currency_rate_history_pkey PRIMARY KEY (id);


--
-- Name: customer_transfer_movements customer_transfer_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_transfer_movements
    ADD CONSTRAINT customer_transfer_movements_pkey PRIMARY KEY (id);


--
-- Name: customers customers_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_number_key UNIQUE (phone_number);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_the_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_the_user_id_key UNIQUE (the_user_id);


--
-- Name: document_counters document_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters
    ADD CONSTRAINT document_counters_pkey PRIMARY KEY (scope);


--
-- Name: document_number_registry document_number_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_number_registry
    ADD CONSTRAINT document_number_registry_pkey PRIMARY KEY (scope, number);


--
-- Name: document_number_registry document_number_registry_source_table_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_number_registry
    ADD CONSTRAINT document_number_registry_source_table_source_id_key UNIQUE (source_table, source_id);


--
-- Name: entries_details entries_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries_details
    ADD CONSTRAINT entries_details_pkey PRIMARY KEY (id);


--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);


--
-- Name: financial_years financial_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_pkey PRIMARY KEY (id);


--
-- Name: financial_years financial_years_the_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_the_year_key UNIQUE (the_year);


--
-- Name: forbidden_texts forbidden_texts_forbidden_text_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forbidden_texts
    ADD CONSTRAINT forbidden_texts_forbidden_text_key UNIQUE (forbidden_text);


--
-- Name: forbidden_texts forbidden_texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forbidden_texts
    ADD CONSTRAINT forbidden_texts_pkey PRIMARY KEY (id);


--
-- Name: forbidden_texts forbidden_texts_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forbidden_texts
    ADD CONSTRAINT forbidden_texts_the_number_key UNIQUE (the_number);


--
-- Name: funds_inventory_details funds_inventory_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds_inventory_details
    ADD CONSTRAINT funds_inventory_details_pkey PRIMARY KEY (id);


--
-- Name: funds_inventory funds_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds_inventory
    ADD CONSTRAINT funds_inventory_pkey PRIMARY KEY (id);


--
-- Name: governorates governorates_country_id_governorate_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governorates
    ADD CONSTRAINT governorates_country_id_governorate_name_key UNIQUE (country_id, governorate_name);


--
-- Name: governorates governorates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governorates
    ADD CONSTRAINT governorates_pkey PRIMARY KEY (id);


--
-- Name: governorates governorates_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governorates
    ADD CONSTRAINT governorates_the_number_key UNIQUE (the_number);


--
-- Name: group_screen_permissions group_screen_permissions_group_id_screen_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_screen_permissions
    ADD CONSTRAINT group_screen_permissions_group_id_screen_path_key UNIQUE (group_id, screen_path);


--
-- Name: group_screen_permissions group_screen_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_screen_permissions
    ADD CONSTRAINT group_screen_permissions_pkey PRIMARY KEY (id);


--
-- Name: incoming_transfers incoming_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_pkey PRIMARY KEY (id);


--
-- Name: installation_license installation_license_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_license
    ADD CONSTRAINT installation_license_id_key UNIQUE (id);


--
-- Name: installation_license installation_license_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_license
    ADD CONSTRAINT installation_license_pkey PRIMARY KEY (singleton);


--
-- Name: journal_vouchers journal_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_vouchers
    ADD CONSTRAINT journal_vouchers_pkey PRIMARY KEY (id);


--
-- Name: loop_entries_details loop_entries_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_details
    ADD CONSTRAINT loop_entries_details_pkey PRIMARY KEY (id);


--
-- Name: loop_entries loop_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries
    ADD CONSTRAINT loop_entries_pkey PRIMARY KEY (id);


--
-- Name: loop_entries_runs loop_entries_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_runs
    ADD CONSTRAINT loop_entries_runs_pkey PRIMARY KEY (id);


--
-- Name: outgoing_transfers outgoing_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_pkey PRIMARY KEY (id);


--
-- Name: period_closings period_closings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_closings
    ADD CONSTRAINT period_closings_pkey PRIMARY KEY (id);


--
-- Name: platform_owners platform_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_owners
    ADD CONSTRAINT platform_owners_pkey PRIMARY KEY (user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: receiver_cards receiver_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receiver_cards
    ADD CONSTRAINT receiver_cards_pkey PRIMARY KEY (id);


--
-- Name: receiver_cards receiver_cards_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receiver_cards
    ADD CONSTRAINT receiver_cards_the_number_key UNIQUE (the_number);


--
-- Name: sell_currencies sell_currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_pkey PRIMARY KEY (id);


--
-- Name: staff_announcements staff_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_announcements
    ADD CONSTRAINT staff_announcements_pkey PRIMARY KEY (id);


--
-- Name: staff_session_locks staff_session_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_session_locks
    ADD CONSTRAINT staff_session_locks_pkey PRIMARY KEY (user_id, session_id);


--
-- Name: staff_work_defaults staff_work_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_work_defaults
    ADD CONSTRAINT staff_work_defaults_pkey PRIMARY KEY (user_id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_scope_owner_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_scope_owner_key_key UNIQUE (scope, owner, key);


--
-- Name: transfer_entities transfer_entities_entity_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_entities
    ADD CONSTRAINT transfer_entities_entity_name_key UNIQUE (entity_name);


--
-- Name: transfer_entities transfer_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_entities
    ADD CONSTRAINT transfer_entities_pkey PRIMARY KEY (id);


--
-- Name: transfer_entities transfer_entities_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_entities
    ADD CONSTRAINT transfer_entities_the_number_key UNIQUE (the_number);


--
-- Name: transfer_purposes transfer_purposes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_purposes
    ADD CONSTRAINT transfer_purposes_pkey PRIMARY KEY (id);


--
-- Name: transfer_purposes transfer_purposes_purpose_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_purposes
    ADD CONSTRAINT transfer_purposes_purpose_name_key UNIQUE (purpose_name);


--
-- Name: transfer_purposes transfer_purposes_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_purposes
    ADD CONSTRAINT transfer_purposes_the_number_key UNIQUE (the_number);


--
-- Name: transfer_requests transfer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: user_group_members user_group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: user_group_members user_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_group_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_group_name_key UNIQUE (group_name);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_the_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_the_number_key UNIQUE (the_number);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_screen_permissions user_screen_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_screen_permissions
    ADD CONSTRAINT user_screen_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_screen_permissions user_screen_permissions_user_id_screen_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_screen_permissions
    ADD CONSTRAINT user_screen_permissions_user_id_screen_path_key UNIQUE (user_id, screen_path);


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);


--
-- Name: accounts_father_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_father_idx ON public.accounts USING btree (father_number);


--
-- Name: activity_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_created_idx ON public.activity_log USING btree (created_at DESC);


--
-- Name: agent_settlements_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_settlements_client_ref_key ON public.agent_settlements USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: agents_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agents_client_ref_key ON public.agents USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: announcements_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_current_idx ON public.staff_announcements USING btree (active, starts_at, ends_at);


--
-- Name: box_movements_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX box_movements_client_ref_key ON public.box_movements USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: box_movements_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX box_movements_source_idx ON public.box_movements USING btree (source_type, source_id);


--
-- Name: buy_currencies_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX buy_currencies_client_ref_key ON public.buy_currencies USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: cash_voucher_batch_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_voucher_batch_currency ON public.cash_vouchers USING btree (batch_id, currency_id) WHERE (batch_id IS NOT NULL);


--
-- Name: cash_voucher_batch_position; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_voucher_batch_position ON public.cash_vouchers USING btree (batch_id, batch_position) WHERE (batch_id IS NOT NULL);


--
-- Name: cash_vouchers_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_vouchers_client_ref_key ON public.cash_vouchers USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: checks_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX checks_client_ref_key ON public.checks USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: customers_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customers_client_ref_key ON public.customers USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: incoming_internal_outgoing_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX incoming_internal_outgoing_unique ON public.incoming_transfers USING btree (internal_outgoing_id) WHERE (internal_outgoing_id IS NOT NULL);


--
-- Name: incoming_transfers_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX incoming_transfers_client_ref_key ON public.incoming_transfers USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: journal_vouchers_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX journal_vouchers_client_ref_key ON public.journal_vouchers USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: outgoing_transfers_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outgoing_transfers_client_ref_key ON public.outgoing_transfers USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: outgoing_unique_check; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outgoing_unique_check ON public.outgoing_transfers USING btree (check_id) WHERE (check_id IS NOT NULL);


--
-- Name: profiles_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (lower(username));


--
-- Name: sell_currencies_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sell_currencies_client_ref_key ON public.sell_currencies USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: incoming_transfers 00_guard_internal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_guard_internal" BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_internal_transfer();


--
-- Name: outgoing_transfers 00_guard_internal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_guard_internal" BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_internal_transfer();


--
-- Name: checks a_guard_linked_transfer_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_guard_linked_transfer_check BEFORE DELETE OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.guard_linked_transfer_check();


--
-- Name: incoming_transfers a_validate_transfer_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_validate_transfer_payment BEFORE INSERT OR DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.validate_transfer_payment();


--
-- Name: outgoing_transfers a_validate_transfer_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_validate_transfer_payment BEFORE INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.validate_transfer_payment();


--
-- Name: agent_settlements aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: box_closings aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: box_movements aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: buy_currencies aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: cash_vouchers aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: checks aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: customer_transfer_movements aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.customer_transfer_movements FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: entries aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: entries_details aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: incoming_transfers aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: journal_vouchers aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: outgoing_transfers aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: period_closings aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.period_closings FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: sell_currencies aaa_license_operation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aaa_license_operation BEFORE INSERT OR DELETE OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.guard_license_operation();


--
-- Name: agent_settlements aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: buy_currencies aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: cash_vouchers aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: checks aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: entries aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: incoming_transfers aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: journal_vouchers aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: outgoing_transfers aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: sell_currencies aab_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aab_document_number BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();


--
-- Name: buy_currencies aac_validate_exchange_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aac_validate_exchange_payment BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.validate_exchange_payment();


--
-- Name: sell_currencies aac_validate_exchange_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aac_validate_exchange_payment BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.validate_exchange_payment();


--
-- Name: cash_vouchers aac_voucher_batch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aac_voucher_batch BEFORE INSERT OR DELETE OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_voucher_batch();


--
-- Name: account_groups account_groups_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_groups_autonumber BEFORE INSERT ON public.account_groups FOR EACH ROW EXECUTE FUNCTION public.setup_autonumber();


--
-- Name: accounts accounts_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_autonumber BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.accounts_autonumber();


--
-- Name: accounts accounts_guard_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_guard_delete BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.accounts_guard_delete();


--
-- Name: activity_log activity_log_username; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_log_username BEFORE INSERT ON public.activity_log FOR EACH ROW EXECUTE FUNCTION public.log_activity_username();


--
-- Name: agents agents_autoaccount; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agents_autoaccount BEFORE INSERT ON public.agents FOR EACH ROW EXECUTE FUNCTION public.party_autoaccount();


--
-- Name: agents agents_drop_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agents_drop_account AFTER DELETE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.party_drop_account();


--
-- Name: agents agents_sync_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agents_sync_account AFTER UPDATE OF agent_name ON public.agents FOR EACH ROW EXECUTE FUNCTION public.party_sync_account();


--
-- Name: areas areas_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER areas_autonumber BEFORE INSERT ON public.areas FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: accounts audit_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_accounts AFTER INSERT OR DELETE OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: agent_settlements audit_agent_settlements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_agent_settlements AFTER INSERT OR DELETE OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: agents audit_agents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_agents AFTER INSERT OR DELETE OR UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: areas audit_areas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_areas AFTER INSERT OR DELETE OR UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: bank_accounts audit_bank_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_bank_accounts AFTER INSERT OR DELETE OR UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: banks audit_banks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_banks AFTER INSERT OR DELETE OR UPDATE ON public.banks FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: blacklist audit_blacklist; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_blacklist AFTER INSERT OR DELETE OR UPDATE ON public.blacklist FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: box_closings audit_box_closings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_box_closings AFTER INSERT OR DELETE OR UPDATE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: box_movements audit_box_movements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_box_movements AFTER INSERT OR DELETE OR UPDATE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: boxes audit_boxes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_boxes AFTER INSERT OR DELETE OR UPDATE ON public.boxes FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: branches audit_branches; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_branches AFTER INSERT OR DELETE OR UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: buy_currencies audit_buy_currencies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_buy_currencies AFTER INSERT OR DELETE OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: cash_vouchers audit_cash_vouchers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_cash_vouchers AFTER INSERT OR DELETE OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: check_books audit_check_books; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_check_books AFTER INSERT OR DELETE OR UPDATE ON public.check_books FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: checks audit_checks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_checks AFTER INSERT OR DELETE OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: commission_rules audit_commission_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_commission_rules AFTER INSERT OR DELETE OR UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: cost_centers audit_cost_centers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_cost_centers AFTER INSERT OR DELETE OR UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: countries audit_countries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_countries AFTER INSERT OR DELETE OR UPDATE ON public.countries FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: currencies audit_currencies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_currencies AFTER INSERT OR DELETE OR UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: currency_prices audit_currency_prices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_currency_prices AFTER INSERT OR DELETE OR UPDATE ON public.currency_prices FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: customer_transfer_movements audit_customer_transfer_movements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_customer_transfer_movements AFTER INSERT ON public.customer_transfer_movements FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: customers audit_customers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_customers AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: entries audit_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_entries AFTER INSERT OR DELETE OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: entries_details audit_entries_details; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_entries_details AFTER INSERT OR DELETE OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: financial_years audit_financial_years; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_financial_years AFTER INSERT OR DELETE OR UPDATE ON public.financial_years FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: forbidden_texts audit_forbidden_texts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_forbidden_texts AFTER INSERT OR DELETE OR UPDATE ON public.forbidden_texts FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: funds_inventory audit_funds_inventory; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_funds_inventory AFTER INSERT OR DELETE OR UPDATE ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: funds_inventory_details audit_funds_inventory_details; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_funds_inventory_details AFTER INSERT OR DELETE OR UPDATE ON public.funds_inventory_details FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: governorates audit_governorates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_governorates AFTER INSERT OR DELETE OR UPDATE ON public.governorates FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: group_screen_permissions audit_group_screen_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_group_screen_permissions AFTER INSERT OR DELETE OR UPDATE ON public.group_screen_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: incoming_transfers audit_incoming_transfers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_incoming_transfers AFTER INSERT OR DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: journal_vouchers audit_journal_vouchers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_journal_vouchers AFTER INSERT OR DELETE OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: loop_entries audit_loop_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_loop_entries AFTER INSERT OR DELETE OR UPDATE ON public.loop_entries FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: loop_entries_details audit_loop_entries_details; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_loop_entries_details AFTER INSERT OR DELETE OR UPDATE ON public.loop_entries_details FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: loop_entries_runs audit_loop_entries_runs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_loop_entries_runs AFTER INSERT OR DELETE OR UPDATE ON public.loop_entries_runs FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: outgoing_transfers audit_outgoing_transfers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_outgoing_transfers AFTER INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: period_closings audit_period_closings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_period_closings AFTER INSERT OR DELETE OR UPDATE ON public.period_closings FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: profiles audit_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_profiles AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: receiver_cards audit_receiver_cards; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_receiver_cards AFTER INSERT OR DELETE OR UPDATE ON public.receiver_cards FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: sell_currencies audit_sell_currencies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sell_currencies AFTER INSERT OR DELETE OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: staff_work_defaults audit_staff_work_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_staff_work_defaults AFTER INSERT OR DELETE OR UPDATE ON public.staff_work_defaults FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: transfer_entities audit_transfer_entities; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_transfer_entities AFTER INSERT OR DELETE OR UPDATE ON public.transfer_entities FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: transfer_purposes audit_transfer_purposes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_transfer_purposes AFTER INSERT OR DELETE OR UPDATE ON public.transfer_purposes FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: user_roles audit_user_roles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_user_roles AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: user_screen_permissions audit_user_screen_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_user_screen_permissions AFTER INSERT OR DELETE OR UPDATE ON public.user_screen_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: blacklist blacklist_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blacklist_autonumber BEFORE INSERT ON public.blacklist FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: box_closings box_closings_action_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER box_closings_action_permissions BEFORE INSERT OR DELETE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION public.guard_closing_permissions();


--
-- Name: box_closings box_closings_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER box_closings_balance BEFORE INSERT ON public.box_closings FOR EACH ROW EXECUTE FUNCTION public.closing_compute_balance();


--
-- Name: box_movements box_movements_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER box_movements_guard BEFORE INSERT OR DELETE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION public.guard_closed_box();


--
-- Name: boxes boxes_autoaccount; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boxes_autoaccount BEFORE INSERT ON public.boxes FOR EACH ROW EXECUTE FUNCTION public.party_autoaccount();


--
-- Name: boxes boxes_drop_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boxes_drop_account AFTER DELETE ON public.boxes FOR EACH ROW EXECUTE FUNCTION public.party_drop_account();


--
-- Name: boxes boxes_guard_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boxes_guard_delete BEFORE DELETE ON public.boxes FOR EACH ROW EXECUTE FUNCTION public.boxes_guard_delete();


--
-- Name: boxes boxes_sync_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boxes_sync_account AFTER UPDATE OF box_name ON public.boxes FOR EACH ROW EXECUTE FUNCTION public.party_sync_account();


--
-- Name: branches branches_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER branches_autonumber BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION public.setup_autonumber();


--
-- Name: buy_currencies buy_to_box; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER buy_to_box AFTER INSERT OR DELETE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.ops_to_box();


--
-- Name: cash_vouchers cash_vouchers_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cash_vouchers_autonumber BEFORE INSERT ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.cash_vouchers_autonumber();


--
-- Name: cash_vouchers cash_vouchers_to_box_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cash_vouchers_to_box_del AFTER DELETE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.cash_voucher_to_box();


--
-- Name: cash_vouchers cash_vouchers_to_box_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cash_vouchers_to_box_ins AFTER INSERT ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.cash_voucher_to_box();


--
-- Name: checks check_book_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_book_guard BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.check_book_guard();


--
-- Name: checks check_to_box_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_to_box_del AFTER DELETE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.check_to_box();


--
-- Name: checks check_to_box_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_to_box_upd AFTER UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.check_to_box();


--
-- Name: checks checks_action_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER checks_action_permissions BEFORE UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.guard_action_permissions();


--
-- Name: checks checks_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER checks_autonumber BEFORE INSERT ON public.checks FOR EACH ROW EXECUTE FUNCTION public.checks_autonumber();


--
-- Name: classifications classifications_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER classifications_autonumber BEFORE INSERT ON public.classifications FOR EACH ROW EXECUTE FUNCTION public.setup_autonumber();


--
-- Name: cost_centers cost_centers_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cost_centers_autonumber BEFORE INSERT ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.cost_centers_autonumber();


--
-- Name: countries countries_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER countries_autonumber BEFORE INSERT ON public.countries FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: customers customers_autoaccount; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_autoaccount BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.party_autoaccount();


--
-- Name: customers customers_drop_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_drop_account AFTER DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.party_drop_account();


--
-- Name: customers customers_sync_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_sync_account AFTER UPDATE OF full_name ON public.customers FOR EACH ROW EXECUTE FUNCTION public.party_sync_account();


--
-- Name: entries entries_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER entries_period_guard BEFORE INSERT ON public.entries FOR EACH ROW EXECUTE FUNCTION public.entry_period_guard();


--
-- Name: buy_currencies exchange_to_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER exchange_to_customer AFTER INSERT OR DELETE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.exchange_to_customer();


--
-- Name: sell_currencies exchange_to_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER exchange_to_customer AFTER INSERT OR DELETE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.exchange_to_customer();


--
-- Name: forbidden_texts forbidden_texts_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER forbidden_texts_autonumber BEFORE INSERT ON public.forbidden_texts FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: funds_inventory funds_inventory_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funds_inventory_autonumber BEFORE INSERT ON public.funds_inventory FOR EACH ROW EXECUTE FUNCTION public.funds_inventory_autonumber();


--
-- Name: governorates governorates_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER governorates_autonumber BEFORE INSERT ON public.governorates FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: agent_settlements guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: box_closings guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.box_closings FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: box_movements guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.box_movements FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: buy_currencies guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: cash_vouchers guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: checks guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: entries_details guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.entries_details FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: incoming_transfers guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: journal_vouchers guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: outgoing_transfers guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: sell_currencies guard_staff_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_assignment BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_assignment();


--
-- Name: agent_settlements guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: buy_currencies guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: cash_vouchers guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: checks guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: entries guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: incoming_transfers guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: journal_vouchers guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: outgoing_transfers guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: sell_currencies guard_staff_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_staff_date BEFORE INSERT OR UPDATE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.guard_staff_date();


--
-- Name: incoming_transfers incoming_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER incoming_autonumber BEFORE INSERT ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.transfer_autonumber();


--
-- Name: incoming_transfers incoming_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER incoming_customer AFTER UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.transfer_to_customer();


--
-- Name: incoming_transfers incoming_state_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER incoming_state_guard BEFORE UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_transfer_state();


--
-- Name: incoming_transfers incoming_to_box; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER incoming_to_box AFTER DELETE OR UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.ops_to_box();


--
-- Name: incoming_transfers incoming_transfers_action_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER incoming_transfers_action_permissions BEFORE UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_action_permissions();


--
-- Name: journal_vouchers journal_vouchers_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_vouchers_autonumber BEFORE INSERT ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.journal_vouchers_autonumber();


--
-- Name: journal_vouchers journal_vouchers_to_entry_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_vouchers_to_entry_del AFTER DELETE ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.journal_voucher_to_entry();


--
-- Name: journal_vouchers journal_vouchers_to_entry_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_vouchers_to_entry_ins AFTER INSERT ON public.journal_vouchers FOR EACH ROW EXECUTE FUNCTION public.journal_voucher_to_entry();


--
-- Name: loop_entries loop_entries_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER loop_entries_autonumber BEFORE INSERT ON public.loop_entries FOR EACH ROW EXECUTE FUNCTION public.loop_entries_autonumber();


--
-- Name: outgoing_transfers outgoing_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outgoing_autonumber BEFORE INSERT ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.transfer_autonumber();


--
-- Name: outgoing_transfers outgoing_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outgoing_customer AFTER INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.transfer_to_customer();


--
-- Name: outgoing_transfers outgoing_state_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outgoing_state_guard BEFORE UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_transfer_state();


--
-- Name: outgoing_transfers outgoing_to_box; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outgoing_to_box AFTER INSERT OR DELETE OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.ops_to_box();


--
-- Name: outgoing_transfers outgoing_transfers_action_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outgoing_transfers_action_permissions BEFORE UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_action_permissions();


--
-- Name: profiles profiles_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: receiver_cards receiver_cards_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receiver_cards_autonumber BEFORE INSERT ON public.receiver_cards FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: currency_prices record_currency_rate_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER record_currency_rate_history AFTER INSERT OR UPDATE ON public.currency_prices FOR EACH ROW EXECUTE FUNCTION public.record_currency_rate_history();


--
-- Name: transfer_requests request_decision_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER request_decision_access BEFORE UPDATE ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION public.guard_request_decision_access();


--
-- Name: sell_currencies sell_to_box; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sell_to_box AFTER INSERT OR DELETE ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.ops_to_box();


--
-- Name: agent_settlements settlements_to_box; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER settlements_to_box AFTER INSERT OR DELETE ON public.agent_settlements FOR EACH ROW EXECUTE FUNCTION public.ops_to_box();


--
-- Name: transfer_entities transfer_entities_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transfer_entities_autonumber BEFORE INSERT ON public.transfer_entities FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: transfer_purposes transfer_purposes_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transfer_purposes_autonumber BEFORE INSERT ON public.transfer_purposes FOR EACH ROW EXECUTE FUNCTION public.reference_autonumber();


--
-- Name: buy_currencies trg_buy_customer_stopped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_buy_customer_stopped BEFORE INSERT ON public.buy_currencies FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_not_stopped();


--
-- Name: cash_vouchers trg_cash_vouchers_customer_stopped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cash_vouchers_customer_stopped BEFORE INSERT ON public.cash_vouchers FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_not_stopped();


--
-- Name: incoming_transfers trg_incoming_customer_stopped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_incoming_customer_stopped BEFORE INSERT ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_not_stopped();


--
-- Name: outgoing_transfers trg_outgoing_customer_stopped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_outgoing_customer_stopped BEFORE INSERT ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_not_stopped();


--
-- Name: sell_currencies trg_sell_customer_stopped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sell_customer_stopped BEFORE INSERT ON public.sell_currencies FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_not_stopped();


--
-- Name: user_groups user_groups_autonumber; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_groups_autonumber BEFORE INSERT ON public.user_groups FOR EACH ROW EXECUTE FUNCTION public.setup_autonumber();


--
-- Name: staff_work_defaults validate_staff_work_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_staff_work_defaults BEFORE INSERT OR UPDATE ON public.staff_work_defaults FOR EACH ROW EXECUTE FUNCTION public.validate_staff_work_defaults();


--
-- Name: withdrawal_requests withdrawal_decision_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER withdrawal_decision_access BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.guard_request_decision_access();


--
-- Name: outgoing_transfers z_validate_transfer_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_validate_transfer_check BEFORE INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.validate_transfer_check();


--
-- Name: incoming_transfers zz_route_internal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_route_internal AFTER UPDATE ON public.incoming_transfers FOR EACH ROW EXECUTE FUNCTION public.route_internal_transfer();


--
-- Name: outgoing_transfers zz_route_internal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_route_internal AFTER INSERT OR UPDATE ON public.outgoing_transfers FOR EACH ROW EXECUTE FUNCTION public.route_internal_transfer();


--
-- Name: accounts accounts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts accounts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.account_groups(id);


--
-- Name: activation_codes activation_codes_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.installation_license(id);


--
-- Name: agent_settlements agent_settlements_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_settlements
    ADD CONSTRAINT agent_settlements_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: agent_settlements agent_settlements_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_settlements
    ADD CONSTRAINT agent_settlements_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: agent_settlements agent_settlements_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_settlements
    ADD CONSTRAINT agent_settlements_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: agents agents_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: agents agents_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: agents agents_classification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_classification_id_fkey FOREIGN KEY (classification_id) REFERENCES public.classifications(id);


--
-- Name: areas areas_governorate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_governorate_id_fkey FOREIGN KEY (governorate_id) REFERENCES public.governorates(id);


--
-- Name: bank_accounts bank_accounts_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id);


--
-- Name: bank_accounts bank_accounts_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: box_closings box_closings_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_closings
    ADD CONSTRAINT box_closings_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id) ON DELETE CASCADE;


--
-- Name: box_closings box_closings_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_closings
    ADD CONSTRAINT box_closings_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: box_movements box_movements_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_movements
    ADD CONSTRAINT box_movements_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id) ON DELETE CASCADE;


--
-- Name: box_movements box_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_movements
    ADD CONSTRAINT box_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: box_movements box_movements_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_movements
    ADD CONSTRAINT box_movements_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: boxes boxes_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boxes
    ADD CONSTRAINT boxes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: boxes boxes_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boxes
    ADD CONSTRAINT boxes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: buy_currencies buy_currencies_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: buy_currencies buy_currencies_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: buy_currencies buy_currencies_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: buy_currencies buy_currencies_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: buy_currencies buy_currencies_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: buy_currencies buy_currencies_exchange_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_currencies
    ADD CONSTRAINT buy_currencies_exchange_currency_id_fkey FOREIGN KEY (exchange_currency_id) REFERENCES public.currencies(id);


--
-- Name: cash_vouchers cash_vouchers_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_vouchers
    ADD CONSTRAINT cash_vouchers_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: cash_vouchers cash_vouchers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_vouchers
    ADD CONSTRAINT cash_vouchers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_vouchers cash_vouchers_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_vouchers
    ADD CONSTRAINT cash_vouchers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: cash_vouchers cash_vouchers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_vouchers
    ADD CONSTRAINT cash_vouchers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: check_books check_books_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_books
    ADD CONSTRAINT check_books_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id);


--
-- Name: checks checks_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id);


--
-- Name: checks checks_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.check_books(id);


--
-- Name: checks checks_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: checks checks_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: checks checks_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: checks checks_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: checks checks_exchange_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_exchange_currency_id_fkey FOREIGN KEY (exchange_currency_id) REFERENCES public.currencies(id);


--
-- Name: commission_rules commission_rules_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: commission_rules commission_rules_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: commission_rules commission_rules_commission_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_commission_currency_id_fkey FOREIGN KEY (commission_currency_id) REFERENCES public.currencies(id);


--
-- Name: commission_rules commission_rules_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cost_centers(id);


--
-- Name: currency_prices currency_prices_source_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_prices
    ADD CONSTRAINT currency_prices_source_currency_id_fkey FOREIGN KEY (source_currency_id) REFERENCES public.currencies(id) ON DELETE CASCADE;


--
-- Name: currency_prices currency_prices_target_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_prices
    ADD CONSTRAINT currency_prices_target_currency_id_fkey FOREIGN KEY (target_currency_id) REFERENCES public.currencies(id) ON DELETE CASCADE;


--
-- Name: currency_rate_history currency_rate_history_source_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rate_history
    ADD CONSTRAINT currency_rate_history_source_currency_id_fkey FOREIGN KEY (source_currency_id) REFERENCES public.currencies(id);


--
-- Name: currency_rate_history currency_rate_history_target_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rate_history
    ADD CONSTRAINT currency_rate_history_target_currency_id_fkey FOREIGN KEY (target_currency_id) REFERENCES public.currencies(id);


--
-- Name: customer_transfer_movements customer_transfer_movements_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_transfer_movements
    ADD CONSTRAINT customer_transfer_movements_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: customer_transfer_movements customer_transfer_movements_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_transfer_movements
    ADD CONSTRAINT customer_transfer_movements_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customers customers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: customers customers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customers customers_classification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_classification_id_fkey FOREIGN KEY (classification_id) REFERENCES public.classifications(id);


--
-- Name: entries entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: entries_details entries_details_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries_details
    ADD CONSTRAINT entries_details_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: entries_details entries_details_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries_details
    ADD CONSTRAINT entries_details_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: entries_details entries_details_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries_details
    ADD CONSTRAINT entries_details_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE CASCADE;


--
-- Name: funds_inventory funds_inventory_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds_inventory
    ADD CONSTRAINT funds_inventory_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: funds_inventory funds_inventory_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds_inventory
    ADD CONSTRAINT funds_inventory_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: funds_inventory_details funds_inventory_details_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds_inventory_details
    ADD CONSTRAINT funds_inventory_details_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: funds_inventory_details funds_inventory_details_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds_inventory_details
    ADD CONSTRAINT funds_inventory_details_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.funds_inventory(id) ON DELETE CASCADE;


--
-- Name: governorates governorates_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governorates
    ADD CONSTRAINT governorates_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: group_screen_permissions group_screen_permissions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_screen_permissions
    ADD CONSTRAINT group_screen_permissions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: incoming_transfers incoming_transfers_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: incoming_transfers incoming_transfers_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: incoming_transfers incoming_transfers_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: incoming_transfers incoming_transfers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: incoming_transfers incoming_transfers_commission_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_commission_currency_id_fkey FOREIGN KEY (commission_currency_id) REFERENCES public.currencies(id);


--
-- Name: incoming_transfers incoming_transfers_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: incoming_transfers incoming_transfers_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: incoming_transfers incoming_transfers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: incoming_transfers incoming_transfers_export_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_export_agent_id_fkey FOREIGN KEY (export_agent_id) REFERENCES public.agents(id);


--
-- Name: incoming_transfers incoming_transfers_governorate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_governorate_id_fkey FOREIGN KEY (governorate_id) REFERENCES public.governorates(id);


--
-- Name: incoming_transfers incoming_transfers_internal_outgoing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoming_transfers
    ADD CONSTRAINT incoming_transfers_internal_outgoing_id_fkey FOREIGN KEY (internal_outgoing_id) REFERENCES public.outgoing_transfers(id);


--
-- Name: journal_vouchers journal_vouchers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_vouchers
    ADD CONSTRAINT journal_vouchers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: journal_vouchers journal_vouchers_credit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_vouchers
    ADD CONSTRAINT journal_vouchers_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES public.accounts(id);


--
-- Name: journal_vouchers journal_vouchers_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_vouchers
    ADD CONSTRAINT journal_vouchers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: journal_vouchers journal_vouchers_debit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_vouchers
    ADD CONSTRAINT journal_vouchers_debit_account_id_fkey FOREIGN KEY (debit_account_id) REFERENCES public.accounts(id);


--
-- Name: journal_vouchers journal_vouchers_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_vouchers
    ADD CONSTRAINT journal_vouchers_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE SET NULL;


--
-- Name: loop_entries loop_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries
    ADD CONSTRAINT loop_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: loop_entries_details loop_entries_details_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_details
    ADD CONSTRAINT loop_entries_details_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: loop_entries_details loop_entries_details_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_details
    ADD CONSTRAINT loop_entries_details_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: loop_entries_details loop_entries_details_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_details
    ADD CONSTRAINT loop_entries_details_loop_id_fkey FOREIGN KEY (loop_id) REFERENCES public.loop_entries(id) ON DELETE CASCADE;


--
-- Name: loop_entries_runs loop_entries_runs_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_runs
    ADD CONSTRAINT loop_entries_runs_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);


--
-- Name: loop_entries_runs loop_entries_runs_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_entries_runs
    ADD CONSTRAINT loop_entries_runs_loop_id_fkey FOREIGN KEY (loop_id) REFERENCES public.loop_entries(id) ON DELETE CASCADE;


--
-- Name: outgoing_transfers outgoing_transfers_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: outgoing_transfers outgoing_transfers_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: outgoing_transfers outgoing_transfers_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: outgoing_transfers outgoing_transfers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: outgoing_transfers outgoing_transfers_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.checks(id);


--
-- Name: outgoing_transfers outgoing_transfers_commission_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_commission_currency_id_fkey FOREIGN KEY (commission_currency_id) REFERENCES public.currencies(id);


--
-- Name: outgoing_transfers outgoing_transfers_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: outgoing_transfers outgoing_transfers_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: outgoing_transfers outgoing_transfers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: outgoing_transfers outgoing_transfers_export_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_export_agent_id_fkey FOREIGN KEY (export_agent_id) REFERENCES public.agents(id);


--
-- Name: outgoing_transfers outgoing_transfers_governorate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_transfers
    ADD CONSTRAINT outgoing_transfers_governorate_id_fkey FOREIGN KEY (governorate_id) REFERENCES public.governorates(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: receiver_cards receiver_cards_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receiver_cards
    ADD CONSTRAINT receiver_cards_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: sell_currencies sell_currencies_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: sell_currencies sell_currencies_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: sell_currencies sell_currencies_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: sell_currencies sell_currencies_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: sell_currencies sell_currencies_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: sell_currencies sell_currencies_exchange_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sell_currencies
    ADD CONSTRAINT sell_currencies_exchange_currency_id_fkey FOREIGN KEY (exchange_currency_id) REFERENCES public.currencies(id);


--
-- Name: staff_work_defaults staff_work_defaults_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_work_defaults
    ADD CONSTRAINT staff_work_defaults_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);


--
-- Name: staff_work_defaults staff_work_defaults_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_work_defaults
    ADD CONSTRAINT staff_work_defaults_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: staff_work_defaults staff_work_defaults_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_work_defaults
    ADD CONSTRAINT staff_work_defaults_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: staff_work_defaults staff_work_defaults_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_work_defaults
    ADD CONSTRAINT staff_work_defaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: transfer_entities transfer_entities_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_entities
    ADD CONSTRAINT transfer_entities_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: user_group_members user_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_screen_permissions user_screen_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_screen_permissions
    ADD CONSTRAINT user_screen_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: withdrawal_requests withdrawal_requests_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: withdrawal_requests withdrawal_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: accounts Accountants manage accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accountants manage accounts" ON public.accounts TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role)));


--
-- Name: entries Accountants manage entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accountants manage entries" ON public.entries TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)));


--
-- Name: entries_details Accountants manage entry details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accountants manage entry details" ON public.entries_details TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)));


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins can read all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: account_groups Admins manage account groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage account groups" ON public.account_groups TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: branches Admins manage branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage branches" ON public.branches TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: classifications Admins manage classifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage classifications" ON public.classifications TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: currencies Admins manage currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage currencies" ON public.currencies TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: user_group_members Admins manage group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage group members" ON public.user_group_members TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: user_groups Admins manage user groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage user groups" ON public.user_groups TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: staff_work_defaults Admins manage work defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage work defaults" ON public.staff_work_defaults TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: activity_log Admins read activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read activity" ON public.activity_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: profiles Admins read all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: checks Managers delete checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete checks" ON public.checks FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: customers Managers delete customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete customers" ON public.customers FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: journal_vouchers Managers delete journal vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete journal vouchers" ON public.journal_vouchers FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: agent_settlements Managers delete settlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete settlements" ON public.agent_settlements FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: cash_vouchers Managers delete vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete vouchers" ON public.cash_vouchers FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: agents Managers manage agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage agents" ON public.agents TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: areas Managers manage areas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage areas" ON public.areas TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: blacklist Managers manage blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage blacklist" ON public.blacklist TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: boxes Managers manage boxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage boxes" ON public.boxes TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: commission_rules Managers manage commission rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage commission rules" ON public.commission_rules TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: countries Managers manage countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage countries" ON public.countries TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: forbidden_texts Managers manage forbidden texts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage forbidden texts" ON public.forbidden_texts TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: governorates Managers manage governorates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage governorates" ON public.governorates TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: currency_prices Managers manage prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage prices" ON public.currency_prices TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: receiver_cards Managers manage receiver cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage receiver cards" ON public.receiver_cards TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: transfer_entities Managers manage transfer entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage transfer entities" ON public.transfer_entities TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: transfer_purposes Managers manage transfer purposes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage transfer purposes" ON public.transfer_purposes TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: agent_settlements Managers record settlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers record settlements" ON public.agent_settlements FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role)));


--
-- Name: box_closings Managers reopen boxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers reopen boxes" ON public.box_closings FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: customers Staff add customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff add customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.staff_active());


--
-- Name: customers Staff edit customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff edit customers" ON public.customers FOR UPDATE TO authenticated USING (public.staff_active()) WITH CHECK (public.staff_active());


--
-- Name: activity_log Staff log own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff log own activity" ON public.activity_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: account_groups Staff read account groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read account groups" ON public.account_groups FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: accounts Staff read accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read accounts" ON public.accounts FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: agents Staff read agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read agents" ON public.agents FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: areas Staff read areas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read areas" ON public.areas FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: blacklist Staff read blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read blacklist" ON public.blacklist FOR SELECT TO authenticated USING (public.staff_can_read('{/transfers,/transfer-setup,/commissions,/app,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: box_movements Staff read box movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read box movements" ON public.box_movements FOR SELECT TO authenticated USING (public.staff_can_read('{/boxes,/closing,/app,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: boxes Staff read boxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read boxes" ON public.boxes FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: branches Staff read branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read branches" ON public.branches FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: buy_currencies Staff read buy operations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read buy operations" ON public.buy_currencies FOR SELECT TO authenticated USING (public.staff_can_read('{/exchange,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: checks Staff read checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read checks" ON public.checks FOR SELECT TO authenticated USING (public.staff_can_read('{/checks,/transfers,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: classifications Staff read classifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read classifications" ON public.classifications FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: box_closings Staff read closings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read closings" ON public.box_closings FOR SELECT TO authenticated USING (public.staff_can_read('{/boxes,/closing,/app,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: commission_rules Staff read commission rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read commission rules" ON public.commission_rules FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: countries Staff read countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read countries" ON public.countries FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: currencies Staff read currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read currencies" ON public.currencies FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: customers Staff read customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read customers" ON public.customers FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: entries Staff read entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read entries" ON public.entries FOR SELECT TO authenticated USING (public.staff_can_read('{/journal,/entries,/accounts,/period-closing,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: entries_details Staff read entry details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read entry details" ON public.entries_details FOR SELECT TO authenticated USING (public.staff_can_read('{/journal,/entries,/accounts,/period-closing,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: forbidden_texts Staff read forbidden texts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read forbidden texts" ON public.forbidden_texts FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: governorates Staff read governorates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read governorates" ON public.governorates FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: user_group_members Staff read group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read group members" ON public.user_group_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: incoming_transfers Staff read incoming transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read incoming transfers" ON public.incoming_transfers FOR SELECT TO authenticated USING (public.staff_can_read('{/transfers,/transfer-setup,/commissions,/app,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: journal_vouchers Staff read journal vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read journal vouchers" ON public.journal_vouchers FOR SELECT TO authenticated USING (public.staff_can_read('{/journal,/entries,/accounts,/period-closing,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: outgoing_transfers Staff read outgoing transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read outgoing transfers" ON public.outgoing_transfers FOR SELECT TO authenticated USING (public.staff_can_read('{/transfers,/transfer-setup,/commissions,/app,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: staff_work_defaults Staff read own work defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read own work defaults" ON public.staff_work_defaults FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: currency_prices Staff read prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read prices" ON public.currency_prices FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: receiver_cards Staff read receiver cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read receiver cards" ON public.receiver_cards FOR SELECT TO authenticated USING (public.staff_can_read('{/transfers,/transfer-setup,/commissions,/app,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: sell_currencies Staff read sell operations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read sell operations" ON public.sell_currencies FOR SELECT TO authenticated USING (public.staff_can_read('{/exchange,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: agent_settlements Staff read settlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read settlements" ON public.agent_settlements FOR SELECT TO authenticated USING (public.staff_can_read('{/agents,/boxes,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: transfer_entities Staff read transfer entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read transfer entities" ON public.transfer_entities FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: transfer_purposes Staff read transfer purposes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read transfer purposes" ON public.transfer_purposes FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: user_groups Staff read user groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read user groups" ON public.user_groups FOR SELECT TO authenticated USING ((public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_group_members m
  WHERE ((m.group_id = user_groups.id) AND (m.user_id = auth.uid()))))));


--
-- Name: cash_vouchers Staff read vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read vouchers" ON public.cash_vouchers FOR SELECT TO authenticated USING (public.staff_can_read('{/vouchers,/boxes,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: checks Staff record checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff record checks" ON public.checks FOR INSERT TO authenticated WITH CHECK (public.staff_active());


--
-- Name: journal_vouchers Staff record journal vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff record journal vouchers" ON public.journal_vouchers FOR INSERT TO authenticated WITH CHECK (public.staff_active());


--
-- Name: cash_vouchers Staff record vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff record vouchers" ON public.cash_vouchers FOR INSERT TO authenticated WITH CHECK (public.staff_active());


--
-- Name: checks Staff update checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update checks" ON public.checks FOR UPDATE TO authenticated USING (public.staff_active()) WITH CHECK (public.staff_active());


--
-- Name: box_closings Tellers close boxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tellers close boxes" ON public.box_closings FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)));


--
-- Name: box_movements Tellers manage box movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tellers manage box movements" ON public.box_movements TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: buy_currencies Tellers manage buy operations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tellers manage buy operations" ON public.buy_currencies TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: incoming_transfers Tellers manage incoming transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tellers manage incoming transfers" ON public.incoming_transfers TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: outgoing_transfers Tellers manage outgoing transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tellers manage outgoing transfers" ON public.outgoing_transfers TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: sell_currencies Tellers manage sell operations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tellers manage sell operations" ON public.sell_currencies TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'teller'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can read their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: account_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: activation_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: activation_codes activation_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activation_owner_read ON public.activation_codes FOR SELECT TO authenticated USING (public.is_platform_owner());


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_setup_claim; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_setup_claim ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_settlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_settlements ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_announcements announcements_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_admin_delete ON public.staff_announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: staff_announcements announcements_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_admin_insert ON public.staff_announcements FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (created_by = auth.uid())));


--
-- Name: staff_announcements announcements_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_admin_update ON public.staff_announcements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: staff_announcements announcements_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_visible ON public.staff_announcements FOR SELECT TO authenticated USING (((active AND (starts_at <= now()) AND ((ends_at IS NULL) OR (ends_at > now()))) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: auto_reply_commands arc_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_read ON public.auto_reply_commands FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: auto_reply_commands arc_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_write ON public.auto_reply_commands FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

--
-- Name: auto_reply_settings ars_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ars_read ON public.auto_reply_settings FOR SELECT TO authenticated USING (public.staff_active());


--
-- Name: auto_reply_settings ars_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ars_write ON public.auto_reply_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: auto_reply_commands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_reply_commands ENABLE ROW LEVEL SECURITY;

--
-- Name: auto_reply_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_reply_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: banks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

--
-- Name: blacklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

--
-- Name: box_closings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.box_closings ENABLE ROW LEVEL SECURITY;

--
-- Name: box_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.box_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: boxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: buy_currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buy_currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_vouchers ENABLE ROW LEVEL SECURITY;

--
-- Name: check_books; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.check_books ENABLE ROW LEVEL SECURITY;

--
-- Name: checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;

--
-- Name: classifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

--
-- Name: countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: currency_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currency_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: currency_rate_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currency_rate_history ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_transfer_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_transfer_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_transfer_movements customer_transfer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_transfer_read ON public.customer_transfer_movements FOR SELECT TO authenticated USING ((public.has_screen_permission('/statement'::text, 'view'::text) OR public.has_screen_permission('/transfers'::text, 'view'::text)));


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: document_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: document_number_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_number_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

--
-- Name: entries_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entries_details ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_years; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

--
-- Name: forbidden_texts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forbidden_texts ENABLE ROW LEVEL SECURITY;

--
-- Name: funds_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funds_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: funds_inventory_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funds_inventory_details ENABLE ROW LEVEL SECURITY;

--
-- Name: governorates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governorates ENABLE ROW LEVEL SECURITY;

--
-- Name: group_screen_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_screen_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: incoming_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incoming_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: installation_license; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installation_license ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_vouchers ENABLE ROW LEVEL SECURITY;

--
-- Name: installation_license license_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY license_staff_read ON public.installation_license FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: loop_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loop_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: loop_entries_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loop_entries_details ENABLE ROW LEVEL SECURITY;

--
-- Name: loop_entries_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loop_entries_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/bank-accounts'::text, 'create'::text)));


--
-- Name: banks module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.banks FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/banks'::text, 'create'::text)));


--
-- Name: check_books module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.check_books FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/check-books'::text, 'create'::text)));


--
-- Name: cost_centers module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.cost_centers FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/cost-centers'::text, 'create'::text)));


--
-- Name: financial_years module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.financial_years FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/financial-years'::text, 'create'::text)));


--
-- Name: funds_inventory module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.funds_inventory FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/funds-inventory'::text, 'create'::text)));


--
-- Name: funds_inventory_details module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.funds_inventory_details FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/funds-inventory'::text, 'create'::text)));


--
-- Name: loop_entries module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.loop_entries FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'create'::text)));


--
-- Name: loop_entries_details module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.loop_entries_details FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'create'::text)));


--
-- Name: loop_entries_runs module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.loop_entries_runs FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'create'::text)));


--
-- Name: transfer_requests module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.transfer_requests FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (requested_by = auth.uid()) AND (status = 'معلق'::text) AND (decided_by IS NULL) AND (decided_at IS NULL) AND public.license_writes_allowed() AND public.has_screen_permission('/transfer-requests'::text, 'create'::text)));


--
-- Name: withdrawal_requests module_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_create ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (requested_by = auth.uid()) AND (status = 'معلق'::text) AND (decided_by IS NULL) AND (decided_at IS NULL) AND public.license_writes_allowed() AND public.has_screen_permission('/withdrawal-requests'::text, 'create'::text)));


--
-- Name: bank_accounts module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.bank_accounts FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/bank-accounts'::text, 'delete'::text)));


--
-- Name: banks module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.banks FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/banks'::text, 'delete'::text)));


--
-- Name: check_books module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.check_books FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/check-books'::text, 'delete'::text)));


--
-- Name: cost_centers module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.cost_centers FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/cost-centers'::text, 'delete'::text)));


--
-- Name: financial_years module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.financial_years FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/financial-years'::text, 'delete'::text)));


--
-- Name: funds_inventory module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.funds_inventory FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/funds-inventory'::text, 'delete'::text)));


--
-- Name: funds_inventory_details module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.funds_inventory_details FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/funds-inventory'::text, 'delete'::text)));


--
-- Name: loop_entries module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.loop_entries FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/loop-entries'::text, 'delete'::text)));


--
-- Name: loop_entries_details module_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_delete ON public.loop_entries_details FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_screen_permission('/loop-entries'::text, 'delete'::text)));


--
-- Name: bank_accounts module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.bank_accounts FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/bank-accounts'::text, 'view'::text)));


--
-- Name: banks module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.banks FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/banks'::text, 'view'::text)));


--
-- Name: check_books module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.check_books FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/check-books'::text, 'view'::text)));


--
-- Name: cost_centers module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.cost_centers FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/cost-centers'::text, 'view'::text)));


--
-- Name: financial_years module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.financial_years FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/financial-years'::text, 'view'::text)));


--
-- Name: funds_inventory module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.funds_inventory FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/funds-inventory'::text, 'view'::text)));


--
-- Name: funds_inventory_details module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.funds_inventory_details FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/funds-inventory'::text, 'view'::text)));


--
-- Name: loop_entries module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.loop_entries FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/loop-entries'::text, 'view'::text)));


--
-- Name: loop_entries_details module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.loop_entries_details FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/loop-entries'::text, 'view'::text)));


--
-- Name: loop_entries_runs module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.loop_entries_runs FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/loop-entries'::text, 'view'::text)));


--
-- Name: transfer_requests module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.transfer_requests FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/transfer-requests'::text, 'view'::text)));


--
-- Name: withdrawal_requests module_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_read ON public.withdrawal_requests FOR SELECT TO authenticated USING ((public.is_exchange_staff() AND public.has_screen_permission('/withdrawal-requests'::text, 'view'::text)));


--
-- Name: bank_accounts module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.bank_accounts FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/bank-accounts'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/bank-accounts'::text, 'update'::text)));


--
-- Name: banks module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.banks FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/banks'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/banks'::text, 'update'::text)));


--
-- Name: check_books module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.check_books FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/check-books'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/check-books'::text, 'update'::text)));


--
-- Name: cost_centers module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.cost_centers FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/cost-centers'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/cost-centers'::text, 'update'::text)));


--
-- Name: financial_years module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.financial_years FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/financial-years'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/financial-years'::text, 'update'::text)));


--
-- Name: funds_inventory module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.funds_inventory FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/funds-inventory'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/funds-inventory'::text, 'update'::text)));


--
-- Name: funds_inventory_details module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.funds_inventory_details FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/funds-inventory'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND public.license_writes_allowed() AND public.has_screen_permission('/funds-inventory'::text, 'update'::text)));


--
-- Name: loop_entries module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.loop_entries FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'update'::text)));


--
-- Name: loop_entries_details module_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_update ON public.loop_entries_details FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'update'::text))) WITH CHECK ((public.is_exchange_staff() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'teller'::public.app_role)) AND public.license_writes_allowed() AND public.has_screen_permission('/loop-entries'::text, 'update'::text)));


--
-- Name: outgoing_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outgoing_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_session_locks own_lock_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_lock_status ON public.staff_session_locks FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (session_id = ((auth.jwt() ->> 'session_id'::text))::uuid)));


--
-- Name: period_closings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.period_closings ENABLE ROW LEVEL SECURITY;

--
-- Name: period_closings period_closings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY period_closings_read ON public.period_closings FOR SELECT TO authenticated USING (public.staff_can_read('{/journal,/entries,/accounts,/period-closing,/statement,/daily-report,/reports,/statistics,/totals,/financials,/profits,/alerts}'::text[]));


--
-- Name: group_screen_permissions permissions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_admin ON public.group_screen_permissions TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: group_screen_permissions permissions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_read ON public.group_screen_permissions FOR SELECT TO authenticated USING ((public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_group_members m
  WHERE ((m.group_id = group_screen_permissions.group_id) AND (m.user_id = auth.uid()))))));


--
-- Name: platform_owners platform_owner_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_owner_self_read ON public.platform_owners FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: platform_owners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles_probe_x; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles_probe_x ENABLE ROW LEVEL SECURITY;

--
-- Name: receiver_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receiver_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.accounts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/accounts'::text, 'create'::text));


--
-- Name: agent_settlements screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.agent_settlements AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/statement'::text, 'create'::text));


--
-- Name: agents screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.agents AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/agents'::text, 'create'::text));


--
-- Name: box_closings screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.box_closings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/closing'::text, 'create'::text));


--
-- Name: box_movements screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.box_movements AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/boxes'::text, 'create'::text));


--
-- Name: boxes screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.boxes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/boxes'::text, 'create'::text));


--
-- Name: buy_currencies screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.buy_currencies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/exchange'::text, 'create'::text));


--
-- Name: cash_vouchers screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.cash_vouchers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/vouchers'::text, 'create'::text));


--
-- Name: checks screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.checks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/checks'::text, 'create'::text));


--
-- Name: commission_rules screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.commission_rules AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/commissions'::text, 'create'::text));


--
-- Name: currencies screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.currencies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/currencies'::text, 'create'::text));


--
-- Name: currency_prices screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.currency_prices AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/currencies'::text, 'create'::text));


--
-- Name: customers screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.customers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/customers'::text, 'create'::text));


--
-- Name: entries screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/entries'::text, 'create'::text));


--
-- Name: entries_details screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.entries_details AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/entries'::text, 'create'::text));


--
-- Name: incoming_transfers screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.incoming_transfers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/transfers'::text, 'create'::text));


--
-- Name: journal_vouchers screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.journal_vouchers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/journal'::text, 'create'::text));


--
-- Name: outgoing_transfers screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.outgoing_transfers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/transfers'::text, 'create'::text));


--
-- Name: sell_currencies screen_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_create ON public.sell_currencies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_screen_permission('/exchange'::text, 'create'::text));


--
-- Name: accounts screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.accounts AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/accounts'::text, 'delete'::text));


--
-- Name: agent_settlements screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.agent_settlements AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/statement'::text, 'delete'::text));


--
-- Name: agents screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.agents AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/agents'::text, 'delete'::text));


--
-- Name: box_closings screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.box_closings AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/closing'::text, 'delete'::text));


--
-- Name: box_movements screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.box_movements AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/boxes'::text, 'delete'::text));


--
-- Name: boxes screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.boxes AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/boxes'::text, 'delete'::text));


--
-- Name: buy_currencies screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.buy_currencies AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/exchange'::text, 'delete'::text));


--
-- Name: cash_vouchers screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.cash_vouchers AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/vouchers'::text, 'delete'::text));


--
-- Name: checks screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.checks AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/checks'::text, 'delete'::text));


--
-- Name: commission_rules screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.commission_rules AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/commissions'::text, 'delete'::text));


--
-- Name: currencies screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.currencies AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/currencies'::text, 'delete'::text));


--
-- Name: currency_prices screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.currency_prices AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/currencies'::text, 'delete'::text));


--
-- Name: customers screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.customers AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/customers'::text, 'delete'::text));


--
-- Name: entries screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.entries AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/entries'::text, 'delete'::text));


--
-- Name: entries_details screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.entries_details AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/entries'::text, 'delete'::text));


--
-- Name: incoming_transfers screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.incoming_transfers AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/transfers'::text, 'delete'::text));


--
-- Name: journal_vouchers screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.journal_vouchers AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/journal'::text, 'delete'::text));


--
-- Name: outgoing_transfers screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.outgoing_transfers AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/transfers'::text, 'delete'::text));


--
-- Name: sell_currencies screen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_delete ON public.sell_currencies AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_screen_permission('/exchange'::text, 'delete'::text));


--
-- Name: accounts screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.accounts AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/accounts'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/accounts'::text, 'update'::text));


--
-- Name: agent_settlements screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.agent_settlements AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/statement'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/statement'::text, 'update'::text));


--
-- Name: agents screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.agents AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/agents'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/agents'::text, 'update'::text));


--
-- Name: box_closings screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.box_closings AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/closing'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/closing'::text, 'update'::text));


--
-- Name: box_movements screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.box_movements AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/boxes'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/boxes'::text, 'update'::text));


--
-- Name: boxes screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.boxes AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/boxes'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/boxes'::text, 'update'::text));


--
-- Name: buy_currencies screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.buy_currencies AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/exchange'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/exchange'::text, 'update'::text));


--
-- Name: cash_vouchers screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.cash_vouchers AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/vouchers'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/vouchers'::text, 'update'::text));


--
-- Name: checks screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.checks AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/checks'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/checks'::text, 'update'::text));


--
-- Name: commission_rules screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.commission_rules AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/commissions'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/commissions'::text, 'update'::text));


--
-- Name: currencies screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.currencies AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/currencies'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/currencies'::text, 'update'::text));


--
-- Name: currency_prices screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.currency_prices AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/currencies'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/currencies'::text, 'update'::text));


--
-- Name: customers screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.customers AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/customers'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/customers'::text, 'update'::text));


--
-- Name: entries screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.entries AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/entries'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/entries'::text, 'update'::text));


--
-- Name: entries_details screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.entries_details AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/entries'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/entries'::text, 'update'::text));


--
-- Name: incoming_transfers screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.incoming_transfers AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/transfers'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/transfers'::text, 'update'::text));


--
-- Name: journal_vouchers screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.journal_vouchers AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/journal'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/journal'::text, 'update'::text));


--
-- Name: outgoing_transfers screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.outgoing_transfers AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/transfers'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/transfers'::text, 'update'::text));


--
-- Name: sell_currencies screen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY screen_update ON public.sell_currencies AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_screen_permission('/exchange'::text, 'update'::text)) WITH CHECK (public.has_screen_permission('/exchange'::text, 'update'::text));


--
-- Name: sell_currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sell_currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: account_groups session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.account_groups AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: accounts session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.accounts AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: activity_log session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.activity_log AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: agent_settlements session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.agent_settlements AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: agents session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.agents AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: areas session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.areas AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: auto_reply_commands session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.auto_reply_commands AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: auto_reply_settings session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.auto_reply_settings AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: blacklist session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.blacklist AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: box_closings session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.box_closings AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: box_movements session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.box_movements AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: boxes session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.boxes AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: branches session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.branches AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: buy_currencies session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.buy_currencies AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: cash_vouchers session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.cash_vouchers AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: checks session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.checks AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: classifications session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.classifications AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: commission_rules session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.commission_rules AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: countries session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.countries AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: currencies session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.currencies AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: currency_prices session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.currency_prices AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: currency_rate_history session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.currency_rate_history AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: customer_transfer_movements session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.customer_transfer_movements AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: customers session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.customers AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: entries session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.entries AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: entries_details session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.entries_details AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: forbidden_texts session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.forbidden_texts AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: governorates session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.governorates AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: group_screen_permissions session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.group_screen_permissions AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: incoming_transfers session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.incoming_transfers AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: journal_vouchers session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.journal_vouchers AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: outgoing_transfers session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.outgoing_transfers AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: period_closings session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.period_closings AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: profiles session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.profiles AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: profiles_probe_x session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.profiles_probe_x AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: receiver_cards session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.receiver_cards AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: sell_currencies session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.sell_currencies AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: staff_announcements session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.staff_announcements AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: staff_work_defaults session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.staff_work_defaults AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: transfer_entities session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.transfer_entities AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: transfer_purposes session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.transfer_purposes AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: user_group_members session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.user_group_members AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: user_groups session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.user_groups AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: user_roles session_security; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_security ON public.user_roles AS RESTRICTIVE TO authenticated USING ((public.staff_session_unlocked() AND public.staff_mfa_satisfied())) WITH CHECK ((public.staff_session_unlocked() AND public.staff_mfa_satisfied()));


--
-- Name: system_settings staff read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read settings" ON public.system_settings FOR SELECT TO authenticated USING (public.is_exchange_staff());


--
-- Name: staff_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: buy_currencies staff_buy_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_buy_scope ON public.buy_currencies AS RESTRICTIVE TO authenticated USING (public.staff_trade_allowed('buy'::text)) WITH CHECK (public.staff_trade_allowed('buy'::text));


--
-- Name: currency_rate_history staff_read_rate_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_read_rate_history ON public.currency_rate_history FOR SELECT TO authenticated USING (public.has_screen_permission('/currencies'::text, 'view'::text));


--
-- Name: sell_currencies staff_sell_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_sell_scope ON public.sell_currencies AS RESTRICTIVE TO authenticated USING (public.staff_trade_allowed('sell'::text)) WITH CHECK (public.staff_trade_allowed('sell'::text));


--
-- Name: staff_session_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_session_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_work_defaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_work_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_purposes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_purposes ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: user_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: user_screen_permissions user_permissions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_permissions_admin ON public.user_screen_permissions TO authenticated USING ((public.is_admin(auth.uid()) AND public.staff_active())) WITH CHECK ((public.is_admin(auth.uid()) AND public.staff_active() AND (screen_path <> '/license'::text)));


--
-- Name: user_screen_permissions user_permissions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_permissions_read ON public.user_screen_permissions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_screen_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_screen_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: withdrawal_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings write settings delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "write settings delete" ON public.system_settings FOR DELETE TO authenticated USING ((public.is_exchange_staff() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR ((scope = 'user'::text) AND (owner = (auth.uid())::text)))));


--
-- Name: system_settings write settings insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "write settings insert" ON public.system_settings FOR INSERT TO authenticated WITH CHECK ((public.is_exchange_staff() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR ((scope = 'user'::text) AND (owner = (auth.uid())::text)))));


--
-- Name: system_settings write settings update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "write settings update" ON public.system_settings FOR UPDATE TO authenticated USING ((public.is_exchange_staff() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR ((scope = 'user'::text) AND (owner = (auth.uid())::text))))) WITH CHECK ((public.is_exchange_staff() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR ((scope = 'user'::text) AND (owner = (auth.uid())::text)))));


--
-- Name: zz_probe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zz_probe ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION accounts_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.accounts_autonumber() TO anon;
GRANT ALL ON FUNCTION public.accounts_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.accounts_autonumber() TO service_role;


--
-- Name: FUNCTION accounts_guard_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.accounts_guard_delete() TO anon;
GRANT ALL ON FUNCTION public.accounts_guard_delete() TO authenticated;
GRANT ALL ON FUNCTION public.accounts_guard_delete() TO service_role;


--
-- Name: FUNCTION aden_date(ts timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.aden_date(ts timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.aden_date(ts timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.aden_date(ts timestamp with time zone) TO service_role;


--
-- Name: FUNCTION apply_activation_code(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_activation_code(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_activation_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.apply_activation_code(p_code text) TO service_role;


--
-- Name: FUNCTION assign_document_number(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assign_document_number() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_document_number() TO service_role;


--
-- Name: FUNCTION audit_row(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_row() TO anon;
GRANT ALL ON FUNCTION public.audit_row() TO authenticated;
GRANT ALL ON FUNCTION public.audit_row() TO service_role;


--
-- Name: FUNCTION box_day_summary(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.box_day_summary(p_date date) TO anon;
GRANT ALL ON FUNCTION public.box_day_summary(p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.box_day_summary(p_date date) TO service_role;


--
-- Name: FUNCTION boxes_guard_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.boxes_guard_delete() TO anon;
GRANT ALL ON FUNCTION public.boxes_guard_delete() TO authenticated;
GRANT ALL ON FUNCTION public.boxes_guard_delete() TO service_role;


--
-- Name: FUNCTION can_access_transfer_evidence(p_path text, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_transfer_evidence(p_path text, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_transfer_evidence(p_path text, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_transfer_evidence(p_path text, p_action text) TO service_role;


--
-- Name: FUNCTION cash_voucher_to_box(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cash_voucher_to_box() TO anon;
GRANT ALL ON FUNCTION public.cash_voucher_to_box() TO authenticated;
GRANT ALL ON FUNCTION public.cash_voucher_to_box() TO service_role;


--
-- Name: FUNCTION cash_vouchers_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cash_vouchers_autonumber() TO anon;
GRANT ALL ON FUNCTION public.cash_vouchers_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.cash_vouchers_autonumber() TO service_role;


--
-- Name: FUNCTION check_book_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_book_guard() TO anon;
GRANT ALL ON FUNCTION public.check_book_guard() TO authenticated;
GRANT ALL ON FUNCTION public.check_book_guard() TO service_role;


--
-- Name: FUNCTION check_to_box(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_to_box() TO anon;
GRANT ALL ON FUNCTION public.check_to_box() TO authenticated;
GRANT ALL ON FUNCTION public.check_to_box() TO service_role;


--
-- Name: FUNCTION checks_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.checks_autonumber() TO anon;
GRANT ALL ON FUNCTION public.checks_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.checks_autonumber() TO service_role;


--
-- Name: FUNCTION close_period(p_type text, p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.close_period(p_type text, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_period(p_type text, p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.close_period(p_type text, p_from date, p_to date) TO service_role;


--
-- Name: FUNCTION closing_compute_balance(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.closing_compute_balance() TO anon;
GRANT ALL ON FUNCTION public.closing_compute_balance() TO authenticated;
GRANT ALL ON FUNCTION public.closing_compute_balance() TO service_role;


--
-- Name: FUNCTION cost_centers_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cost_centers_autonumber() TO anon;
GRANT ALL ON FUNCTION public.cost_centers_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.cost_centers_autonumber() TO service_role;


--
-- Name: FUNCTION create_balanced_entry(p_entry_number bigint, p_the_date date, p_notes text, p_branch_id bigint, p_details jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_balanced_entry(p_entry_number bigint, p_the_date date, p_notes text, p_branch_id bigint, p_details jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_balanced_entry(p_entry_number bigint, p_the_date date, p_notes text, p_branch_id bigint, p_details jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_balanced_entry(p_entry_number bigint, p_the_date date, p_notes text, p_branch_id bigint, p_details jsonb) TO service_role;


--
-- Name: FUNCTION create_multi_cash_voucher(p_batch uuid, p_type text, p_customer bigint, p_name text, p_box bigint, p_date date, p_notes text, p_lines jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_multi_cash_voucher(p_batch uuid, p_type text, p_customer bigint, p_name text, p_box bigint, p_date date, p_notes text, p_lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_multi_cash_voucher(p_batch uuid, p_type text, p_customer bigint, p_name text, p_box bigint, p_date date, p_notes text, p_lines jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_multi_cash_voucher(p_batch uuid, p_type text, p_customer bigint, p_name text, p_box bigint, p_date date, p_notes text, p_lines jsonb) TO service_role;


--
-- Name: FUNCTION daily_operations_report(p_date date, p_branch bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.daily_operations_report(p_date date, p_branch bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.daily_operations_report(p_date date, p_branch bigint) TO authenticated;
GRANT ALL ON FUNCTION public.daily_operations_report(p_date date, p_branch bigint) TO service_role;


--
-- Name: FUNCTION decide_transfer_request(p_id bigint, p_approve boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decide_transfer_request(p_id bigint, p_approve boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_transfer_request(p_id bigint, p_approve boolean) TO authenticated;
GRANT ALL ON FUNCTION public.decide_transfer_request(p_id bigint, p_approve boolean) TO service_role;


--
-- Name: FUNCTION decide_withdrawal_request(p_id bigint, p_approve boolean, p_response text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decide_withdrawal_request(p_id bigint, p_approve boolean, p_response text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_withdrawal_request(p_id bigint, p_approve boolean, p_response text) TO authenticated;
GRANT ALL ON FUNCTION public.decide_withdrawal_request(p_id bigint, p_approve boolean, p_response text) TO service_role;


--
-- Name: FUNCTION delete_cash_voucher(p_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_cash_voucher(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_cash_voucher(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_cash_voucher(p_id bigint) TO service_role;


--
-- Name: FUNCTION document_scope(p_table text, p_row jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.document_scope(p_table text, p_row jsonb) TO anon;
GRANT ALL ON FUNCTION public.document_scope(p_table text, p_row jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.document_scope(p_table text, p_row jsonb) TO service_role;


--
-- Name: FUNCTION enforce_customer_not_stopped(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_customer_not_stopped() TO anon;
GRANT ALL ON FUNCTION public.enforce_customer_not_stopped() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_customer_not_stopped() TO service_role;


--
-- Name: FUNCTION entry_period_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.entry_period_guard() TO anon;
GRANT ALL ON FUNCTION public.entry_period_guard() TO authenticated;
GRANT ALL ON FUNCTION public.entry_period_guard() TO service_role;


--
-- Name: FUNCTION exchange_to_customer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.exchange_to_customer() TO anon;
GRANT ALL ON FUNCTION public.exchange_to_customer() TO authenticated;
GRANT ALL ON FUNCTION public.exchange_to_customer() TO service_role;


--
-- Name: FUNCTION funds_inventory_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.funds_inventory_autonumber() TO anon;
GRANT ALL ON FUNCTION public.funds_inventory_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.funds_inventory_autonumber() TO service_role;


--
-- Name: FUNCTION guard_action_permissions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_action_permissions() TO anon;
GRANT ALL ON FUNCTION public.guard_action_permissions() TO authenticated;
GRANT ALL ON FUNCTION public.guard_action_permissions() TO service_role;


--
-- Name: FUNCTION guard_closed_box(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_closed_box() TO anon;
GRANT ALL ON FUNCTION public.guard_closed_box() TO authenticated;
GRANT ALL ON FUNCTION public.guard_closed_box() TO service_role;


--
-- Name: FUNCTION guard_closing_permissions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_closing_permissions() TO anon;
GRANT ALL ON FUNCTION public.guard_closing_permissions() TO authenticated;
GRANT ALL ON FUNCTION public.guard_closing_permissions() TO service_role;


--
-- Name: FUNCTION guard_internal_transfer(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_internal_transfer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_internal_transfer() TO anon;
GRANT ALL ON FUNCTION public.guard_internal_transfer() TO authenticated;
GRANT ALL ON FUNCTION public.guard_internal_transfer() TO service_role;


--
-- Name: FUNCTION guard_license_operation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_license_operation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_license_operation() TO service_role;


--
-- Name: FUNCTION guard_linked_transfer_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_linked_transfer_check() TO anon;
GRANT ALL ON FUNCTION public.guard_linked_transfer_check() TO authenticated;
GRANT ALL ON FUNCTION public.guard_linked_transfer_check() TO service_role;


--
-- Name: FUNCTION guard_request_decision_access(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_request_decision_access() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_request_decision_access() TO service_role;


--
-- Name: FUNCTION guard_staff_date(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_staff_date() TO anon;
GRANT ALL ON FUNCTION public.guard_staff_date() TO authenticated;
GRANT ALL ON FUNCTION public.guard_staff_date() TO service_role;


--
-- Name: FUNCTION guard_staff_work_assignment(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_staff_work_assignment() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_staff_work_assignment() TO anon;
GRANT ALL ON FUNCTION public.guard_staff_work_assignment() TO authenticated;
GRANT ALL ON FUNCTION public.guard_staff_work_assignment() TO service_role;


--
-- Name: FUNCTION guard_transfer_state(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_transfer_state() TO anon;
GRANT ALL ON FUNCTION public.guard_transfer_state() TO authenticated;
GRANT ALL ON FUNCTION public.guard_transfer_state() TO service_role;


--
-- Name: FUNCTION guard_voucher_batch(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_voucher_batch() TO anon;
GRANT ALL ON FUNCTION public.guard_voucher_batch() TO authenticated;
GRANT ALL ON FUNCTION public.guard_voucher_batch() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION has_screen_permission(p_screen text, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_screen_permission(p_screen text, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_screen_permission(p_screen text, p_action text) TO anon;
GRANT ALL ON FUNCTION public.has_screen_permission(p_screen text, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.has_screen_permission(p_screen text, p_action text) TO service_role;


--
-- Name: FUNCTION is_admin(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_exchange_staff(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_exchange_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_exchange_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_exchange_staff() TO service_role;


--
-- Name: FUNCTION is_platform_owner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_owner() TO authenticated;
GRANT ALL ON FUNCTION public.is_platform_owner() TO service_role;


--
-- Name: FUNCTION issue_activation_code(p_until timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.issue_activation_code(p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_activation_code(p_until timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.issue_activation_code(p_until timestamp with time zone) TO service_role;


--
-- Name: FUNCTION journal_voucher_to_entry(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.journal_voucher_to_entry() TO anon;
GRANT ALL ON FUNCTION public.journal_voucher_to_entry() TO authenticated;
GRANT ALL ON FUNCTION public.journal_voucher_to_entry() TO service_role;


--
-- Name: FUNCTION journal_vouchers_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.journal_vouchers_autonumber() TO anon;
GRANT ALL ON FUNCTION public.journal_vouchers_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.journal_vouchers_autonumber() TO service_role;


--
-- Name: FUNCTION license_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.license_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.license_status() TO authenticated;
GRANT ALL ON FUNCTION public.license_status() TO service_role;


--
-- Name: FUNCTION license_writes_allowed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.license_writes_allowed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.license_writes_allowed() TO authenticated;
GRANT ALL ON FUNCTION public.license_writes_allowed() TO service_role;


--
-- Name: FUNCTION lock_staff_session(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lock_staff_session() FROM PUBLIC;
GRANT ALL ON FUNCTION public.lock_staff_session() TO authenticated;
GRANT ALL ON FUNCTION public.lock_staff_session() TO service_role;


--
-- Name: FUNCTION log_activity_username(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_activity_username() TO anon;
GRANT ALL ON FUNCTION public.log_activity_username() TO authenticated;
GRANT ALL ON FUNCTION public.log_activity_username() TO service_role;


--
-- Name: FUNCTION loop_entries_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.loop_entries_autonumber() TO anon;
GRANT ALL ON FUNCTION public.loop_entries_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.loop_entries_autonumber() TO service_role;


--
-- Name: FUNCTION management_alerts(p_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.management_alerts(p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.management_alerts(p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.management_alerts(p_date date) TO service_role;


--
-- Name: FUNCTION next_account_number(p_father bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.next_account_number(p_father bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_account_number(p_father bigint) TO service_role;


--
-- Name: FUNCTION ops_to_box(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ops_to_box() TO anon;
GRANT ALL ON FUNCTION public.ops_to_box() TO authenticated;
GRANT ALL ON FUNCTION public.ops_to_box() TO service_role;


--
-- Name: FUNCTION party_autoaccount(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.party_autoaccount() TO anon;
GRANT ALL ON FUNCTION public.party_autoaccount() TO authenticated;
GRANT ALL ON FUNCTION public.party_autoaccount() TO service_role;


--
-- Name: FUNCTION party_drop_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.party_drop_account() TO anon;
GRANT ALL ON FUNCTION public.party_drop_account() TO authenticated;
GRANT ALL ON FUNCTION public.party_drop_account() TO service_role;


--
-- Name: FUNCTION party_sync_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.party_sync_account() TO anon;
GRANT ALL ON FUNCTION public.party_sync_account() TO authenticated;
GRANT ALL ON FUNCTION public.party_sync_account() TO service_role;


--
-- Name: FUNCTION post_box(p_box bigint, p_currency bigint, p_amount numeric, p_type text, p_notes text, p_src text, p_src_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.post_box(p_box bigint, p_currency bigint, p_amount numeric, p_type text, p_notes text, p_src text, p_src_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.post_box(p_box bigint, p_currency bigint, p_amount numeric, p_type text, p_notes text, p_src text, p_src_id bigint) TO service_role;


--
-- Name: FUNCTION record_currency_rate_history(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_currency_rate_history() TO anon;
GRANT ALL ON FUNCTION public.record_currency_rate_history() TO authenticated;
GRANT ALL ON FUNCTION public.record_currency_rate_history() TO service_role;


--
-- Name: FUNCTION reference_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reference_autonumber() TO anon;
GRANT ALL ON FUNCTION public.reference_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.reference_autonumber() TO service_role;


--
-- Name: FUNCTION require_staff_session(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_staff_session() FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_staff_session() TO authenticated;
GRANT ALL ON FUNCTION public.require_staff_session() TO service_role;


--
-- Name: FUNCTION revoke_activation_code(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_activation_code(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_activation_code(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_activation_code(p_id uuid) TO service_role;


--
-- Name: FUNCTION route_internal_transfer(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.route_internal_transfer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.route_internal_transfer() TO anon;
GRANT ALL ON FUNCTION public.route_internal_transfer() TO authenticated;
GRANT ALL ON FUNCTION public.route_internal_transfer() TO service_role;


--
-- Name: FUNCTION set_staff_session_pin(p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_staff_session_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_staff_session_pin(p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.set_staff_session_pin(p_pin text) TO service_role;


--
-- Name: FUNCTION setup_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.setup_autonumber() TO anon;
GRANT ALL ON FUNCTION public.setup_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.setup_autonumber() TO service_role;


--
-- Name: FUNCTION staff_active(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.staff_active() TO anon;
GRANT ALL ON FUNCTION public.staff_active() TO authenticated;
GRANT ALL ON FUNCTION public.staff_active() TO service_role;


--
-- Name: FUNCTION staff_can_read(p_screens text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.staff_can_read(p_screens text[]) TO anon;
GRANT ALL ON FUNCTION public.staff_can_read(p_screens text[]) TO authenticated;
GRANT ALL ON FUNCTION public.staff_can_read(p_screens text[]) TO service_role;


--
-- Name: FUNCTION staff_mfa_satisfied(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_mfa_satisfied() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_mfa_satisfied() TO authenticated;
GRANT ALL ON FUNCTION public.staff_mfa_satisfied() TO service_role;


--
-- Name: FUNCTION staff_session_identifier(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_session_identifier() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_session_identifier() TO authenticated;
GRANT ALL ON FUNCTION public.staff_session_identifier() TO service_role;


--
-- Name: FUNCTION staff_session_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_session_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_session_status() TO authenticated;
GRANT ALL ON FUNCTION public.staff_session_status() TO service_role;


--
-- Name: FUNCTION staff_session_unlocked(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_session_unlocked() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_session_unlocked() TO authenticated;
GRANT ALL ON FUNCTION public.staff_session_unlocked() TO service_role;


--
-- Name: FUNCTION staff_trade_allowed(p_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_trade_allowed(p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_trade_allowed(p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.staff_trade_allowed(p_kind text) TO service_role;


--
-- Name: FUNCTION touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_updated_at() TO service_role;


--
-- Name: FUNCTION transfer_autonumber(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.transfer_autonumber() TO anon;
GRANT ALL ON FUNCTION public.transfer_autonumber() TO authenticated;
GRANT ALL ON FUNCTION public.transfer_autonumber() TO service_role;


--
-- Name: FUNCTION transfer_to_customer(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.transfer_to_customer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.transfer_to_customer() TO anon;
GRANT ALL ON FUNCTION public.transfer_to_customer() TO authenticated;
GRANT ALL ON FUNCTION public.transfer_to_customer() TO service_role;


--
-- Name: FUNCTION unlock_staff_session(p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unlock_staff_session(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlock_staff_session(p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.unlock_staff_session(p_pin text) TO service_role;


--
-- Name: FUNCTION validate_exchange_payment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_exchange_payment() TO anon;
GRANT ALL ON FUNCTION public.validate_exchange_payment() TO authenticated;
GRANT ALL ON FUNCTION public.validate_exchange_payment() TO service_role;


--
-- Name: FUNCTION validate_staff_work_defaults(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_staff_work_defaults() TO anon;
GRANT ALL ON FUNCTION public.validate_staff_work_defaults() TO authenticated;
GRANT ALL ON FUNCTION public.validate_staff_work_defaults() TO service_role;


--
-- Name: FUNCTION validate_transfer_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_transfer_check() TO anon;
GRANT ALL ON FUNCTION public.validate_transfer_check() TO authenticated;
GRANT ALL ON FUNCTION public.validate_transfer_check() TO service_role;


--
-- Name: FUNCTION validate_transfer_payment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_transfer_payment() TO anon;
GRANT ALL ON FUNCTION public.validate_transfer_payment() TO authenticated;
GRANT ALL ON FUNCTION public.validate_transfer_payment() TO service_role;


--
-- Name: TABLE account_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_groups TO anon;
GRANT ALL ON TABLE public.account_groups TO authenticated;
GRANT ALL ON TABLE public.account_groups TO service_role;
GRANT SELECT,INSERT ON TABLE public.account_groups TO sandbox_exec;


--
-- Name: SEQUENCE account_groups_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.account_groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.account_groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.account_groups_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.account_groups_id_seq TO sandbox_exec;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounts TO anon;
GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;
GRANT SELECT,INSERT ON TABLE public.accounts TO sandbox_exec;


--
-- Name: SEQUENCE accounts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.accounts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.accounts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.accounts_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.accounts_id_seq TO sandbox_exec;


--
-- Name: TABLE activation_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activation_codes TO anon;
GRANT ALL ON TABLE public.activation_codes TO authenticated;
GRANT ALL ON TABLE public.activation_codes TO service_role;
GRANT SELECT,INSERT ON TABLE public.activation_codes TO sandbox_exec;


--
-- Name: TABLE activity_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_log TO anon;
GRANT ALL ON TABLE public.activity_log TO authenticated;
GRANT ALL ON TABLE public.activity_log TO service_role;
GRANT SELECT,INSERT ON TABLE public.activity_log TO sandbox_exec;


--
-- Name: SEQUENCE activity_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.activity_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.activity_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.activity_log_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.activity_log_id_seq TO sandbox_exec;


--
-- Name: TABLE admin_setup_claim; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_setup_claim TO anon;
GRANT ALL ON TABLE public.admin_setup_claim TO authenticated;
GRANT ALL ON TABLE public.admin_setup_claim TO service_role;
GRANT SELECT,INSERT ON TABLE public.admin_setup_claim TO sandbox_exec;


--
-- Name: TABLE agent_settlements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_settlements TO anon;
GRANT ALL ON TABLE public.agent_settlements TO authenticated;
GRANT ALL ON TABLE public.agent_settlements TO service_role;
GRANT SELECT,INSERT ON TABLE public.agent_settlements TO sandbox_exec;


--
-- Name: SEQUENCE agent_settlements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.agent_settlements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.agent_settlements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.agent_settlements_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.agent_settlements_id_seq TO sandbox_exec;


--
-- Name: TABLE agents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agents TO anon;
GRANT ALL ON TABLE public.agents TO authenticated;
GRANT ALL ON TABLE public.agents TO service_role;
GRANT SELECT,INSERT ON TABLE public.agents TO sandbox_exec;


--
-- Name: SEQUENCE agents_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.agents_id_seq TO anon;
GRANT ALL ON SEQUENCE public.agents_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.agents_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.agents_id_seq TO sandbox_exec;


--
-- Name: TABLE areas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.areas TO anon;
GRANT ALL ON TABLE public.areas TO authenticated;
GRANT ALL ON TABLE public.areas TO service_role;
GRANT SELECT,INSERT ON TABLE public.areas TO sandbox_exec;


--
-- Name: SEQUENCE areas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.areas_id_seq TO anon;
GRANT ALL ON SEQUENCE public.areas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.areas_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.areas_id_seq TO sandbox_exec;


--
-- Name: TABLE auto_reply_commands; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auto_reply_commands TO anon;
GRANT ALL ON TABLE public.auto_reply_commands TO authenticated;
GRANT ALL ON TABLE public.auto_reply_commands TO service_role;
GRANT SELECT,INSERT ON TABLE public.auto_reply_commands TO sandbox_exec;


--
-- Name: TABLE auto_reply_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auto_reply_settings TO anon;
GRANT ALL ON TABLE public.auto_reply_settings TO authenticated;
GRANT ALL ON TABLE public.auto_reply_settings TO service_role;
GRANT SELECT,INSERT ON TABLE public.auto_reply_settings TO sandbox_exec;


--
-- Name: TABLE bank_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_accounts TO anon;
GRANT ALL ON TABLE public.bank_accounts TO authenticated;
GRANT ALL ON TABLE public.bank_accounts TO service_role;
GRANT SELECT,INSERT ON TABLE public.bank_accounts TO sandbox_exec;


--
-- Name: SEQUENCE bank_accounts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.bank_accounts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bank_accounts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bank_accounts_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.bank_accounts_id_seq TO sandbox_exec;


--
-- Name: TABLE banks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.banks TO anon;
GRANT ALL ON TABLE public.banks TO authenticated;
GRANT ALL ON TABLE public.banks TO service_role;
GRANT SELECT,INSERT ON TABLE public.banks TO sandbox_exec;


--
-- Name: SEQUENCE banks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.banks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.banks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.banks_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.banks_id_seq TO sandbox_exec;


--
-- Name: TABLE blacklist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blacklist TO anon;
GRANT ALL ON TABLE public.blacklist TO authenticated;
GRANT ALL ON TABLE public.blacklist TO service_role;
GRANT SELECT,INSERT ON TABLE public.blacklist TO sandbox_exec;


--
-- Name: SEQUENCE blacklist_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.blacklist_id_seq TO anon;
GRANT ALL ON SEQUENCE public.blacklist_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.blacklist_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.blacklist_id_seq TO sandbox_exec;


--
-- Name: TABLE box_closings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.box_closings TO anon;
GRANT ALL ON TABLE public.box_closings TO authenticated;
GRANT ALL ON TABLE public.box_closings TO service_role;
GRANT SELECT,INSERT ON TABLE public.box_closings TO sandbox_exec;


--
-- Name: SEQUENCE box_closings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.box_closings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.box_closings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.box_closings_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.box_closings_id_seq TO sandbox_exec;


--
-- Name: TABLE box_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.box_movements TO anon;
GRANT ALL ON TABLE public.box_movements TO authenticated;
GRANT ALL ON TABLE public.box_movements TO service_role;
GRANT SELECT,INSERT ON TABLE public.box_movements TO sandbox_exec;


--
-- Name: SEQUENCE box_movements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.box_movements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.box_movements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.box_movements_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.box_movements_id_seq TO sandbox_exec;


--
-- Name: TABLE boxes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boxes TO anon;
GRANT ALL ON TABLE public.boxes TO authenticated;
GRANT ALL ON TABLE public.boxes TO service_role;
GRANT SELECT,INSERT ON TABLE public.boxes TO sandbox_exec;


--
-- Name: SEQUENCE boxes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.boxes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.boxes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.boxes_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.boxes_id_seq TO sandbox_exec;


--
-- Name: TABLE branches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branches TO anon;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO service_role;
GRANT SELECT,INSERT ON TABLE public.branches TO sandbox_exec;


--
-- Name: SEQUENCE branches_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.branches_id_seq TO anon;
GRANT ALL ON SEQUENCE public.branches_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.branches_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.branches_id_seq TO sandbox_exec;


--
-- Name: TABLE buy_currencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.buy_currencies TO anon;
GRANT ALL ON TABLE public.buy_currencies TO authenticated;
GRANT ALL ON TABLE public.buy_currencies TO service_role;
GRANT SELECT,INSERT ON TABLE public.buy_currencies TO sandbox_exec;


--
-- Name: SEQUENCE buy_currencies_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.buy_currencies_id_seq TO anon;
GRANT ALL ON SEQUENCE public.buy_currencies_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.buy_currencies_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.buy_currencies_id_seq TO sandbox_exec;


--
-- Name: TABLE cash_vouchers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cash_vouchers TO anon;
GRANT ALL ON TABLE public.cash_vouchers TO authenticated;
GRANT ALL ON TABLE public.cash_vouchers TO service_role;
GRANT SELECT,INSERT ON TABLE public.cash_vouchers TO sandbox_exec;


--
-- Name: SEQUENCE cash_vouchers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.cash_vouchers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cash_vouchers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cash_vouchers_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.cash_vouchers_id_seq TO sandbox_exec;


--
-- Name: TABLE check_books; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.check_books TO anon;
GRANT ALL ON TABLE public.check_books TO authenticated;
GRANT ALL ON TABLE public.check_books TO service_role;
GRANT SELECT,INSERT ON TABLE public.check_books TO sandbox_exec;


--
-- Name: SEQUENCE check_books_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.check_books_id_seq TO anon;
GRANT ALL ON SEQUENCE public.check_books_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.check_books_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.check_books_id_seq TO sandbox_exec;


--
-- Name: TABLE checks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checks TO anon;
GRANT ALL ON TABLE public.checks TO authenticated;
GRANT ALL ON TABLE public.checks TO service_role;
GRANT SELECT,INSERT ON TABLE public.checks TO sandbox_exec;


--
-- Name: SEQUENCE checks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.checks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.checks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.checks_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.checks_id_seq TO sandbox_exec;


--
-- Name: TABLE classifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.classifications TO anon;
GRANT ALL ON TABLE public.classifications TO authenticated;
GRANT ALL ON TABLE public.classifications TO service_role;
GRANT SELECT,INSERT ON TABLE public.classifications TO sandbox_exec;


--
-- Name: SEQUENCE classifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.classifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.classifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.classifications_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.classifications_id_seq TO sandbox_exec;


--
-- Name: TABLE commission_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.commission_rules TO anon;
GRANT ALL ON TABLE public.commission_rules TO authenticated;
GRANT ALL ON TABLE public.commission_rules TO service_role;
GRANT SELECT,INSERT ON TABLE public.commission_rules TO sandbox_exec;


--
-- Name: SEQUENCE commission_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.commission_rules_id_seq TO anon;
GRANT ALL ON SEQUENCE public.commission_rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.commission_rules_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.commission_rules_id_seq TO sandbox_exec;


--
-- Name: TABLE cost_centers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cost_centers TO anon;
GRANT ALL ON TABLE public.cost_centers TO authenticated;
GRANT ALL ON TABLE public.cost_centers TO service_role;
GRANT SELECT,INSERT ON TABLE public.cost_centers TO sandbox_exec;


--
-- Name: SEQUENCE cost_centers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.cost_centers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cost_centers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cost_centers_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.cost_centers_id_seq TO sandbox_exec;


--
-- Name: TABLE countries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.countries TO anon;
GRANT ALL ON TABLE public.countries TO authenticated;
GRANT ALL ON TABLE public.countries TO service_role;
GRANT SELECT,INSERT ON TABLE public.countries TO sandbox_exec;


--
-- Name: SEQUENCE countries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.countries_id_seq TO anon;
GRANT ALL ON SEQUENCE public.countries_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.countries_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.countries_id_seq TO sandbox_exec;


--
-- Name: TABLE currencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.currencies TO anon;
GRANT ALL ON TABLE public.currencies TO authenticated;
GRANT ALL ON TABLE public.currencies TO service_role;
GRANT SELECT,INSERT ON TABLE public.currencies TO sandbox_exec;


--
-- Name: SEQUENCE currencies_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.currencies_id_seq TO anon;
GRANT ALL ON SEQUENCE public.currencies_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.currencies_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.currencies_id_seq TO sandbox_exec;


--
-- Name: TABLE currency_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.currency_prices TO anon;
GRANT ALL ON TABLE public.currency_prices TO authenticated;
GRANT ALL ON TABLE public.currency_prices TO service_role;
GRANT SELECT,INSERT ON TABLE public.currency_prices TO sandbox_exec;


--
-- Name: SEQUENCE currency_prices_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.currency_prices_id_seq TO anon;
GRANT ALL ON SEQUENCE public.currency_prices_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.currency_prices_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.currency_prices_id_seq TO sandbox_exec;


--
-- Name: TABLE currency_rate_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.currency_rate_history TO anon;
GRANT ALL ON TABLE public.currency_rate_history TO authenticated;
GRANT ALL ON TABLE public.currency_rate_history TO service_role;
GRANT SELECT,INSERT ON TABLE public.currency_rate_history TO sandbox_exec;


--
-- Name: SEQUENCE currency_rate_history_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.currency_rate_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.currency_rate_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.currency_rate_history_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.currency_rate_history_id_seq TO sandbox_exec;


--
-- Name: TABLE customer_transfer_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_transfer_movements TO anon;
GRANT ALL ON TABLE public.customer_transfer_movements TO authenticated;
GRANT ALL ON TABLE public.customer_transfer_movements TO service_role;
GRANT SELECT,INSERT ON TABLE public.customer_transfer_movements TO sandbox_exec;


--
-- Name: SEQUENCE customer_transfer_movements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.customer_transfer_movements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.customer_transfer_movements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.customer_transfer_movements_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.customer_transfer_movements_id_seq TO sandbox_exec;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;
GRANT SELECT,INSERT ON TABLE public.customers TO sandbox_exec;


--
-- Name: SEQUENCE customers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.customers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.customers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.customers_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.customers_id_seq TO sandbox_exec;


--
-- Name: TABLE document_counters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.document_counters TO anon;
GRANT ALL ON TABLE public.document_counters TO authenticated;
GRANT ALL ON TABLE public.document_counters TO service_role;
GRANT SELECT,INSERT ON TABLE public.document_counters TO sandbox_exec;


--
-- Name: TABLE document_number_registry; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.document_number_registry TO anon;
GRANT ALL ON TABLE public.document_number_registry TO authenticated;
GRANT ALL ON TABLE public.document_number_registry TO service_role;
GRANT SELECT,INSERT ON TABLE public.document_number_registry TO sandbox_exec;


--
-- Name: TABLE entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entries TO anon;
GRANT ALL ON TABLE public.entries TO authenticated;
GRANT ALL ON TABLE public.entries TO service_role;
GRANT SELECT,INSERT ON TABLE public.entries TO sandbox_exec;


--
-- Name: TABLE entries_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entries_details TO anon;
GRANT ALL ON TABLE public.entries_details TO authenticated;
GRANT ALL ON TABLE public.entries_details TO service_role;
GRANT SELECT,INSERT ON TABLE public.entries_details TO sandbox_exec;


--
-- Name: SEQUENCE entries_details_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.entries_details_id_seq TO anon;
GRANT ALL ON SEQUENCE public.entries_details_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.entries_details_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.entries_details_id_seq TO sandbox_exec;


--
-- Name: SEQUENCE entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.entries_id_seq TO anon;
GRANT ALL ON SEQUENCE public.entries_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.entries_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.entries_id_seq TO sandbox_exec;


--
-- Name: TABLE financial_years; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financial_years TO anon;
GRANT ALL ON TABLE public.financial_years TO authenticated;
GRANT ALL ON TABLE public.financial_years TO service_role;
GRANT SELECT,INSERT ON TABLE public.financial_years TO sandbox_exec;


--
-- Name: SEQUENCE financial_years_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.financial_years_id_seq TO anon;
GRANT ALL ON SEQUENCE public.financial_years_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.financial_years_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.financial_years_id_seq TO sandbox_exec;


--
-- Name: TABLE forbidden_texts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forbidden_texts TO anon;
GRANT ALL ON TABLE public.forbidden_texts TO authenticated;
GRANT ALL ON TABLE public.forbidden_texts TO service_role;
GRANT SELECT,INSERT ON TABLE public.forbidden_texts TO sandbox_exec;


--
-- Name: SEQUENCE forbidden_texts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.forbidden_texts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.forbidden_texts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.forbidden_texts_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.forbidden_texts_id_seq TO sandbox_exec;


--
-- Name: TABLE funds_inventory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.funds_inventory TO anon;
GRANT ALL ON TABLE public.funds_inventory TO authenticated;
GRANT ALL ON TABLE public.funds_inventory TO service_role;
GRANT SELECT,INSERT ON TABLE public.funds_inventory TO sandbox_exec;


--
-- Name: TABLE funds_inventory_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.funds_inventory_details TO anon;
GRANT ALL ON TABLE public.funds_inventory_details TO authenticated;
GRANT ALL ON TABLE public.funds_inventory_details TO service_role;
GRANT SELECT,INSERT ON TABLE public.funds_inventory_details TO sandbox_exec;


--
-- Name: SEQUENCE funds_inventory_details_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.funds_inventory_details_id_seq TO anon;
GRANT ALL ON SEQUENCE public.funds_inventory_details_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.funds_inventory_details_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.funds_inventory_details_id_seq TO sandbox_exec;


--
-- Name: SEQUENCE funds_inventory_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.funds_inventory_id_seq TO anon;
GRANT ALL ON SEQUENCE public.funds_inventory_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.funds_inventory_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.funds_inventory_id_seq TO sandbox_exec;


--
-- Name: TABLE governorates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.governorates TO anon;
GRANT ALL ON TABLE public.governorates TO authenticated;
GRANT ALL ON TABLE public.governorates TO service_role;
GRANT SELECT,INSERT ON TABLE public.governorates TO sandbox_exec;


--
-- Name: SEQUENCE governorates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.governorates_id_seq TO anon;
GRANT ALL ON SEQUENCE public.governorates_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.governorates_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.governorates_id_seq TO sandbox_exec;


--
-- Name: TABLE group_screen_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_screen_permissions TO anon;
GRANT ALL ON TABLE public.group_screen_permissions TO authenticated;
GRANT ALL ON TABLE public.group_screen_permissions TO service_role;
GRANT SELECT,INSERT ON TABLE public.group_screen_permissions TO sandbox_exec;


--
-- Name: SEQUENCE group_screen_permissions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.group_screen_permissions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.group_screen_permissions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.group_screen_permissions_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.group_screen_permissions_id_seq TO sandbox_exec;


--
-- Name: TABLE incoming_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incoming_transfers TO anon;
GRANT ALL ON TABLE public.incoming_transfers TO authenticated;
GRANT ALL ON TABLE public.incoming_transfers TO service_role;
GRANT SELECT,INSERT ON TABLE public.incoming_transfers TO sandbox_exec;


--
-- Name: SEQUENCE incoming_transfers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.incoming_transfers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.incoming_transfers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.incoming_transfers_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.incoming_transfers_id_seq TO sandbox_exec;


--
-- Name: TABLE installation_license; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.installation_license TO anon;
GRANT ALL ON TABLE public.installation_license TO authenticated;
GRANT ALL ON TABLE public.installation_license TO service_role;
GRANT SELECT,INSERT ON TABLE public.installation_license TO sandbox_exec;


--
-- Name: TABLE journal_vouchers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_vouchers TO anon;
GRANT ALL ON TABLE public.journal_vouchers TO authenticated;
GRANT ALL ON TABLE public.journal_vouchers TO service_role;
GRANT SELECT,INSERT ON TABLE public.journal_vouchers TO sandbox_exec;


--
-- Name: SEQUENCE journal_vouchers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.journal_vouchers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.journal_vouchers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.journal_vouchers_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.journal_vouchers_id_seq TO sandbox_exec;


--
-- Name: TABLE loop_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.loop_entries TO anon;
GRANT ALL ON TABLE public.loop_entries TO authenticated;
GRANT ALL ON TABLE public.loop_entries TO service_role;
GRANT SELECT,INSERT ON TABLE public.loop_entries TO sandbox_exec;


--
-- Name: TABLE loop_entries_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.loop_entries_details TO anon;
GRANT ALL ON TABLE public.loop_entries_details TO authenticated;
GRANT ALL ON TABLE public.loop_entries_details TO service_role;
GRANT SELECT,INSERT ON TABLE public.loop_entries_details TO sandbox_exec;


--
-- Name: SEQUENCE loop_entries_details_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.loop_entries_details_id_seq TO anon;
GRANT ALL ON SEQUENCE public.loop_entries_details_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.loop_entries_details_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.loop_entries_details_id_seq TO sandbox_exec;


--
-- Name: SEQUENCE loop_entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.loop_entries_id_seq TO anon;
GRANT ALL ON SEQUENCE public.loop_entries_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.loop_entries_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.loop_entries_id_seq TO sandbox_exec;


--
-- Name: TABLE loop_entries_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.loop_entries_runs TO anon;
GRANT ALL ON TABLE public.loop_entries_runs TO authenticated;
GRANT ALL ON TABLE public.loop_entries_runs TO service_role;
GRANT SELECT,INSERT ON TABLE public.loop_entries_runs TO sandbox_exec;


--
-- Name: SEQUENCE loop_entries_runs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.loop_entries_runs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.loop_entries_runs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.loop_entries_runs_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.loop_entries_runs_id_seq TO sandbox_exec;


--
-- Name: TABLE outgoing_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.outgoing_transfers TO anon;
GRANT ALL ON TABLE public.outgoing_transfers TO authenticated;
GRANT ALL ON TABLE public.outgoing_transfers TO service_role;
GRANT SELECT,INSERT ON TABLE public.outgoing_transfers TO sandbox_exec;


--
-- Name: SEQUENCE outgoing_transfers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.outgoing_transfers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.outgoing_transfers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.outgoing_transfers_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.outgoing_transfers_id_seq TO sandbox_exec;


--
-- Name: TABLE period_closings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.period_closings TO anon;
GRANT ALL ON TABLE public.period_closings TO authenticated;
GRANT ALL ON TABLE public.period_closings TO service_role;
GRANT SELECT,INSERT ON TABLE public.period_closings TO sandbox_exec;


--
-- Name: SEQUENCE period_closings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.period_closings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.period_closings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.period_closings_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.period_closings_id_seq TO sandbox_exec;


--
-- Name: TABLE platform_owners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_owners TO anon;
GRANT ALL ON TABLE public.platform_owners TO authenticated;
GRANT ALL ON TABLE public.platform_owners TO service_role;
GRANT SELECT,INSERT ON TABLE public.platform_owners TO sandbox_exec;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT,INSERT ON TABLE public.profiles TO sandbox_exec;


--
-- Name: TABLE profiles_probe_x; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles_probe_x TO anon;
GRANT ALL ON TABLE public.profiles_probe_x TO authenticated;
GRANT ALL ON TABLE public.profiles_probe_x TO service_role;
GRANT SELECT,INSERT ON TABLE public.profiles_probe_x TO sandbox_exec;


--
-- Name: TABLE receiver_cards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.receiver_cards TO anon;
GRANT ALL ON TABLE public.receiver_cards TO authenticated;
GRANT ALL ON TABLE public.receiver_cards TO service_role;
GRANT SELECT,INSERT ON TABLE public.receiver_cards TO sandbox_exec;


--
-- Name: SEQUENCE receiver_cards_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.receiver_cards_id_seq TO anon;
GRANT ALL ON SEQUENCE public.receiver_cards_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.receiver_cards_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.receiver_cards_id_seq TO sandbox_exec;


--
-- Name: TABLE sell_currencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sell_currencies TO anon;
GRANT ALL ON TABLE public.sell_currencies TO authenticated;
GRANT ALL ON TABLE public.sell_currencies TO service_role;
GRANT SELECT,INSERT ON TABLE public.sell_currencies TO sandbox_exec;


--
-- Name: SEQUENCE sell_currencies_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sell_currencies_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sell_currencies_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sell_currencies_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.sell_currencies_id_seq TO sandbox_exec;


--
-- Name: TABLE staff_announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_announcements TO anon;
GRANT ALL ON TABLE public.staff_announcements TO authenticated;
GRANT ALL ON TABLE public.staff_announcements TO service_role;
GRANT SELECT,INSERT ON TABLE public.staff_announcements TO sandbox_exec;


--
-- Name: TABLE staff_session_locks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_session_locks TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.staff_session_locks TO authenticated;
GRANT ALL ON TABLE public.staff_session_locks TO service_role;
GRANT SELECT,INSERT ON TABLE public.staff_session_locks TO sandbox_exec;


--
-- Name: TABLE staff_work_defaults; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_work_defaults TO anon;
GRANT ALL ON TABLE public.staff_work_defaults TO authenticated;
GRANT ALL ON TABLE public.staff_work_defaults TO service_role;
GRANT SELECT,INSERT ON TABLE public.staff_work_defaults TO sandbox_exec;


--
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;
GRANT SELECT,INSERT ON TABLE public.system_settings TO sandbox_exec;


--
-- Name: SEQUENCE system_settings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.system_settings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.system_settings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.system_settings_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.system_settings_id_seq TO sandbox_exec;


--
-- Name: TABLE transfer_entities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transfer_entities TO anon;
GRANT ALL ON TABLE public.transfer_entities TO authenticated;
GRANT ALL ON TABLE public.transfer_entities TO service_role;
GRANT SELECT,INSERT ON TABLE public.transfer_entities TO sandbox_exec;


--
-- Name: SEQUENCE transfer_entities_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.transfer_entities_id_seq TO anon;
GRANT ALL ON SEQUENCE public.transfer_entities_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transfer_entities_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.transfer_entities_id_seq TO sandbox_exec;


--
-- Name: TABLE transfer_purposes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transfer_purposes TO anon;
GRANT ALL ON TABLE public.transfer_purposes TO authenticated;
GRANT ALL ON TABLE public.transfer_purposes TO service_role;
GRANT SELECT,INSERT ON TABLE public.transfer_purposes TO sandbox_exec;


--
-- Name: SEQUENCE transfer_purposes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.transfer_purposes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.transfer_purposes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transfer_purposes_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.transfer_purposes_id_seq TO sandbox_exec;


--
-- Name: TABLE transfer_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transfer_requests TO anon;
GRANT ALL ON TABLE public.transfer_requests TO authenticated;
GRANT ALL ON TABLE public.transfer_requests TO service_role;
GRANT SELECT,INSERT ON TABLE public.transfer_requests TO sandbox_exec;


--
-- Name: SEQUENCE transfer_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.transfer_requests_id_seq TO anon;
GRANT ALL ON SEQUENCE public.transfer_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transfer_requests_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.transfer_requests_id_seq TO sandbox_exec;


--
-- Name: TABLE user_group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_group_members TO anon;
GRANT ALL ON TABLE public.user_group_members TO authenticated;
GRANT ALL ON TABLE public.user_group_members TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_group_members TO sandbox_exec;


--
-- Name: SEQUENCE user_group_members_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_group_members_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_group_members_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_group_members_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.user_group_members_id_seq TO sandbox_exec;


--
-- Name: TABLE user_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_groups TO anon;
GRANT ALL ON TABLE public.user_groups TO authenticated;
GRANT ALL ON TABLE public.user_groups TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_groups TO sandbox_exec;


--
-- Name: SEQUENCE user_groups_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_groups_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.user_groups_id_seq TO sandbox_exec;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_roles TO sandbox_exec;


--
-- Name: TABLE user_screen_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_screen_permissions TO anon;
GRANT ALL ON TABLE public.user_screen_permissions TO authenticated;
GRANT ALL ON TABLE public.user_screen_permissions TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_screen_permissions TO sandbox_exec;


--
-- Name: SEQUENCE user_screen_permissions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_screen_permissions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_screen_permissions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_screen_permissions_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.user_screen_permissions_id_seq TO sandbox_exec;


--
-- Name: TABLE withdrawal_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.withdrawal_requests TO anon;
GRANT ALL ON TABLE public.withdrawal_requests TO authenticated;
GRANT ALL ON TABLE public.withdrawal_requests TO service_role;
GRANT SELECT,INSERT ON TABLE public.withdrawal_requests TO sandbox_exec;


--
-- Name: SEQUENCE withdrawal_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.withdrawal_requests_id_seq TO anon;
GRANT ALL ON SEQUENCE public.withdrawal_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.withdrawal_requests_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.withdrawal_requests_id_seq TO sandbox_exec;


--
-- Name: TABLE zz_probe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zz_probe TO service_role;
GRANT SELECT,INSERT ON TABLE public.zz_probe TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
