CREATE OR REPLACE FUNCTION public.save_funds_inventory(p_id bigint,p_box bigint,p_date date,p_notes text,p_lines jsonb) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END $$;