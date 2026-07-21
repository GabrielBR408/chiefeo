-- 004 — public.profiles + referral tracking (auth layer, Phase 1)
--
-- (Numbered 004: 003 was `003-task-type.sql`, applied to production 2026-05-01
--  per CHANGELOG though never checked in as a file — its number stays reserved.)
--
-- WHAT
--   Adds `public.profiles`, one row per auth.users account, keyed on `user_id`
--   (same convention as tasks/priorities/audit_log). Holds the referral graph:
--     referral_code    — unique, shareable (chiefeotool.com/?ref=CODE)
--     referred_by      — who referred this user (nullable self-FK)
--     referral_count   — how many *confirmed* signups this user has referred
--     free_until       — reward window unlocked at the 3-referral threshold
--     deleted_at       — soft delete (row is kept for the referral graph)
--
--   Plus the machinery that keeps it consistent, entirely in the database so
--   it can't be bypassed or raced from the client:
--     handle_new_user()        — AFTER INSERT on auth.users: create the profile,
--                                generate a unique referral_code, resolve
--                                referred_by from the signup's ref metadata.
--     credit_referral()        — idempotently credit ONE confirmed referral to
--                                the referrer and unlock free time at threshold.
--     handle_email_confirmed() — AFTER UPDATE on auth.users: when a referred
--                                user confirms their email, credit the referral.
--     guard_profile_columns()  — BEFORE UPDATE on profiles: block the client
--                                from editing referral/reward columns.
--
-- WHY email-confirmed, not signup?
--   Email verification is required, and a referral must not be gamed by
--   registering unconfirmed throwaway addresses. A referral is credited only
--   when the referred account's email_confirmed_at flips from NULL → set.
--   OAuth signups arrive already-confirmed, so handle_new_user credits those
--   inline. `referral_credited` guarantees each referral counts at most once.
--
-- WHO reads/writes it
--   - migrations/004 (this file)                 — schema + triggers + backfill
--   - api/referral.js                            — validate a code, read status
--   - auth/optional-access.js                    — reads own profile via RLS
--   - (future) every chiefeotool.com tool        — same profiles row, one graph
--
-- Idempotent: guarded with IF NOT EXISTS / CREATE OR REPLACE / DROP..IF EXISTS
-- so it is safe to re-run in the Supabase SQL editor.
--
-- Applied in production: <pending>

-- ─────────────────────────────────────────────────────────────────────────────
-- Tunables. Change these two lines to re-tune the referral reward; nothing else
-- references the raw numbers.
--   REFERRAL_THRESHOLD  = 3       (referrals needed to unlock free time)
--   REFERRAL_REWARD      = 365 days (length of the free window granted)
-- They live inside credit_referral() below as literals — labelled there.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email            TEXT,
  referral_code    TEXT        NOT NULL,
  referred_by      UUID        REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  referral_count   INTEGER     NOT NULL DEFAULT 0,
  referral_credited BOOLEAN    NOT NULL DEFAULT FALSE, -- has THIS row been counted for its referrer?
  free_until       TIMESTAMPTZ,                        -- NULL = no free window granted (yet)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ                         -- soft delete; NULL = active
);

-- referral_code is unique among *active* rows. A soft-deleted account frees its
-- code for potential reuse without a hard-delete of the referral history.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_active_key
  ON public.profiles (referral_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles (referred_by)
  WHERE referred_by IS NOT NULL;

COMMENT ON TABLE  public.profiles                  IS 'One row per auth.users account: referral graph + reward window. Phase-1 auth layer.';
COMMENT ON COLUMN public.profiles.referral_code    IS 'Unique shareable code — chiefeotool.com/?ref=CODE.';
COMMENT ON COLUMN public.profiles.referred_by      IS 'user_id of the account whose referral_code was used at signup (nullable).';
COMMENT ON COLUMN public.profiles.referral_count   IS 'Count of CONFIRMED (email-verified) signups this user has referred.';
COMMENT ON COLUMN public.profiles.referral_credited IS 'TRUE once this row has been counted toward its referrer — prevents double counting.';
COMMENT ON COLUMN public.profiles.free_until       IS 'Reward window end. Set when referral_count first reaches the threshold. NULL = never unlocked.';
COMMENT ON COLUMN public.profiles.deleted_at       IS 'Soft-delete timestamp. Row is retained so the referral graph stays intact.';

-- 2. Referral-code generator ─────────────────────────────────────────────────
-- 8-char uppercase code from a random UUID (hex, ambiguity-tolerant), retried on
-- the (astronomically rare) collision against an active code.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
BEGIN
  LOOP
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE referral_code = code AND deleted_at IS NULL
    );
  END LOOP;
  RETURN code;
