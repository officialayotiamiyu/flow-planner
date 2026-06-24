const SUPABASE_URL = 'https://hppnqxevasgbxdesvzud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z4yZ-07NhZPPtHAYtBVCqQ_HIvPBLfz';

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

async function signUp(email, password) {
  return await supabaseClient.auth.signUp({
    email,
    password
  });
}

async function signIn(email, password) {
  return await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
}

async function signOut() {
  return await supabaseClient.auth.signOut();
}

async function getCurrentUser() {
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  return user;
}
