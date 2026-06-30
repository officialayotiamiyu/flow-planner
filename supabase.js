/* ============================================================================
 * Supabase client + auth helpers
 * ----------------------------------------------------------------------------
 * Sprint 4 — Cloud Sync
 *
 * Expected Supabase schema (run this SQL once in the Supabase SQL editor):
 *
 *   create table if not exists public.planner_state (
 *     user_id     uuid primary key references auth.users(id) on delete cascade,
 *     state       jsonb not null,
 *     updated_at  timestamptz not null default now()
 *   );
 *
 *   alter table public.planner_state enable row level security;
 *
 *   create policy "Users read own state"
 *     on public.planner_state for select
 *     using (auth.uid() = user_id);
 *
 *   create policy "Users upsert own state"
 *     on public.planner_state for insert
 *     with check (auth.uid() = user_id);
 *
 *   create policy "Users update own state"
 *     on public.planner_state for update
 *     using (auth.uid() = user_id)
 *     with check (auth.uid() = user_id);
 *
 * The Supabase JS SDK persists the auth session in localStorage by default,
 * so "session persistence" (Sprint 4.1) works automatically — we just need to
 * wire `onAuthStateChange` into the UI.
 * ========================================================================== */

const SUPABASE_URL = 'https://hppnqxevasgbxdesvzud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z4yZ-07NhZPPtHAYtBVCqQ_HIvPBLfz';

window.supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'flow_auth_v2'
        }
    }
);

/* Configurable table name — exposed so other modules can read it. */
window.FLOW_SYNC_TABLE = 'planner_state';

async function signUp(email, password) {
  return await supabaseClient.auth.signUp({ email, password });
}

async function signIn(email, password) {
  return await supabaseClient.auth.signInWithPassword({ email, password });
}

async function signOut() {
  return await supabaseClient.auth.signOut();
}

async function getCurrentUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

async function getCurrentSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}
