(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  function $(id) {
    return document.getElementById(id);
  }

  function getState() {
    return FlowPlanner.state;
  }

  function getUi() {
    return FlowPlanner.ui;
  }

  function getUtils() {
    return FlowPlanner.utils;
  }

  function getPlanner() {
    return FlowPlanner.planner;
  }

  function getRendering() {
    return FlowPlanner.rendering;
  }

  function populateGoalSelect(selectedId) {
    const sel = $('taskGoal');
    sel.innerHTML = '<option value="">— No goal —</option>';
    getState().goals.filter(function (g) {
      return g.status === 'active';
    }).forEach(function (g) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.title;
      if (g.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function openTaskModal(taskId, defaultDate) {
    const ui = getUi();
    ui.editingTaskId = taskId;
    const t = taskId ? getPlanner().getTaskById(taskId) : null;
    $('taskModalTitle').textContent = t ? 'Edit Task' : 'New Task';
    $('taskTitle').value = t ? t.title : '';
    $('taskDesc').value = t ? (t.desc || '') : '';
    $('taskDue').value = t ? (t.due || '') : (defaultDate || getUtils().todayStr());
    ui.editingPriority = t ? t.priority : 'inu';
    refreshPrioritySelection();
    populateGoalSelect(t ? t.goalId : null);
    const rec = t && t.recurrence ? t.recurrence : { type: 'none', interval: 1 };
    $('recType').value = rec.type || 'none';
    $('recInterval').value = rec.interval || 1;
    updateRecUnitLabel();
    $('deleteTaskBtn').style.display = t ? '' : 'none';
    $('taskModal').classList.add('active');
    setTimeout(function () {
      $('taskTitle').focus();
    }, 50);
  }

  function closeTaskModal() {
    $('taskModal').classList.remove('active');
    getUi().editingTaskId = null;
  }

  function refreshPrioritySelection() {
    document.querySelectorAll('.prio-opt').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.prio === getUi().editingPriority);
    });
  }

  function updateRecUnitLabel() {
    const v = $('recType').value;
    const m = { none: '', daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)' };
    $('recUnitLabel').textContent = m[v] || '';
    $('recInterval').disabled = (v === 'none');
  }

  function saveTaskFromModal() {
    const title = $('taskTitle').value.trim();
    if (!title) {
      $('taskTitle').focus();
      return;
    }

    getPlanner().saveTask({
      title,
      desc: $('taskDesc').value.trim(),
      due: $('taskDue').value || getUtils().todayStr(),
      recType: $('recType').value,
      recInterval: Math.max(1, parseInt($('recInterval').value || 1, 10)),
      goalId: $('taskGoal').value || null
    }, getUi().editingTaskId, getUi().editingPriority);

    closeTaskModal();
    getRendering().renderAll();
  }

  function deleteCurrentTask() {
    const taskId = getUi().editingTaskId;
    if (!taskId) return;
    if (!confirm('Delete this task?')) return;
    getPlanner().deleteTask(taskId);
    closeTaskModal();
    getRendering().renderAll();
  }

  function openEventModal(eventId, defaultDate) {
    const ui = getUi();
    ui.editingEventId = eventId;
    const e = eventId ? getPlanner().getEventById(eventId) : null;
    $('eventModalTitle').textContent = e ? 'Edit Event' : 'New Event';
    $('eventTitle').value = e ? e.title : '';
    $('eventDesc').value = e ? (e.desc || '') : '';
    $('eventDate').value = e ? e.date : (defaultDate || getUtils().todayStr());
    $('eventStart').value = e ? (e.startTime || '') : '';
    $('eventEnd').value = e ? (e.endTime || '') : '';
    $('deleteEventBtn').style.display = e ? '' : 'none';
    $('eventModal').classList.add('active');
    setTimeout(function () {
      $('eventTitle').focus();
    }, 50);
  }

  function closeEventModal() {
    $('eventModal').classList.remove('active');
    getUi().editingEventId = null;
  }

  function saveEventFromModal() {
    const title = $('eventTitle').value.trim();
    if (!title) {
      $('eventTitle').focus();
      return;
    }

    getPlanner().saveEvent({
      title,
      desc: $('eventDesc').value.trim(),
      date: $('eventDate').value || getUtils().todayStr(),
      startTime: $('eventStart').value || '',
      endTime: $('eventEnd').value || ''
    }, getUi().editingEventId);

    closeEventModal();
    getRendering().renderAll();
  }

  function deleteCurrentEvent() {
    const eventId = getUi().editingEventId;
    if (!eventId) return;
    if (!confirm('Delete this event?')) return;
    getPlanner().deleteEvent(eventId);
    closeEventModal();
    getRendering().renderAll();
  }

  function openGoalModal(goalId) {
    const ui = getUi();
    ui.editingGoalId = goalId;
    const g = goalId ? getPlanner().getGoalById(goalId) : null;
    $('goalModalTitle').textContent = g ? 'Edit Goal' : 'New Goal';
    $('goalTitle').value = g ? g.title : '';
    $('goalDesc').value = g ? (g.desc || '') : '';
    $('goalTarget').value = g ? (g.targetDate || '') : '';
    $('deleteGoalBtn').style.display = g ? '' : 'none';
    const completeRow = $('goalCompleteRow');
    const toggleBtn = $('toggleGoalStatusBtn');

    if (g) {
      completeRow.style.display = '';
      toggleBtn.textContent = g.status === 'active' ? 'Mark as completed ✓' : 'Reopen goal ↩';
      toggleBtn.style.color = g.status === 'active' ? 'var(--goal-green)' : 'var(--text-dim)';
    } else {
      completeRow.style.display = 'none';
    }

    $('goalModal').classList.add('active');
    setTimeout(function () {
      $('goalTitle').focus();
    }, 50);
  }

  function closeGoalModal() {
    $('goalModal').classList.remove('active');
    getUi().editingGoalId = null;
  }

  function saveGoalFromModal() {
    const title = $('goalTitle').value.trim();
    if (!title) {
      $('goalTitle').focus();
      return;
    }

    getPlanner().saveGoal({
      title,
      desc: $('goalDesc').value.trim(),
      targetDate: $('goalTarget').value || ''
    }, getUi().editingGoalId);

    closeGoalModal();
    getRendering().renderAll();
  }

  function deleteCurrentGoal() {
    const goalId = getUi().editingGoalId;
    if (!goalId) return;
    if (!confirm('Delete this goal? Tasks linked to it will be unlinked.')) return;
    getPlanner().deleteGoal(goalId);
    closeGoalModal();
    getRendering().renderAll();
  }

  function toggleCurrentGoalStatus() {
    const goalId = getUi().editingGoalId;
    if (!goalId) return;
    getPlanner().toggleGoalStatus(goalId);
    closeGoalModal();
    getRendering().renderAll();
  }

  function isAnyModalOpen() {
    return $('taskModal').classList.contains('active') ||
      $('eventModal').classList.contains('active') ||
      $('goalModal').classList.contains('active');
  }

  function closeAllModals() {
    closeTaskModal();
    closeEventModal();
    closeGoalModal();
  }

  FlowPlanner.modals = {
    populateGoalSelect,
    openTaskModal,
    closeTaskModal,
    refreshPrioritySelection,
    updateRecUnitLabel,
    saveTaskFromModal,
    deleteCurrentTask,
    openEventModal,
    closeEventModal,
    saveEventFromModal,
    deleteCurrentEvent,
    openGoalModal,
    closeGoalModal,
    saveGoalFromModal,
    deleteCurrentGoal,
    toggleCurrentGoalStatus,
    isAnyModalOpen,
    closeAllModals
  };
})();
