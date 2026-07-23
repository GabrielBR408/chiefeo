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

> **The database schema is already live** in the Supabase project
> (`public.profiles` + referral triggers + RLS), applied out-of-band — **not**
> from a migration in this repo. This directory ships the *client + serverless*
> layer that talks to it. The data model below documents the **live** objects so
> the client stays in sync with them.

| File | Role | Consumed by |
| --- | --- | --- |
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

## Data model (live in Supabase)

`public.profiles`, one row per `auth.users` account, keyed on `user_id` (same
convention as `tasks` / `priorities`):

| Column | Notes |
| --- | --- |
| `user_id` | PK → `auth.users(id)` |
| `email` | copied from auth at signup (NOT NULL, defaults to `''`) |
| `referral_code` | unique, 8-char, unambiguous alphabet (no O/I/L/0/1) |
| `referred_by` | nullable self-FK → referrer's `user_id` |
| `referral_count` | **verified** signups this user referred |
| `free_until` | reward window; extended each time `referral_count` hits a multiple of the threshold |
| `created_at` / `deleted_at` | soft delete keeps the graph intact |

**The graph is maintained entirely by database triggers** (can't be raced or
faked from the client):

1. `handle_new_user` (`on_auth_user_created`, AFTER INSERT) — creates the
   profile, generates a unique `referral_code` via `generate_referral_code()`,
   resolves `referred_by` from signup metadata key **`referred_by_code`**
   (case-insensitive). Blocks self-referral; wrapped so signup never fails.
2. `handle_referral_verified` (`on_auth_user_verified`, AFTER UPDATE OF
   `email_confirmed_at` WHEN NULL→set) — credits the referrer: `referral_count
   += 1`, and every Nth referral (`count % threshold == 0`) extends `free_until`
   by the reward interval.

**Config helpers:** `referral_reward_threshold()` → **3**,
`referral_reward_interval()` → **6 months**. Change the reward by redefining
those two functions — no other code references the raw values.

**Anti-gaming:** a referral counts only on *email verification*, exactly once
(the trigger's `WHEN (old.email_confirmed_at IS NULL AND new … IS NOT NULL)`
guard fires a single time per account).

> **Known gap — OAuth referrals.** `on_auth_user_verified` is AFTER UPDATE, but
> OAuth (e.g. Google) signups arrive already-confirmed at INSERT, so no update
> fires and an OAuth-referred signup is **not** credited. If OAuth referrals
> should count, add an inline `handle_referral_verified`-equivalent call in
> `handle_new_user` for the `email_confirmed_at IS NOT NULL` case. Not fixed
> here — it's a change to the live trigger, for Gabe to approve.

**Contract for the client:** signup must send the referrer code under
`options.data.referred_by_code` (this is exactly what `signUpWithReferral`
does). Renaming that key silently breaks referral linking.

---

## Setup checklist

1. **Schema** — already live. Nothing to apply.
2. **Supabase Auth settings** (Dashboard → Authentication) — *required for
   referrals to credit at all*, and the one part this repo can't set for you:
   - **Confirm email: ON**. Referral credit fires on the email-verification
     transition; with confirm off, `email_confirmed_at` is set at signup and the
     verify trigger never runs.
   - **Redirect URLs**: add `https://chiefeotool.com/auth/callback.html` (and
     each tool origin, plus a localhost entry for dev).
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
   `options.data.referred_by_code = 'ABC123'` and `emailRedirectTo` =
   `/auth/callback.html`. `handle_new_user` creates their profile, generates
   their own code, links `referred_by`.
4. They click the confirm-email link → `callback.html` finalizes the session →
   `handle_referral_verified` credits the referral to `ABC123`'s owner.
5. On every **3rd** verified referral, the referrer's `free_until` is extended by
   6 months. Tools read it (`GET /api/referral` → `unlocked: true` while the
   window is active) and can act on it whenever the paywall is switched on.

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
