CREATE TABLE IF NOT EXISTS public.imported_password_setup (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.imported_password_setup TO service_role;
ALTER TABLE public.imported_password_setup ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.imported_password_setup IS 'Imported staff accounts that must choose a new password on first sign-in; server-only.';
INSERT INTO public.imported_password_setup (user_id)
SELECT DISTINCT ur.user_id
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'admin' AND coalesce(u.encrypted_password, '') = ''
ON CONFLICT DO NOTHING;