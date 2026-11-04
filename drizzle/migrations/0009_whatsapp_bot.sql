CREATE TABLE public.wa_contacts (
  id bigserial PRIMARY KEY,
  phone text NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{8,15}$'),
  role text NOT NULL CHECK (role IN ('exchanger','customer','owner')),
  customer_id bigint REFERENCES public.customers(id) ON DELETE SET NULL,
  agent_id bigint REFERENCES public.agents(id) ON DELETE SET NULL,
  display_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_webhook_events (
  id bigserial PRIMARY KEY,
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_webhook_events_pending ON public.whatsapp_webhook_events (next_attempt_at) WHERE processed_at IS NULL;

CREATE TABLE public.wa_messages (
  id bigserial PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  wa_message_id text UNIQUE,
  phone text NOT NULL,
  contact_id bigint REFERENCES public.wa_contacts(id) ON DELETE SET NULL,
  msg_type text NOT NULL DEFAULT 'text',
  body text NOT NULL DEFAULT '',
  media_id text,
  reply_key text UNIQUE,
  send_state text,
  send_error text,
  provider_ts timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_messages_created ON public.wa_messages (created_at DESC);

CREATE TABLE public.wa_message_statuses (
  id bigserial PRIMARY KEY,
  wa_message_id text NOT NULL,
  status text NOT NULL,
  provider_ts timestamptz,
  errors jsonb,
  recipient text,
  UNIQUE (wa_message_id, status)
);

CREATE TABLE public.wa_items (
  id bigserial PRIMARY KEY,
  inbound_message_id text NOT NULL UNIQUE,
  contact_id bigint REFERENCES public.wa_contacts(id) ON DELETE SET NULL,
  source_role text NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  transfer_number text,
  amount numeric,
  currency text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','duplicate')),
  duplicate_note text,
  commission numeric,
  decided_by uuid,
  decided_via text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_items_pending ON public.wa_items (created_at DESC) WHERE status = 'pending';
CREATE INDEX wa_items_ref ON public.wa_items (transfer_number) WHERE transfer_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_contacts TO authenticated;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT SELECT ON public.wa_messages TO authenticated;
GRANT SELECT ON public.wa_message_statuses TO authenticated;
GRANT SELECT, UPDATE ON public.wa_items TO authenticated;
GRANT ALL ON public.wa_contacts, public.whatsapp_webhook_events, public.wa_messages, public.wa_message_statuses, public.wa_items TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SEQUENCE public.wa_contacts_id_seq TO authenticated;

ALTER TABLE public.wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_message_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_bot_manager_read ON public.wa_contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY wa_bot_admin_insert ON public.wa_contacts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY wa_bot_admin_update ON public.wa_contacts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY wa_bot_admin_delete ON public.wa_contacts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY wa_bot_admin_read ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY wa_bot_manager_read ON public.wa_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY wa_bot_manager_read ON public.wa_message_statuses FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY wa_bot_manager_read ON public.wa_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY wa_bot_manager_decide ON public.wa_items FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND status = 'pending')
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND status IN ('approved','rejected') AND decided_by = auth.uid());

CREATE POLICY session_security ON public.wa_contacts AS RESTRICTIVE FOR ALL TO authenticated USING (public.staff_session_unlocked() AND public.staff_mfa_satisfied()) WITH CHECK (public.staff_session_unlocked() AND public.staff_mfa_satisfied());
CREATE POLICY session_security ON public.wa_items AS RESTRICTIVE FOR ALL TO authenticated USING (public.staff_session_unlocked() AND public.staff_mfa_satisfied()) WITH CHECK (public.staff_session_unlocked() AND public.staff_mfa_satisfied());
CREATE POLICY session_security ON public.wa_messages AS RESTRICTIVE FOR ALL TO authenticated USING (public.staff_session_unlocked() AND public.staff_mfa_satisfied());

-- Only decision fields may change on a staff update
CREATE OR REPLACE FUNCTION public.guard_wa_item_decision() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF NEW.inbound_message_id IS DISTINCT FROM OLD.inbound_message_id OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.data IS DISTINCT FROM OLD.data OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.transfer_number IS DISTINCT FROM OLD.transfer_number THEN
      RAISE EXCEPTION 'لا يمكن تعديل بيانات الطلب، فقط القرار والعمولة';
    END IF;
    NEW.decided_at := now();
    NEW.decided_via := 'app';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wa_items_guard BEFORE UPDATE ON public.wa_items FOR EACH ROW EXECUTE FUNCTION public.guard_wa_item_decision();