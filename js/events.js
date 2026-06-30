/* ============================================================================
 * js/events.js — minimal pub/sub bus
 * ----------------------------------------------------------------------------
 * Loaded BEFORE the other modules. Used by auth, sync and rendering so they
 * don't need to import each other directly. Keeps Sprint 4 changes
 * minimally invasive to the existing module structure.
 * ========================================================================== */
(function () {
  'use strict';
  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  const listeners = {};

  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function off() {
      listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; });
    };
  }

  function emit(name, payload) {
    (listeners[name] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[events] handler error for', name, e); }
    });
  }

  FlowPlanner.events = { on: on, emit: emit };
})();
