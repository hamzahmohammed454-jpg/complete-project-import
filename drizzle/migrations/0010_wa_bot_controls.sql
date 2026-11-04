CREATE TABLE public.wa_bot_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  exchangers_enabled boolean NOT NULL DEFAULT true,
  customers_enabled boolean NOT NULL DEFAULT true,
  owners_enabled boolean NOT NULL DEFAULT true,
  read_images boolean NOT NULL DEFAULT true,
  reply_unregistered boolean NOT NULL DEFAULT true,
  auto_ack boolean NOT NULL DEFAULT true,
  customer_kinds text[] NOT NULL DEFAULT ARRAY['deposit','withdrawal','transfer','balance_inquiry'],
  unregistered_text text NOT NULL DEFAULT 'رقمكم غير مسجل لدى ابو طه للصرافة. يرجى التواصل مع المكتب لتفعيل الخدمة.',
  paused_text text NOT NULL DEFAULT 'الخدمة متوقفة مؤقتًا، يرجى التواصل مع المكتب.',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.wa_bot_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.wa_contacts ADD COLUMN notify_kinds text[] NOT NULL DEFAULT ARRAY['transfer_notice','deposit','withdrawal','transfer','balance_inquiry'];
COMMENT ON COLUMN public.wa_contacts.notify_kinds IS 'Owner routing: request kinds this owner number receives for approval';

GRANT SELECT, UPDATE ON public.wa_bot_settings TO authenticated;
GRANT ALL ON public.wa_bot_settings TO service_role;
ALTER TABLE public.wa_bot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_bot_manager_read ON public.wa_bot_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY wa_bot_admin_update ON public.wa_bot_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY session_security ON public.wa_bot_settings AS RESTRICTIVE FOR ALL TO authenticated USING (public.staff_session_unlocked() AND public.staff_mfa_satisfied()) WITH CHECK (public.staff_session_unlocked() AND public.staff_mfa_satisfied());