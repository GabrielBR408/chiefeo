/*
 * ChiefEO unified auth — React binding for the optional-access layer
 * =================================================================
 * A thin React wrapper over auth/optional-access.js for the tools that render
 * with React. Written with React.createElement (no JSX) so it needs no build
 * step — it works with the global `React` this repo already loads from a CDN,
 * or with an imported React passed in.
 *
 * Setup:
 *   import { initOptionalAccess } from './auth/optional-access.js';
 *   import { configureReact, useOptionalAccess, AccountBanner }
 *     from './auth/react-optional-access.js';
 *
 *   initOptionalAccess({ client: window.__supabase });
 *   configureReact(window.React);   // or: configureReact(React)
 *
 *   function Tool() {
 *     const { isLoggedIn, user, referralCode, loading } = useOptionalAccess();
 *     return React.createElement(React.Fragment, null,
 *       !loading && !isLoggedIn && React.createElement(AccountBanner),
 *       // ...the tool, fully usable whether or not isLoggedIn...
 *     );
 *   }
 *
 * Nothing here blocks rendering — it is a hint, not a gate.
 */

import {
  getAuthState, onChange, captureReferralFromUrl, getStoredReferralCode,
} from './optional-access.js';

let React = globalThis.React || null;

export function configureReact(reactInstance) {
  React = reactInstance || globalThis.React;
  if (!React) throw new Error('configureReact: pass a React instance (or load it globally first).');
  return React;
}

function react() {
  if (!React) React = globalThis.React;
  if (!React) throw new Error('React not configured — call configureReact(React) first.');
  return React;
}

/*
 * useOptionalAccess() → { isLoggedIn, user, referralCode, loading }
 * Resolves auth state once on mount, then keeps it live via onAuthStateChange.
 * Captures ?ref= on first mount so a landing-page visit records the referral
 * even if the visitor signs up minutes later.
 */
export function useOptionalAccess() {
  const R = react();
  const [state, setState] = R.useState({
    isLoggedIn: false, user: null, referralCode: null, loading: true,
  });

  R.useEffect(() => {
    let alive = true;
    captureReferralFromUrl();

    const refresh = () =>
      getAuthState()
        .then((s) => { if (alive) setState({ ...s, loading: false }); })
        .catch(() => { if (alive) setState({ isLoggedIn: false, user: null, referralCode: null, loading: false }); });

    refresh();
    const unsub = onChange(() => refresh());
    return () => { alive = false; unsub(); };
  }, []);

  return state;
}

/*
 * <AccountBanner /> — non-blocking prompt shown to anonymous users.
 * Renders nothing once the user is signed in. Props:
 *   signupUrl  — where "Create account" links (default '/?signup=1')
 *   message    — override copy
 *   style      — merged onto the container style
 */
export function AccountBanner(props = {}) {
  const R = react();
  const { isLoggedIn, loading } = useOptionalAccess();
  if (loading || isLoggedIn) return null;

  const signupUrl = props.signupUrl || '/?signup=1';
  const message =
    props.message ||
    'Create a free account to get your referral link — refer 3 people, unlock free time.';

  return R.createElement(
    'div',
    {
      'data-chiefeo-anon-banner': '',
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', background: '#eff6ff', border: '1px solid #bfdbfe',
        color: '#1e3a8a', padding: '10px 16px', borderRadius: 12, fontSize: 14,
        margin: '12px 0', ...(props.style || {}),
      },
    },
    R.createElement('span', null, message),
    R.createElement(
      'a',
      {
        href: signupUrl,
        style: {
          background: '#3b82f6', color: '#fff', textDecoration: 'none',
          fontWeight: 700, padding: '8px 14px', borderRadius: 9, whiteSpace: 'nowrap',
        },
      },
      'Create account'
    )
  );
}

export { getStoredReferralCode };
