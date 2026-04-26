import { createClient } from "@supabase/supabase-js";

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surface this loudly in dev — silent failure here means the dashboard
  // looks like it's broken when really the env just isn't wired.
  // eslint-disable-next-line no-console
  console.error(
    "[TokenScope] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — " +
    "copy .env.example to .env.local and fill in your Supabase project values."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: true, autoRefreshToken: true },
});
