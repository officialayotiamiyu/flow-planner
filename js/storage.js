(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  function getState() {
    return FlowPlanner.state;
  }

  function getUtils() {
    return FlowPlanner.utils;
  }

  function getConstants() {
    return FlowPlanner.constants;
  }

  function ensureStateShape(state) {
    if (!state.notes) state.notes = {};
    if (!state.tasks) state.tasks = [];
    if (!state.events) state.events = [];
    if (!state.goals) state.goals = [];
    if (!state.meta) state.meta = {};
    if (!state.meta.lastOpenDate) state.meta.lastOpenDate = null;
    if (!state.meta.lastCarryDate) state.meta.lastCarryDate = null;
    return state;
  }

  function save() {
    try {
      localStorage.setItem(getConstants().STORAGE_KEY, JSON.stringify(getState()));
    } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(getConstants().STORAGE_KEY);
      if (!raw) {
        return ensureStateShape(getState());
      }

      const parsed = JSON.parse(raw);
      Object.assign(getState(), parsed);
      return ensureStateShape(getState());
    } catch (e) {
      return ensureStateShape(getState());
    }
  }

  function runCarryForward() {
    const state = getState();
    const today = getUtils().todayStr();

    if (state.meta.lastCarryDate === today) return;

    for (const t of state.tasks) {
      if (
        !t.done &&
        t.due &&
        t.due < today &&
        (!t.recurrence || t.recurrence.type === 'none')
      ) {
        if (!t.originalDueDate) {
          t.originalDueDate = t.due;
        }

        t.due = today;
        t.lastCarriedDate = today;
      }
    }

    state.meta.lastCarryDate = today;
    save();
  }

  function seedIfEmpty() {
    const state = getState();
    if (
      state.tasks.length === 0 &&
      Object.keys(state.notes).length === 0 &&
      state.events.length === 0 &&
      state.goals.length === 0
    ) {
      const ds = getUtils().todayStr();
      state.goals.push({
        id: 'g1',
        title: 'Try Flow v2',
        desc: 'Explore all the features',
        targetDate: '',
        status: 'active',
        createdAt: ds
      });
      state.tasks.push({
        id: 't1',
        title: 'Welcome to Flow v2 ✨',
        desc: 'Tasks, events, goals and reviews — all in one place.',
        due: ds,
        priority: 'inu',
        done: false,
        createdAt: ds,
        recurrence: { type: 'none' },
        order: 1,
        goalId: 'g1'
      });
      state.tasks.push({
        id: 't2',
        title: 'Tap the circle to complete a task',
        desc: 'Try checking this one off.',
        due: ds,
        priority: 'uni',
        done: false,
        createdAt: ds,
        recurrence: { type: 'none' },
        order: 2,
        goalId: null
      });
      state.tasks.push({
        id: 't3',
        title: 'Try adding an event',
        desc: 'Tap "+ Add event" below.',
        due: ds,
        priority: 'nn',
        done: false,
        createdAt: ds,
        recurrence: { type: 'none' },
        order: 3,
        goalId: 'g1'
      });
      state.events.push({
        id: 'e1',
        title: 'Quick catch-up',
        desc: 'Zoom call',
        date: ds,
        startTime: '10:00',
        endTime: '10:30',
        createdAt: ds
      });
      state.notes[ds] = 'Pinch to zoom views. Swipe left/right to navigate dates. Press N for a new task, E for a new event.';
      save();
    }
  }

  function exportBackup() {
    const data = localStorage.getItem(getConstants().STORAGE_KEY);

    if (!data) {
      alert('No data found.');
      return;
    }

    const blob = new Blob([data], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'flow-backup.json';
    a.click();

    URL.revokeObjectURL(url);
  }

  function importBackup(event) {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        JSON.parse(e.target.result);

        if (!confirm('This will replace all current data. Continue?')) return;

        localStorage.setItem(getConstants().STORAGE_KEY, e.target.result);
        alert('Backup restored.');
        location.reload();
      } catch (err) {
        alert('Invalid backup file.');
      }
    };

    reader.readAsText(file);
  }

  FlowPlanner.storage = {
    ensureStateShape,
    save,
    load,
    runCarryForward,
    seedIfEmpty,
    exportBackup,
    importBackup
  };

  window.exportBackup = exportBackup;
  window.importBackup = importBackup;
})();
