-- ============================================================
-- Migration: Keep profiles.id aligned with auth.users.id at signup
-- Date: June 18, 2026
-- ============================================================
-- Context:
--   A staff member (ahood@summitlc.org) could authenticate but never load a
--   profile: their `profiles.id` did not equal their `auth.users.id`. RLS
--   scopes `profiles` to `id = auth.uid()`, so the by-id lookup missed AND the
--   app's by-email self-heal was hidden by RLS — the user could not read their
--   own row to repair it. This happens when a profile row is pre-created (staff
--   invite / student import) under a generated UUID, or when an auth user is
--   deleted and recreated with a new UUID while the old profile row lingers.
--
-- What this trigger does (AFTER INSERT on auth.users):
--   1. If a profile already exists with id = new auth uid → do nothing
--      (normal signup, or another trigger already created it).
--   2. Else, if a profile exists matching the new user's email (any case) under
--      a different id → repoint that row's id to the auth uid, so RLS lets the
--      user read their own row.
--   3. Else → insert a minimal profile keyed on the auth uid.
--
-- Safety:
--   - SECURITY DEFINER so it can write `public.profiles` from the auth context.
--   - Wrapped in an exception handler that only RAISEs a WARNING, so a failure
--     here can NEVER block auth-user creation (i.e. can never break signups).
--   - Idempotent and safe to run alongside an existing handle_new_user trigger:
--     if that trigger creates the row first, step 1 short-circuits.
--
-- OPTIONAL PRE-CHECK (run first to see any existing auth triggers):
--   select tgname, proname
--   from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--   where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_profile_id_on_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
BEGIN
  -- 1. Already aligned? Nothing to do.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- 2. Pre-created under a different id (matched by email, case-insensitive)?
  SELECT id INTO v_match_id
  FROM public.profiles
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF v_match_id IS NOT NULL THEN
    UPDATE public.profiles SET id = NEW.id WHERE id = v_match_id;
  ELSE
    -- 3. No profile at all yet — create a minimal one.
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth-user creation if profile sync fails.
  RAISE WARNING 'sync_profile_id_on_auth_user failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_sync_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_id_on_auth_user();

COMMIT;

-- ============================================================
-- Rollback (run only if needed)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS on_auth_user_created_sync_profile ON auth.users;
-- DROP FUNCTION IF EXISTS public.sync_profile_id_on_auth_user();
-- COMMIT;
