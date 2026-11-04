CREATE SCHEMA IF NOT EXISTS extensions;
--@@
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
--@@
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
--@@
CREATE SCHEMA IF NOT EXISTS auth;
--@@
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_sign_in_at timestamptz
);
--@@
CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, factor_type text, status text);
--@@
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
--@@
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
--@@
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('sub', auth.uid(), 'role', 'authenticated', 'aal', 'aal1',
    'session_id', coalesce(nullif(current_setting('request.jwt.claim.session_id', true), ''), '00000000-0000-4000-8000-000000000001'))
$$;
--@@
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--@@
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--@@
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--@@
CREATE TABLE IF NOT EXISTS public.local_meta (key text PRIMARY KEY, value jsonb NOT NULL);
--@@
CREATE TABLE IF NOT EXISTS public.local_files (bucket text NOT NULL, path text NOT NULL, content_type text NOT NULL DEFAULT 'application/octet-stream', content bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (bucket, path));