END;
$$;

-- 3. Credit one confirmed referral (idempotent) ──────────────────────────────
-- Marks the given profile as credited, bumps its referrer's referral_count, and
-- unlocks a free window the first time that referrer reaches the threshold.
-- Safe to call more than once for the same profile — the referral_credited flag
-- makes every call after the first a no-op.
CREATE OR REPLACE FUNCTION public.credit_referral(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer UUID;
  v_already  BOOLEAN;
  v_new_count INTEGER;
  -- ── Tunables ──
  c_threshold CONSTANT INTEGER  := 3;              -- REFERRAL_THRESHOLD
  c_reward    CONSTANT INTERVAL := INTERVAL '365 days'; -- REFERRAL_REWARD
BEGIN
  SELECT referred_by, referral_credited
    INTO v_referrer, v_already
    FROM public.profiles
    WHERE user_id = p_user_id
    FOR UPDATE;

  -- No referrer, or already counted → nothing to do.
  IF v_referrer IS NULL OR v_already THEN
    RETURN;
  END IF;

  -- Mark this signup as counted so it can never be double-credited.
  UPDATE public.profiles
    SET referral_credited = TRUE
    WHERE user_id = p_user_id;

  -- Bump the referrer (skip soft-deleted referrers).
  UPDATE public.profiles
    SET referral_count = referral_count + 1
    WHERE user_id = v_referrer AND deleted_at IS NULL
    RETURNING referral_count INTO v_new_count;

  -- Unlock the free window the first time the threshold is reached.
  IF v_new_count IS NOT NULL AND v_new_count >= c_threshold THEN
    UPDATE public.profiles
      SET free_until = now() + c_reward
      WHERE user_id = v_referrer
        AND deleted_at IS NULL
        AND free_until IS NULL;   -- only the first crossing grants the window
  END IF;
END;
$$;

-- 4. On new auth user → create profile ───────────────────────────────────────
-- Reads the referrer's code from the signup metadata. The client passes it as
-- supabase.auth.signUp({ options: { data: { ref: 'CODE' } } }); we accept the
-- 'ref' key and a couple of aliases so a tool can't silently drop the referral.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_code TEXT;
  v_referrer UUID;
BEGIN
  v_ref_code := upper(nullif(trim(COALESCE(
    NEW.raw_user_meta_data->>'ref',
    NEW.raw_user_meta_data->>'referral_code',
    NEW.raw_user_meta_data->>'referred_by_code'
  )), ''));

  IF v_ref_code IS NOT NULL THEN
    SELECT user_id INTO v_referrer
      FROM public.profiles
      WHERE referral_code = v_ref_code AND deleted_at IS NULL;
    -- A user cannot refer themselves (metadata tampering guard).
    IF v_referrer = NEW.id THEN
      v_referrer := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, email, referral_code, referred_by)
  VALUES (NEW.id, NEW.email, public.generate_referral_code(), v_referrer)
  ON CONFLICT (user_id) DO NOTHING;

  -- OAuth / admin-created accounts land already-confirmed → credit inline.
  IF NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.credit_referral(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. On email confirmation → credit the referral ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.credit_referral(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_email_confirmed();

-- 6. Guard: client may never edit referral / reward columns ───────────────────
-- The authenticated role can UPDATE its own profile (see RLS below), but only
-- benign columns. Any attempt to change the referral graph or reward window is
-- silently reverted to the stored value, so a crafted PATCH can't grant itself
-- free time or rewrite the graph. Trigger functions and the service role run as
-- the table owner and bypass this guard.
CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    NEW.referral_code     := OLD.referral_code;
    NEW.referred_by       := OLD.referred_by;
    NEW.referral_count    := OLD.referral_count;
    NEW.referral_credited := OLD.referral_credited;
    NEW.free_until        := OLD.free_until;
    NEW.user_id           := OLD.user_id;
    NEW.created_at        := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_columns ON public.profiles;
CREATE TRIGGER profiles_guard_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_columns();

-- 7. RLS: a user can read (and harmlessly update) only their own active row ───
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);
-- No INSERT / DELETE policies: rows are created by the signup trigger and only
-- ever soft-deleted by the service role. All writes that matter go through
-- SECURITY DEFINER functions or the service key, both of which bypass RLS.

-- 8. Backfill existing users ─────────────────────────────────────────────────
-- The project already has accounts (Gabe's) with no profile row. Give each one
-- a code so their referral links work immediately. referred_by stays NULL —
-- there's no signup metadata to recover — and referral_count starts at 0.
INSERT INTO public.profiles (user_id, email, referral_code)
SELECT u.id, u.email, public.generate_referral_code()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);
