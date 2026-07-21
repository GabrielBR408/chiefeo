# ChiefEO Unified Auth Layer — Phase 1

A shared, **optional** account + referral layer for all of chiefeotool.com's
tools (VNG, Owner Report Generator, GL Down Driller, ChiefEO Inspector, and the
ChiefEO task app). Every tool already talks to the **same** Supabase project
(`dsmbppzvembacitwdrsj`), so accounts and the referral graph live in one place.

**It launches optional.** Existing users keep free, un-gated access. New users
*can* sign up to get a referral link. Nothing here enforces a paywall — see
[Flipping the switch](#flipping-the-switch) for the later, deliberate migration
of tools behind a hard login.

> **Note on this repo.** The ChiefEO task app (`index.html`) *already* requires
> login and is untouched by this work. The optional-access banner is for the
> other tools, which are anonymous today. Everything below is **additive** —
> new files only, zero changes to existing app behavior. Nothing has been
> applied to the live database or Supabase settings; Gabe reviews and approves
> before any of it ships.

---

## What's in here

| File | Role | Consumed by |
| --- | --- | --- |
| `../migrations/004-auth-profiles-referrals.sql` | Schema: `public.profiles` + referral triggers + RLS + backfill | Supabase (applied manually) |
| `../api/referral.js` | Serverless: validate a code, read your referral status | Any tool / signup page |
| `optional-access.js` | Framework-agnostic client: auth state, referral capture, signup/login/logout, anon banner | Every tool |
| `react-optional-access.js` | React binding: `useOptionalAccess()` hook + `<AccountBanner/>` | React tools |
| `callback.html` | Shared email-confirmation / OAuth redirect finalizer | All tools |

### "Where are the `/auth/signup` etc. routes?"

These tools are **static pages + Vercel serverless functions**, not a Next.js
app — there is no server-side routing layer to host route handlers. In this
stack the auth "routes" are:

- **signup / login / logout** → Supabase JS SDK calls, wrapped by
  `optional-access.js` (`signUpWithReferral`, `signIn`, `signOut`) so every tool
  uses identical entry points.
- **callback** → the static `callback.html` page (email confirm + OAuth return).

Building Next.js route handlers here would ship dead code. The wrappers give the
same surface with one shared implementation.

---

## Data model (migration 004)

`public.profiles`, one row per `auth.users` account, keyed on `user_id` (same
convention as `tasks` / `priorities`):

| Column | Notes |
| --- | --- |
| `user_id` | PK → `auth.users(id)`, cascade delete |
| `email` | copied from auth at signup |
| `referral_code` | unique among active rows, 8-char, auto-generated |
| `referred_by` | nullable self-FK → referrer's `user_id` |
| `referral_count` | **confirmed** signups this user referred |
| `referral_credited` | internal: has this row been counted for its referrer |
| `free_until` | reward window; set once `referral_count` first hits **3** |
| `created_at` / `deleted_at` | soft delete keeps the graph intact |

**The graph is maintained entirely by database triggers** (can't be raced or
faked from the client):

1. `handle_new_user` — on `auth.users` INSERT: creates the profile, generates a
   unique `referral_code`, resolves `referred_by` from signup metadata
   (`raw_user_meta_data.ref`). Blocks self-referral.
2. `handle_email_confirmed` — on `auth.users` UPDATE when `email_confirmed_at`
   goes NULL→set: credits the referral. (OAuth signups arrive confirmed and are
   credited inline by #1.)
3. `credit_referral` — idempotent: bumps the referrer's `referral_count` once,
   and grants `free_until = now() + 365 days` the first time they reach 3.
4. `guard_profile_columns` — blocks the client from editing referral/reward
   columns even though RLS lets it update its own row.

**Anti-gaming:** referrals count only on *email confirmation*, each at most
once. Tune the threshold (3) and reward (365 days) in the two labelled
constants inside `credit_referral()`.

---

## Setup checklist (Gabe approves each)

1. **Apply the migration.** Paste `migrations/004-auth-profiles-referrals.sql`
   into the Supabase SQL editor and run it, then update its `Applied in
   production:` line (per `migrations/README.md`).
2. **Supabase Auth settings** (Dashboard → Authentication):
   - **Confirm email: ON** — required; referrals credit on confirmation.
   - **Redirect URLs**: add `https://chiefeotool.com/auth/callback.html` (and
     each tool's origin equivalent, plus a localhost entry for dev).
   - Confirm-email template: point the link at `/auth/callback.html`.
3. **Env vars** (already present for the intake/score APIs; `api/referral.js`
   reuses them): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Optional:
   `REFERRAL_BASE_URL` (defaults to `https://chiefeotool.com`).

---

## Wiring a tool (anonymous-friendly)

```js
import { initOptionalAccess, captureReferralFromUrl } from '/auth/optional-access.js';
import { configureReact, useOptionalAccess, AccountBanner } from '/auth/react-optional-access.js';

initOptionalAccess({ client: window.__supabase }); // reuse the page's client
configureReact(window.React);
captureReferralFromUrl();                           // record ?ref=CODE on landing

function Tool() {
  const { isLoggedIn, user, referralCode, loading } = useOptionalAccess();
  return React.createElement(React.Fragment, null,
    !loading && !isLoggedIn && React.createElement(AccountBanner),
    /* the tool renders and works regardless of isLoggedIn */
  );
}
```

Non-React tools: `mountAnonBanner(container)` + `await getAuthState()`.

Show a signed-in user their referral link:

```js
const { referralCode } = await getAuthState();
// https://chiefeotool.com/?ref=<referralCode>   (or GET /api/referral for full status)
```

---

## End-to-end flow

1. Visitor lands on `chiefeotool.com/?ref=ABC123` → `captureReferralFromUrl()`
   stashes `ABC123`.
2. They use the tool anonymously; the banner invites them to create an account.
3. `signUpWithReferral(email, pw)` → Supabase signup with
   `options.data.ref = 'ABC123'` and `emailRedirectTo` = `/auth/callback.html`.
   `handle_new_user` creates their profile, generates their own code, links
   `referred_by`.
4. They click the confirm-email link → `callback.html` finalizes the session →
   `handle_email_confirmed` credits the referral to `ABC123`'s owner.
5. On the referrer's **3rd** confirmed referral, `free_until` is set. Their
   tools can read it (`GET /api/referral` → `unlocked: true`) and act on it
   whenever the paywall is switched on.

---

## Flipping the switch

Turning tools from optional → login-required is a separate change, on purpose:

- Replace each tool's anon-friendly render with an auth gate (the ChiefEO app's
  `if (!user) return <AuthScreen/>` is the reference pattern).
- Decide paywall policy from `profiles`: `free_until` (referral reward),
  legacy-user grandfathering, etc. The columns are in place; no schema change
  needed to enforce.
- Do it for all tools at once so the experience is consistent.

Until then: no gate, no paywall — just accounts and referral tracking.
