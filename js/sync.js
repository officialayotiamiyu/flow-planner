(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state || {}));
  }

  function pickTimestamp(state) {
    if (!state || !state.meta) return '';
    return state.meta.lastCarryDate || state.meta.lastOpenDate || '';
  }

  async function downloadState() {
    const config = FlowPlanner.syncConfig || null;
    if (!config || !config.tableName || typeof supabaseClient === 'undefined') return null;

    const user = FlowPlanner.auth && typeof FlowPlanner.auth.getCurrentUser === 'function'
      ? await FlowPlanner.auth.getCurrentUser()
      : null;

    if (!user) return null;

    const { data, error } = await supabaseClient
      .from(config.tableName)
      .select('state')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data ? data.state : null;
  }

  async function uploadState(state) {
    const config = FlowPlanner.syncConfig || null;
    if (!config || !config.tableName || typeof supabaseClient === 'undefined') return null;

    const user = FlowPlanner.auth && typeof FlowPlanner.auth.getCurrentUser === 'function'
      ? await FlowPlanner.auth.getCurrentUser()
      : null;

    if (!user) return null;

    const payload = {
      user_id: user.id,
      state: cloneState(state)
    };

    const { data, error } = await supabaseClient
      .from(config.tableName)
      .upsert(payload)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  function mergeStates(localState, remoteState) {
    if (!localState && !remoteState) return null;
    if (!localState) return cloneState(remoteState);
    if (!remoteState) return cloneState(localState);

    const localTime = pickTimestamp(localState);
    const remoteTime = pickTimestamp(remoteState);

    if (remoteTime > localTime) return cloneState(remoteState);
    return cloneState(localState);
  }

  function resolveConflict(localState, remoteState) {
    return mergeStates(localState, remoteState);
  }

  FlowPlanner.sync = {
    downloadState,
    uploadState,
    mergeStates,
    resolveConflict
  };
})();
