/* ============================================================================
 * js/sync.js — Sprint 4.2 / 4.3 / 4.4 (Cloud Sync engine)
 * ----------------------------------------------------------------------------
 *  4.2  Manual save: uploadState() / downloadState() + "Sync Now" button
 *  4.3  Auto sync: debounced upload on every save(), pull on login,
 *       per-item updatedAt merge so the newest edit always wins per record
 *  4.4  Multi-device: realtime subscription pushes remote changes into the
 *       running app without reload + conflict resolution on every merge
 * ========================================================================== */
(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  const TABLE = window.FLOW_SYNC_TABLE || 'planner_state';
  const STATUS_STORAGE_KEY = 'flow_sync_status_v1';
  const DEBOUNCE_MS = 1500;

  /* status.lastSyncedAt — string ISO; null if never synced. */
  let status = {
    state: 'idle',     // idle | syncing | error | offline | signed-out
    lastSyncedAt: null,
    message: ''
  };
  try {
    const raw = localStorage.getItem(STATUS_STORAGE_KEY);
    if (raw) status = Object.assign(status, JSON.parse(raw));
  } catch (e) {}

  let realtimeChannel = null;
  let suppressNextLocalPush = false;   // set true when we apply a remote change
  let uploadTimer = null;
  let inFlight = null;

  /* ------------------------ Helpers --------------------------------------- */

  function cloneState(s) { return JSON.parse(JSON.stringify(s || {})); }
  function nowIso() { return new Date().toISOString(); }

  function setStatus(patch) {
    status = Object.assign({}, status, patch);
    try { localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(status)); } catch (e) {}
    FlowPlanner.events.emit('sync:status', status);
  }

  function getStatus() { return Object.assign({}, status); }

  function userId() {
    return FlowPlanner.auth && FlowPlanner.auth.getCurrentUserId && FlowPlanner.auth.getCurrentUserId();
  }

  /* Stamp updatedAt on every item that doesn't already have one (back-fill so
   * legacy local data participates in per-item merging from now on). */
  function stampStateForUpload(state) {
    const ts = nowIso();
    const out = cloneState(state);
    out.tasks  = (out.tasks  || []).map(function (t) { return t.updatedAt ? t : Object.assign({}, t, { updatedAt: ts }); });
    out.events = (out.events || []).map(function (e) { return e.updatedAt ? e : Object.assign({}, e, { updatedAt: ts }); });
    out.goals  = (out.goals  || []).map(function (g) { return g.updatedAt ? g : Object.assign({}, g, { updatedAt: ts }); });
    out.notes  = out.notes || {};
    /* notes are keyed by date — wrap them in {value, updatedAt} only if not already. */
    out.notesMeta = out.notesMeta || {};
    Object.keys(out.notes).forEach(function (d) {
      if (!out.notesMeta[d]) out.notesMeta[d] = { updatedAt: ts };
    });
    out.meta = out.meta || {};
    out.meta.lastSyncedAt = ts;
    return out;
  }

  /* ------------------------ Cloud I/O ------------------------------------- */

  async function downloadState() {
    const uid = userId();
    if (!uid) return null;
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('state, updated_at')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return data ? { state: data.state, updatedAt: data.updated_at } : null;
  }

  async function uploadStateRaw(stateToUpload) {
    const uid = userId();
    if (!uid) return null;
    const payload = {
      user_id: uid,
      state: stateToUpload,
      updated_at: nowIso()
    };
    const { data, error } = await supabaseClient
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /* ------------------------ Merge logic ----------------------------------- */
  /* Per-item merge using updatedAt timestamps. For each task / event / goal
   * id present in either side, keep the version with the most recent
   * updatedAt. For notes (keyed by date), keep the one with the newer
   * notesMeta.updatedAt. Deletions are not tracked separately — the last
   * full-state writer wins for items that exist on only one side. This is a
   * pragmatic compromise that prevents the most common "I worked on phone,
   * laptop overwrote everything" footgun. */

  function indexById(arr) {
    const out = {};
    (arr || []).forEach(function (item) { if (item && item.id) out[item.id] = item; });
    return out;
  }

  function mergeArrays(local, remote) {
    const a = indexById(local);
    const b = indexById(remote);
    const ids = new Set(Object.keys(a).concat(Object.keys(b)));
    const out = [];
    ids.forEach(function (id) {
      const l = a[id];
      const r = b[id];
      if (l && r) {
        const lt = l.updatedAt || '';
        const rt = r.updatedAt || '';
        out.push(rt > lt ? r : l);
      } else {
        out.push(l || r);
      }
    });
    /* preserve a sensible order: sort by `order` if present, otherwise createdAt */
    out.sort(function (x, y) {
      if (x.order != null && y.order != null) return x.order - y.order;
      return String(x.createdAt || '').localeCompare(String(y.createdAt || ''));
    });
    return out;
  }

  function mergeNotes(localState, remoteState) {
    const lNotes = localState.notes || {};
    const rNotes = remoteState.notes || {};
    const lMeta  = localState.notesMeta || {};
    const rMeta  = remoteState.notesMeta || {};
    const merged = {};
    const mergedMeta = {};
    const dates = new Set(Object.keys(lNotes).concat(Object.keys(rNotes)));
    dates.forEach(function (d) {
      const lt = (lMeta[d] && lMeta[d].updatedAt) || '';
      const rt = (rMeta[d] && rMeta[d].updatedAt) || '';
      if (rt > lt) { merged[d] = rNotes[d]; mergedMeta[d] = rMeta[d] || { updatedAt: rt }; }
      else         { merged[d] = lNotes[d]; mergedMeta[d] = lMeta[d] || { updatedAt: lt || nowIso() }; }
      if (merged[d] == null) delete merged[d];
    });
    return { notes: merged, notesMeta: mergedMeta };
  }

  function mergeStates(localState, remoteState) {
    if (!localState && !remoteState) return null;
    if (!localState) return cloneState(remoteState);
    if (!remoteState) return cloneState(localState);
    const merged = cloneState(localState);
    merged.tasks  = mergeArrays(localState.tasks,  remoteState.tasks);
    merged.events = mergeArrays(localState.events, remoteState.events);
    merged.goals  = mergeArrays(localState.goals,  remoteState.goals);
    const n = mergeNotes(localState, remoteState);
    merged.notes = n.notes;
    merged.notesMeta = n.notesMeta;
    /* Keep the most advanced carry-forward bookkeeping. */
    merged.meta = Object.assign({}, remoteState.meta || {}, localState.meta || {});
    const lo = (localState.meta && localState.meta.lastCarryDate) || '';
    const ro = (remoteState.meta && remoteState.meta.lastCarryDate) || '';
    merged.meta.lastCarryDate = ro > lo ? ro : lo;
    const lop = (localState.meta && localState.meta.lastOpenDate) || '';
    const rop = (remoteState.meta && remoteState.meta.lastOpenDate) || '';
    merged.meta.lastOpenDate = rop > lop ? rop : lop;
    return merged;
  }

  /* ------------------------ Orchestration --------------------------------- */

  async function pullAndApply() {
    if (!userId()) return { applied: false, reason: 'signed-out' };
    setStatus({ state: 'syncing', message: 'Downloading…' });
    try {
      const remote = await downloadState();
      if (!remote) {
        /* First sync ever — push current local state up. */
        const stamped = stampStateForUpload(FlowPlanner.state);
        await uploadStateRaw(stamped);
        setStatus({ state: 'idle', lastSyncedAt: nowIso(), message: 'First sync complete.' });
        return { applied: false, reason: 'no-remote-pushed-local' };
      }
      const merged = mergeStates(FlowPlanner.state, remote.state);
      const changed = JSON.stringify(merged) !== JSON.stringify(FlowPlanner.state);
      if (changed) {
        suppressNextLocalPush = true;
        Object.assign(FlowPlanner.state, merged);
        FlowPlanner.storage.ensureStateShape(FlowPlanner.state);
        FlowPlanner.storage.save();    // persist locally
        FlowPlanner.render && FlowPlanner.render();
      }
      /* If we changed remote during merge (i.e., local had newer items), push it back. */
      const remoteWasIdentical = JSON.stringify(merged) === JSON.stringify(remote.state);
      if (!remoteWasIdentical) {
        await uploadStateRaw(stampStateForUpload(merged));
      }
      setStatus({ state: 'idle', lastSyncedAt: nowIso(), message: changed ? 'Merged with cloud.' : 'Up to date.' });
      return { applied: changed };
    } catch (err) {
      console.error('[sync] pull failed', err);
      setStatus({ state: 'error', message: (err && err.message) || 'Sync failed.' });
      return { applied: false, reason: 'error', error: err };
    }
  }

  async function pushNow() {
    if (!userId()) return;
    if (inFlight) return inFlight;
    setStatus({ state: 'syncing', message: 'Uploading…' });
    const promise = (async function () {
      try {
        const remote = await downloadState();
        const merged = remote ? mergeStates(FlowPlanner.state, remote.state) : cloneState(FlowPlanner.state);
        const stamped = stampStateForUpload(merged);
        await uploadStateRaw(stamped);
        const changed = remote && JSON.stringify(merged) !== JSON.stringify(FlowPlanner.state);
        if (changed) {
          suppressNextLocalPush = true;
          Object.assign(FlowPlanner.state, merged);
          FlowPlanner.storage.ensureStateShape(FlowPlanner.state);
          FlowPlanner.storage.save();
          FlowPlanner.render && FlowPlanner.render();
        }
        setStatus({ state: 'idle', lastSyncedAt: nowIso(), message: 'Sync complete.' });
      } catch (err) {
        console.error('[sync] push failed', err);
        setStatus({ state: 'error', message: (err && err.message) || 'Upload failed.' });
      } finally {
        inFlight = null;
      }
    })();
    inFlight = promise;
    return promise;
  }

  function scheduleUpload() {
    if (!userId()) return;
    if (suppressNextLocalPush) { suppressNextLocalPush = false; return; }
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(pushNow, DEBOUNCE_MS);
  }

  /* ------------------------ Realtime subscription ------------------------- */

  function subscribeRealtime() {
    unsubscribeRealtime();
    const uid = userId();
    if (!uid) return;
    realtimeChannel = supabaseClient
      .channel('planner_state:' + uid)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: 'user_id=eq.' + uid },
        async function () {
          /* Remote change detected — pull & merge. */
          await pullAndApply();
        }
      )
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (realtimeChannel) {
      try { supabaseClient.removeChannel(realtimeChannel); } catch (e) {}
      realtimeChannel = null;
    }
  }

  /* ------------------------ Wiring --------------------------------------- */

  function init() {
    /* React to auth changes. */
    FlowPlanner.events.on('auth:change', async function (info) {
      if (info.user) {
        /* Signed in → first download + subscribe to realtime. */
        setStatus({ state: 'syncing', message: 'Signing in…' });
        await pullAndApply();
        subscribeRealtime();
      } else {
        unsubscribeRealtime();
        setStatus({ state: 'signed-out', message: 'Not signed in.' });
      }
    });

    /* React to local saves. */
    FlowPlanner.events.on('state:saved', function () {
      scheduleUpload();
    });

    /* React to connectivity. */
    window.addEventListener('online', function () {
      if (userId()) pushNow();
    });
    window.addEventListener('offline', function () {
      setStatus({ state: 'offline', message: 'Offline — changes will sync later.' });
    });
  }

  FlowPlanner.sync = {
    init: init,
    downloadState: downloadState,
    uploadState: pushNow,           // exposed as "Sync Now"
    pullAndApply: pullAndApply,
    pushNow: pushNow,
    mergeStates: mergeStates,
    resolveConflict: mergeStates,
    getStatus: getStatus,
    stampStateForUpload: stampStateForUpload
  };
})();
