/*
 * ChiefEO unified auth — optional-access layer (framework-agnostic)
 * ================================================================
 * A tiny wrapper around the Supabase JS client, shared by every tool under
 * chiefeotool.com (VNG, Owner Report Generator, GL Down Driller, ChiefEO
 * Inspector, the ChiefEO task app). It answers one question — "who, if anyone,
 * is signed in?" — WITHOUT forcing a login. Tools stay fully usable while
 * anonymous; they just render a "create an account to unlock referrals" banner.
 *
 * Nothing here is a paywall. `getAuthState()` never blocks. Flipping tools
 * behind a hard login later is a separate, deliberate change (see auth/README).
 *
 * Usage (ES module):
 *   import { initOptionalAccess, getAuthState, signUpWithReferral,
 *            signIn, signOut, captureReferralFromUrl, mountAnonBanner }
 *     from './auth/optional-access.js';
 *
 *   const auth = initOptionalAccess({
 *     supabaseUrl: 'https://dsmbppzvembacitwdrsj.supabase.co',
 *     supabaseAnonKey: '...anon key...',
 *   });
 *   // ...or, if the page already made a client:
 *   const auth = initOptionalAccess({ client: window.__supabase });
 *
 *   captureReferralFromUrl();            // stash ?ref=CODE for signup
 *   const state = await getAuthState();  // { isLoggedIn, user, referralCode }
 *   if (!state.isLoggedIn) mountAnonBanner(document.getElementById('root'));
 */

const REF_STORAGE_KEY = 'chiefeo_ref_code';
let _client = null;

// ── Client bootstrap ─────────────────────────────────────────────
// Accepts an existing client (preferred — one client per page) or credentials
// to lazily create one. Loading @supabase/supabase-js is the caller's job when
// passing credentials; we look for a global factory to avoid a hard dep here.
export function initOptionalAccess(opts = {}) {
  if (opts.client) {
    _client = opts.client;
  } else if (globalThis.__supabase) {
    _client = globalThis.__supabase;
  } else if (opts.supabaseUrl && opts.supabaseAnonKey && globalThis.supabase?.createClient) {
    _client = globalThis.supabase.createClient(opts.supabaseUrl, opts.supabaseAnonKey);
  } else {
    throw new Error(
      'initOptionalAccess: pass { client } or { supabaseUrl, supabaseAnonKey } ' +
      '(with @supabase/supabase-js loaded), or set globalThis.__supabase first.'
    );
  }
  return { getAuthState, signUpWithReferral, signIn, signOut, onChange, captureReferralFromUrl, client: _client };
}

function client() {
  if (!_client) throw new Error('Call initOptionalAccess() before using the auth layer.');
  return _client;
}

// ── Referral capture ─────────────────────────────────────────────
// Reads ?ref=CODE (accepts &ref= too) and persists it so it survives the trip
// through the signup form / email confirmation. Call once on page load.
export function captureReferralFromUrl(search = globalThis.location?.search || '') {
  try {
    const params = new URLSearchParams(search);
    const code = (params.get('ref') || '').trim().toUpperCase();
    if (code) sessionStorage.setItem(REF_STORAGE_KEY, code);
  } catch { /* sessionStorage unavailable (SSR / private mode) — ignore */ }
  return getStoredReferralCode();
}

export function getStoredReferralCode() {
  try { return sessionStorage.getItem(REF_STORAGE_KEY) || null; } catch { return null; }
}

export function clearStoredReferralCode() {
  try { sessionStorage.removeItem(REF_STORAGE_KEY); } catch { /* ignore */ }
}

// ── The core question: who's signed in? (never blocks) ───────────
// Returns { isLoggedIn, user, referralCode }. referralCode is the signed-in
// user's OWN shareable code (null while anonymous). Reads the profile via RLS
// (migrations/004 grants each user SELECT on their own row).
export async function getAuthState() {
  const sb = client();
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return { isLoggedIn: false, user: null, referralCode: null };

  let referralCode = null;
  try {
    const { data } = await sb
      .from('profiles')
      .select('referral_code')
      .eq('user_id', user.id)
      .maybeSingle();
    referralCode = data?.referral_code ?? null;
  } catch { /* profiles table / migration not present yet — degrade gracefully */ }

  return { isLoggedIn: true, user, referralCode };
}

// Subscribe to login/logout. Returns an unsubscribe function.
export function onChange(cb) {
  const sb = client();
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(!!session?.user, session?.user ?? null);
  });
  return () => data?.subscription?.unsubscribe?.();
}

// ── Auth entry points (the "auth routes", SDK-native) ────────────
// Signup carries the stored referral code into user metadata, where the
// handle_new_user() DB trigger reads it (key: 'ref') to set referred_by.
// Email verification is enforced by the Supabase project's "Confirm email"
// setting; emailRedirectTo points at the shared /auth/callback page.
export async function signUpWithReferral(email, password, opts = {}) {
  const sb = client();
  const ref = opts.referralCode ?? getStoredReferralCode();
  const redirectTo =
    opts.redirectTo ||
    (globalThis.location ? `${globalThis.location.origin}/auth/callback.html` : undefined);
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: ref ? { ref } : {},
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
    },
  });
  if (error) throw error;
  return data; // { user, session } — session is null until email is confirmed
}

export async function signIn(email, password) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await client().auth.signOut();
}

// ── Anonymous banner (vanilla) ───────────────────────────────────
// Non-blocking prompt for anon users: "Create an account to unlock referrals."
// Renders once, hides itself after login. React tools should use AccountBanner
// from auth/react-optional-access.js instead of this.
export function mountAnonBanner(container, opts = {}) {
  if (!container) return () => {};
  const signupUrl = opts.signupUrl || '/?signup=1';
  const el = document.createElement('div');
  el.setAttribute('data-chiefeo-anon-banner', '');
  el.style.cssText =
    'font-family:Inter,system-ui,sans-serif;display:flex;gap:12px;align-items:center;' +
    'justify-content:center;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;' +
    'color:#1e3a8a;padding:10px 16px;border-radius:12px;font-size:14px;margin:12px 0;';
  el.innerHTML =
    '<span>Create a free account to get your referral link — refer 3 people, unlock free time.</span>';
  const btn = document.createElement('a');
  btn.href = signupUrl;
  btn.textContent = 'Create account';
  btn.style.cssText =
    'background:#3b82f6;color:#fff;text-decoration:none;font-weight:700;' +
    'padding:8px 14px;border-radius:9px;white-space:nowrap;';
  el.appendChild(btn);
  container.prepend(el);

  const unsub = onChange((isLoggedIn) => { if (isLoggedIn) el.remove(); });
  return () => { el.remove(); unsub(); };
}
