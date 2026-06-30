(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  function getState() {
    return FlowPlanner.state;
  }

  function getUtils() {
    return FlowPlanner.utils;
  }

  function getStorage() {
    return FlowPlanner.storage;
  }

  function tasksForDate(ds) {
    const state = getState();
    const today = getUtils().todayStr();
    const out = [];

    for (const t of state.tasks) {
      if (t.recurrence && t.recurrence.type && t.recurrence.type !== 'none') {
        if (occursOn(t, ds)) out.push(getRecurringInstance(t, ds));
      } else if (computeDisplayDate(t, today) === ds) {
        out.push(t);
      }
    }

    const pw = { iu: 0, inu: 1, uni: 2, nn: 3 };
    out.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = pw[a.priority] ?? 9;
      const pb = pw[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return (a.order || 0) - (b.order || 0);
    });

    return out;
  }

  function computeDisplayDate(t, today) {
    if (t.done) return t.due;
    if (!t.due) return today;
    if (t.due < today) return today;
    return t.due;
  }

  function occursOn(t, ds) {
    const rec = t.recurrence;
    if (!rec || rec.type === 'none') return false;

    const start = t.due;
    if (!start || ds < start) return false;

    const d0 = getUtils().fromYmd(start);
    const d1 = getUtils().fromYmd(ds);
    const iv = Math.max(1, parseInt(rec.interval || 1, 10));

    if (rec.type === 'daily') {
      const diff = Math.round((d1 - d0) / 86400000);
      return diff >= 0 && diff % iv === 0;
    }

    if (rec.type === 'weekly') {
      const diff = Math.round((d1 - d0) / 86400000);
      if (diff < 0 || diff % 7 !== 0) return false;
      return diff / 7 % iv === 0;
    }

    if (rec.type === 'monthly') {
      if (d1.getDate() !== d0.getDate()) return false;
      const m = (d1.getFullYear() - d0.getFullYear()) * 12 + (d1.getMonth() - d0.getMonth());
      return m >= 0 && m % iv === 0;
    }

    return false;
  }

  function getRecurringInstance(t, ds) {
    if (!t.recurrence.completions) t.recurrence.completions = {};
    const done = !!t.recurrence.completions[ds];

    return {
      id: t.id + '#' + ds,
      parentId: t.id,
      instanceDate: ds,
      isRecurringInstance: true,
      title: t.title,
      desc: t.desc,
      due: ds,
      priority: t.priority,
      done,
      order: t.order || 0,
      recurrence: t.recurrence,
      goalId: t.goalId
    };
  }

  function toggleTaskDone(ref) {
    const state = getState();

    if (ref.isRecurringInstance) {
      const parent = state.tasks.find(function (x) {
        return x.id === ref.parentId;
      });
      if (!parent) return;
      if (!parent.recurrence.completions) parent.recurrence.completions = {};
      const d = ref.instanceDate;
      if (parent.recurrence.completions[d]) delete parent.recurrence.completions[d];
      else parent.recurrence.completions[d] = true;
    } else {
      const t = state.tasks.find(function (x) {
        return x.id === ref.id;
      });
      if (!t) return;
      t.done = !t.done;
      t.completedOn = t.done ? getUtils().todayStr() : null;
      if (t.done && t.due && t.due < getUtils().todayStr()) t.due = getUtils().todayStr();
    }

    getStorage().save();
  }

  function eventsForDate(ds) {
    return getState().events
      .filter(function (e) {
        return e.date === ds;
      })
      .sort(function (a, b) {
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
  }

  function goalTaskStats(goalId) {
    const tasks = getState().tasks.filter(function (t) {
      return t.goalId === goalId && (!t.recurrence || t.recurrence.type === 'none');
    });
    const done = tasks.filter(function (t) {
      return t.done;
    }).length;
    return { total: tasks.length, done };
  }

  function getTaskById(taskId) {
    return getState().tasks.find(function (x) {
      return x.id === taskId;
    }) || null;
  }

  function getEventById(eventId) {
    return getState().events.find(function (x) {
      return x.id === eventId;
    }) || null;
  }

  function getGoalById(goalId) {
    return getState().goals.find(function (x) {
      return x.id === goalId;
    }) || null;
  }

  function saveTask(data, editingTaskId, editingPriority) {
    const state = getState();
    const title = data.title.trim();
    const desc = data.desc.trim();
    const due = data.due || getUtils().todayStr();
    const recType = data.recType;
    const recInterval = Math.max(1, parseInt(data.recInterval || 1, 10));
    const recurrence = recType === 'none'
      ? { type: 'none' }
      : { type: recType, interval: recInterval, completions: {} };
    const goalId = data.goalId || null;

    if (editingTaskId) {
      const t = getTaskById(editingTaskId);
      if (t) {
        const oldComp = t.recurrence && t.recurrence.completions;
        t.title = title;
        t.desc = desc;
        t.due = due;
        t.priority = editingPriority;
        t.recurrence = recurrence;
        t.goalId = goalId;
        if (recurrence.type !== 'none' && oldComp && t.recurrence.type === recType) {
          t.recurrence.completions = oldComp;
        }
      }
    } else {
      const maxOrder = state.tasks.reduce(function (m, t) {
        return Math.max(m, t.order || 0);
      }, 0);
      state.tasks.push({
        id: getUtils().uid(),
        title,
        desc,
        due,
        priority: editingPriority,
        done: false,
        completedOn: null,
        createdAt: getUtils().todayStr(),
        recurrence,
        order: maxOrder + 1,
        goalId
      });
    }

    getStorage().save();
  }

  function deleteTask(taskId) {
    const state = getState();
    state.tasks = state.tasks.filter(function (t) {
      return t.id !== taskId;
    });
    getStorage().save();
  }

  function saveEvent(data, editingEventId) {
    const state = getState();
    const title = data.title.trim();
    const desc = data.desc.trim();
    const date = data.date || getUtils().todayStr();
    const startTime = data.startTime || '';
    const endTime = data.endTime || '';

    if (editingEventId) {
      const e = getEventById(editingEventId);
      if (e) {
        e.title = title;
        e.desc = desc;
        e.date = date;
        e.startTime = startTime;
        e.endTime = endTime;
      }
    } else {
      state.events.push({
        id: getUtils().uid(),
        title,
        desc,
        date,
        startTime,
        endTime,
        createdAt: getUtils().todayStr()
      });
    }

    getStorage().save();
  }

  function deleteEvent(eventId) {
    const state = getState();
    state.events = state.events.filter(function (e) {
      return e.id !== eventId;
    });
    getStorage().save();
  }

  function saveGoal(data, editingGoalId) {
    const state = getState();
    const title = data.title.trim();
    const desc = data.desc.trim();
    const targetDate = data.targetDate || '';

    if (editingGoalId) {
      const g = getGoalById(editingGoalId);
      if (g) {
        g.title = title;
        g.desc = desc;
        g.targetDate = targetDate;
      }
    } else {
      state.goals.push({
        id: getUtils().uid(),
        title,
        desc,
        targetDate,
        status: 'active',
        createdAt: getUtils().todayStr()
      });
    }

    getStorage().save();
  }

  function deleteGoal(goalId) {
    const state = getState();
    state.tasks.forEach(function (t) {
      if (t.goalId === goalId) t.goalId = null;
    });
    state.goals = state.goals.filter(function (g) {
      return g.id !== goalId;
    });
    getStorage().save();
  }

  function toggleGoalStatus(goalId) {
    const g = getGoalById(goalId);
    if (!g) return;
    g.status = g.status === 'active' ? 'completed' : 'active';
    getStorage().save();
  }

  function persistTaskOrder(taskRefs) {
    const state = getState();
    let i = 0;

    taskRefs.forEach(function (ref) {
      const task = ref.parentId
        ? state.tasks.find(function (x) {
            return x.id === ref.parentId;
          })
        : state.tasks.find(function (x) {
            return x.id === ref.id;
          });

      if (task) task.order = i++;
    });

    getStorage().save();
  }

  FlowPlanner.planner = {
    tasksForDate,
    computeDisplayDate,
    occursOn,
    getRecurringInstance,
    toggleTaskDone,
    eventsForDate,
    goalTaskStats,
    getTaskById,
    getEventById,
    getGoalById,
    saveTask,
    deleteTask,
    saveEvent,
    deleteEvent,
    saveGoal,
    deleteGoal,
    toggleGoalStatus,
    persistTaskOrder
  };
})();
