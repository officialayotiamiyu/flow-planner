(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  async function signUpUser(email, password) {
    if (typeof signUp === 'function') return signUp(email, password);
    if (typeof supabaseClient !== 'undefined') {
      return supabaseClient.auth.signUp({ email, password });
    }
    throw new Error('Supabase authentication is not available.');
  }

  async function signInUser(email, password) {
    if (typeof signIn === 'function') return signIn(email, password);
    if (typeof supabaseClient !== 'undefined') {
      return supabaseClient.auth.signInWithPassword({ email, password });
    }
    throw new Error('Supabase authentication is not available.');
  }

  async function signOutUser() {
    if (typeof signOut === 'function') return signOut();
    if (typeof supabaseClient !== 'undefined') {
      return supabaseClient.auth.signOut();
    }
    throw new Error('Supabase authentication is not available.');
  }

  async function getCurrentUserSafe() {
    if (typeof getCurrentUser === 'function') return getCurrentUser();
    if (typeof supabaseClient !== 'undefined') {
      const {
        data: { user }
      } = await supabaseClient.auth.getUser();
      return user;
    }
    return null;
  }

  async function getSession() {
    if (typeof supabaseClient === 'undefined') return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  }

  FlowPlanner.auth = {
    signUp: signUpUser,
    signIn: signInUser,
    signOut: signOutUser,
    getCurrentUser: getCurrentUserSafe,
    getSession
  };
})();
