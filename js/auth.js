/* ============================================================================
 * js/auth.js — Sprint 4.1 (Authentication)
 * ----------------------------------------------------------------------------
 *  • Email/password sign up
 *  • Email/password sign in
 *  • Logout
 *  • Session persistence (handled by supabase-js + onAuthStateChange listener)
 *  • Auth modal UI (injected at runtime so we don't touch index.html structure)
 * ========================================================================== */
(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  /* ------------------------ Thin wrappers around Supabase ------------------ */

  async function signUpUser(email, password) {
    if (typeof signUp === 'function') return signUp(email, password);
    return supabaseClient.auth.signUp({ email, password });
  }

  async function signInUser(email, password) {
    if (typeof signIn === 'function') return signIn(email, password);
    return supabaseClient.auth.signInWithPassword({ email, password });
  }

  async function signOutUser() {
    if (typeof signOut === 'function') return signOut();
    return supabaseClient.auth.signOut();
  }

  async function getCurrentUserSafe() {
    if (typeof getCurrentUser === 'function') return getCurrentUser();
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  }

  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  }

  /* ------------------------ Auth modal (injected) -------------------------- */

  function ensureAuthModal() {
    if (document.getElementById('authModal')) return;

    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = 'authModal';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-labelledby="authModalTitle">
        <h2 id="authModalTitle">Sign in to Flow</h2>
        <div class="auth-tabs">
          <button class="auth-tab active" data-auth-tab="signin">Sign In</button>
          <button class="auth-tab" data-auth-tab="signup">Create account</button>
        </div>
        <div class="field">
          <label for="authEmail">Email</label>
          <input type="email" id="authEmail" autocomplete="email" placeholder="you@example.com">
        </div>
        <div class="field">
          <label for="authPassword">Password</label>
          <input type="password" id="authPassword" autocomplete="current-password" placeholder="At least 6 characters">
        </div>
        <div class="auth-message" id="authMessage"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="authCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="authSubmitBtn">Sign In</button>
        </div>
        <div class="auth-foot">
          <small>Your data is encrypted in transit and stored only against your account.</small>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    let mode = 'signin';

    function setMode(next) {
      mode = next;
      wrap.querySelectorAll('.auth-tab').forEach(function (b) {
        b.classList.toggle('active', b.dataset.authTab === mode);
      });
      document.getElementById('authModalTitle').textContent =
        mode === 'signin' ? 'Sign in to Flow' : 'Create your Flow account';
      document.getElementById('authSubmitBtn').textContent =
        mode === 'signin' ? 'Sign In' : 'Create account';
      document.getElementById('authPassword').autocomplete =
        mode === 'signin' ? 'current-password' : 'new-password';
      setMessage('');
    }

    function setMessage(text, kind) {
      const el = document.getElementById('authMessage');
      el.textContent = text || '';
      el.className = 'auth-message' + (kind ? ' ' + kind : '');
    }

    wrap.querySelectorAll('.auth-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.authTab); });
    });

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) close();
    });

    document.getElementById('authCancelBtn').addEventListener('click', close);

    document.getElementById('authSubmitBtn').addEventListener('click', async function () {
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      if (!email || !password) {
        setMessage('Email and password are required.', 'error');
        return;
      }
      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.', 'error');
        return;
      }
      const submitBtn = document.getElementById('authSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'signin' ? 'Signing in…' : 'Creating…';
      try {
        const res = mode === 'signin'
          ? await signInUser(email, password)
          : await signUpUser(email, password);
        if (res.error) {
          setMessage(res.error.message || 'Authentication failed.', 'error');
        } else {
          if (mode === 'signup' && !res.data.session) {
            setMessage('Account created. Check your inbox to confirm your email, then sign in.', 'success');
            setMode('signin');
          } else {
            close();
            /* onAuthStateChange will kick off the first download. */
          }
        }
      } catch (err) {
        setMessage((err && err.message) || 'Unexpected error.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create account';
      }
    });

    function close() {
      wrap.classList.remove('active');
      setMessage('');
      document.getElementById('authPassword').value = '';
    }

    /* Save references for openAuthModal */
    wrap._setMode = setMode;
    wrap._setMessage = setMessage;
  }

  function openAuthModal(mode) {
    ensureAuthModal();
    const wrap = document.getElementById('authModal');
    if (mode) wrap._setMode(mode);
    wrap.classList.add('active');
    setTimeout(function () {
      document.getElementById('authEmail').focus();
    }, 50);
  }

  function closeAuthModal() {
    const wrap = document.getElementById('authModal');
    if (wrap) wrap.classList.remove('active');
  }

  /* ------------------------ Auth state listener ---------------------------- */

  let currentUserId = null;

  function attachAuthListener() {
    /* Initial check (session may already be restored from storage). */
    getSession().then(function (session) {
      const user = session && session.user;
      currentUserId = user ? user.id : null;
      FlowPlanner.events && FlowPlanner.events.emit('auth:change', { user: user, event: 'INITIAL' });
    });

    supabaseClient.auth.onAuthStateChange(function (event, session) {
      const user = session && session.user;
      const previousId = currentUserId;
      currentUserId = user ? user.id : null;
      /* Surface to the rest of the app via the event bus. */
      FlowPlanner.events && FlowPlanner.events.emit('auth:change', {
        user: user,
        event: event,
        previousUserId: previousId
      });
    });
  }

  FlowPlanner.auth = {
    signUp: signUpUser,
    signIn: signInUser,
    signOut: signOutUser,
    getCurrentUser: getCurrentUserSafe,
    getSession: getSession,
    openModal: openAuthModal,
    closeModal: closeAuthModal,
    attachListener: attachAuthListener,
    /* Synchronous getter for current user id (cached). */
    getCurrentUserId: function () { return currentUserId; }
  };
})();
