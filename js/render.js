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

  function getCalendar() {
    return FlowPlanner.calendar;
  }

  function getModals() {
    return FlowPlanner.modals;
  }

  function getStorage() {
    return FlowPlanner.storage;
  }

  function getConstants() {
    return FlowPlanner.constants;
  }

  function renderAll() {
    updateHeader();
    const currentScreen = getUi().currentScreen;
    const currentCalView = getCalendar().getCurrentCalView();

    if (currentScreen === 'today') renderToday();
    else if (currentScreen === 'calendar') {
      if (currentCalView === 'month') renderMonth();
      else if (currentCalView === 'week') renderWeek();
      else if (currentCalView === 'three') renderThreeDay();
      else renderDay();
    } else if (currentScreen === 'goals') renderGoals();
    else if (currentScreen === 'reviews') renderReviews();
    else if (currentScreen === 'profile') renderProfile();
  }

  function updateHeader() {
    const state = getState();
    const ui = getUi();
    const currentDate = getCalendar().getCurrentDate();
    const currentCalView = getCalendar().getCurrentCalView();
    const scope = $('scopeTitle');
    const sub = $('scopeSub');
    const MONTHS = getConstants().MONTHS;
    const WEEKDAYS_FULL = getConstants().WEEKDAYS_FULL;

    if (ui.currentScreen === 'today') {
      scope.textContent = 'Today';
      sub.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    } else if (ui.currentScreen === 'goals') {
      scope.textContent = 'Goals';
      sub.textContent = `${state.goals.filter(function (g) { return g.status === 'active'; }).length} active`;
    } else if (ui.currentScreen === 'reviews') {
      scope.textContent = 'Reviews';
      sub.textContent = 'Progress over time';
    } else if (ui.currentScreen === 'profile') {
      scope.textContent = 'Profile';
      sub.textContent = 'Account, sync & backup';
    } else if (ui.currentScreen === 'calendar') {
      if (currentCalView === 'month') {
        scope.textContent = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        sub.textContent = 'Month view';
      } else if (currentCalView === 'week') {
        const s = getUtils().startOfWeek(currentDate);
        const e = getUtils().addDays(s, 6);
        scope.textContent = `${MONTHS[s.getMonth()].slice(0, 3)} ${s.getDate()} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getDate()}`;
        sub.textContent = `Week of ${s.toLocaleDateString()}`;
      } else if (currentCalView === 'three') {
        const e = getUtils().addDays(currentDate, 2);
        scope.textContent = `${MONTHS[currentDate.getMonth()].slice(0, 3)} ${currentDate.getDate()} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getDate()}`;
        sub.textContent = '3-day view';
      } else {
        scope.textContent = `${WEEKDAYS_FULL[currentDate.getDay()]} ${currentDate.getDate()}`;
        sub.textContent = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
      }
    }

    document.querySelectorAll('.view-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === currentCalView);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + currentCalView);
    });
    document.querySelectorAll('.bnav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.screen === ui.currentScreen);
    });
    document.body.className = 'screen-' + ui.currentScreen;
    $('fab').classList.toggle('fab-hidden', ui.currentScreen === 'goals' || ui.currentScreen === 'reviews' || ui.currentScreen === 'profile');
  }

  function setScreen(screen) {
    if (!getConstants().SCREENS.includes(screen)) return;
    getUi().currentScreen = screen;
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.toggle('active', el.id === 'screen-' + screen);
    });
    if (screen === 'calendar') {
      const currentCalView = getCalendar().getCurrentCalView();
      document.querySelectorAll('.view').forEach(function (v) {
        v.classList.toggle('active', v.id === 'view-' + currentCalView);
      });
    }
    renderAll();
  }

  function renderToday() {
    const state = getState();
    const root = $('screen-today');
    const ds = getUtils().todayStr();
    const allTasks = getPlanner().tasksForDate(ds);
    const todayTasks = allTasks.filter(function (t) {
      return !t.done && (!t.lastCarriedDate || t.due === ds);
    });
    const overdueCarried = allTasks.filter(function (t) {
      return !t.done && t.lastCarriedDate && t.due < ds;
    });
    const upcomingDays = [];

    for (let i = 1; i <= 7; i++) {
      const d = getUtils().addDays(new Date(), i);
      const dd = getUtils().ymd(d);
      const dt = state.tasks.filter(function (t) {
        return t.due === dd && !t.done && (!t.recurrence || t.recurrence.type === 'none');
      });
      if (dt.length > 0) upcomingDays.push({ date: d, dateStr: dd, tasks: dt });
    }

    const todayEvents = getPlanner().eventsForDate(ds);
    const note = state.notes[ds] || '';
    const WEEKDAYS_FULL = getConstants().WEEKDAYS_FULL;
    const MONTHS = getConstants().MONTHS;

    let html = `<div class="day-view">`;

    if (overdueCarried.length > 0) {
      html += `<div class="section">
        <h3>Overdue <span class="count-pill" style="background:rgba(255,93,107,0.2);color:var(--p-iu);">${overdueCarried.length}</span></h3>
        <div class="task-list">${overdueCarried.map(function (t) { return taskItemHtml(t, false); }).join('')}</div>
      </div>`;
    }

    html += `<div class="section">
      <h3>Today's tasks <span class="count-pill">${allTasks.filter(function (t) { return !t.done; }).length} open</span></h3>
      ${todayTasks.length === 0 && overdueCarried.length === 0
        ? `<div class="empty-state">No tasks yet. Tap + to add one.</div>`
        : todayTasks.length > 0
          ? `<div class="task-list" id="todayTaskList">${todayTasks.map(function (t) { return taskItemHtml(t, false); }).join('')}</div>`
          : ''}
      <button class="add-task-btn today-add-task">+ Add task</button>
    </div>`;

    html += `<div class="section">
      <h3>Events <span class="count-pill">${todayEvents.length}</span></h3>
      ${todayEvents.length === 0
        ? `<div class="empty-state" style="padding:8px 0 4px;">No events scheduled</div>`
        : `<div class="event-list">${todayEvents.map(function (e) { return eventItemHtml(e); }).join('')}</div>`}
      <button class="add-event-btn today-add-event">+ Add event</button>
    </div>`;

    html += `<div class="section">
      <h3>Notes</h3>
      <textarea class="notes-area" id="notesArea" placeholder="Jot down anything for today…">${getUtils().escapeHtml(note)}</textarea>
    </div>`;

    if (upcomingDays.length > 0) {
      html += `<div class="section"><h3>Upcoming — next 7 days</h3>`;
      for (const entry of upcomingDays) {
        html += `<div style="margin-bottom:10px;">
          <div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:5px;">
            ${WEEKDAYS_FULL[entry.date.getDay()]} ${entry.date.getDate()} ${MONTHS[entry.date.getMonth()].slice(0, 3)}
          </div>
          <div class="task-list">${entry.tasks.slice(0, 3).map(function (t) { return taskItemHtml(t, true); }).join('')}${entry.tasks.length > 3 ? `<div class="empty-state" style="padding:4px;">+${entry.tasks.length - 3} more</div>` : ''}</div>
        </div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    root.innerHTML = html;

    const ta = $('notesArea');
    if (ta) {
      ta.addEventListener('input', getUtils().debounce(function () {
        const v = ta.value;
        const st = getState();
        if (!st.notesMeta) st.notesMeta = {};
        if (v && v.trim()) {
          st.notes[ds] = v;
          st.notesMeta[ds] = { updatedAt: new Date().toISOString() };
        } else {
          delete st.notes[ds];
          st.notesMeta[ds] = { updatedAt: new Date().toISOString(), deleted: true };
        }
        getStorage().save();
      }, 300));
    }

    root.querySelectorAll('.today-add-task').forEach(function (b) {
      b.addEventListener('click', function () {
        getModals().openTaskModal(null, ds);
      });
    });
    root.querySelectorAll('.today-add-event').forEach(function (b) {
      b.addEventListener('click', function () {
        getModals().openEventModal(null, ds);
      });
    });
    attachTaskListEvents(root);
    attachEventListEvents(root);
  }

  function renderMonth() {
    const state = getState();
    const currentDate = getCalendar().getCurrentDate();
    const root = $('view-month');
    const first = getUtils().startOfMonth(currentDate);
    const gridStart = getUtils().startOfWeek(first);
    const todayY = getUtils().todayStr();
    const currentMonth = currentDate.getMonth();
    const WEEKDAYS = getConstants().WEEKDAYS;

    let html = `<div class="month-weekdays">${WEEKDAYS.map(function (w) { return `<div>${w}</div>`; }).join('')}</div><div class="month-grid">`;

    for (let i = 0; i < 42; i++) {
      const d = getUtils().addDays(gridStart, i);
      const ds = getUtils().ymd(d);
      const inMonth = d.getMonth() === currentMonth;
      const isTod = ds === todayY;
      const dayTasks = getPlanner().tasksForDate(ds);
      const dayEvents = getPlanner().eventsForDate(ds);
      const note = state.notes[ds];
      const prioPresent = new Set();
      let incomplete = 0;

      for (const t of dayTasks) {
        if (!t.done) {
          prioPresent.add(t.priority);
          incomplete++;
        }
      }

      const dotsHtml = [...prioPresent].map(function (p) {
        return `<span class="dot ${p}"></span>`;
      }).join('') +
        (dayEvents.length > 0 ? '<span class="dot event"></span>' : '') +
        (note && note.trim() ? '<span class="dot note"></span>' : '');

      html += `<div class="month-cell ${inMonth ? '' : 'other-month'} ${isTod ? 'today' : ''}" data-date="${ds}">
        <span class="day-num">${d.getDate()}</span>
        <div class="dots">${dotsHtml}</div>
        ${incomplete > 0 ? `<div class="count">${incomplete}</div>` : ''}
      </div>`;
    }

    html += `</div>
    <div class="month-legend">
      <div class="legend-item"><span class="dot iu"></span> I&amp;U</div>
      <div class="legend-item"><span class="dot inu"></span> Important</div>
      <div class="legend-item"><span class="dot uni"></span> Urgent</div>
      <div class="legend-item"><span class="dot nn"></span> Low</div>
      <div class="legend-item"><span class="dot event"></span> Event</div>
      <div class="legend-item"><span class="dot note"></span> Note</div>
    </div>`;

    root.innerHTML = html;
    root.querySelectorAll('.month-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        getCalendar().setCurrentDate(getUtils().fromYmd(cell.dataset.date));
        FlowPlanner.actions.setCalView('day');
      });
    });
  }

  function renderWeek() {
    renderMultiDay('week', getUtils().startOfWeek(getCalendar().getCurrentDate()), 7);
  }

  function renderThreeDay() {
    renderMultiDay('three', getUtils().startOfDay(getCalendar().getCurrentDate()), 3);
  }

  function renderMultiDay(kind, start, count) {
    const state = getState();
    const root = $('view-' + kind);
    const today = getUtils().todayStr();
    const WEEKDAYS_FULL = getConstants().WEEKDAYS_FULL;
    const MONTHS = getConstants().MONTHS;
    let html = `<div class="multi-day ${kind}">`;

    for (let i = 0; i < count; i++) {
      const d = getUtils().addDays(start, i);
      const ds = getUtils().ymd(d);
      const isTod = ds === today;
      const tasks = getPlanner().tasksForDate(ds);
      const events = getPlanner().eventsForDate(ds);
      const note = state.notes[ds] || '';
      const tasksHtml = tasks.length === 0
        ? `<div class="empty-state" style="padding:8px;">No tasks</div>`
        : `<div class="task-list">${tasks.slice(0, 5).map(function (t) { return taskItemHtml(t, true); }).join('')}${tasks.length > 5 ? `<div class="empty-state" style="padding:4px;">+${tasks.length - 5} more</div>` : ''}</div>`;
      const eventsHtml = events.length > 0
        ? `<div class="event-list">${events.slice(0, 2).map(function (e) { return eventItemHtml(e); }).join('')}</div>`
        : '';
      const notePreview = note.trim()
        ? `<div style="font-size:12px;color:var(--text-dim);margin-top:4px;">📝 ${getUtils().escapeHtml(note.trim().slice(0, 60))}${note.length > 60 ? '…' : ''}</div>`
        : '';

      html += `<div class="day-card ${isTod ? 'today' : ''}" data-date="${ds}">
        <div class="day-card-header">
          <div><div class="dow">${WEEKDAYS_FULL[d.getDay()]}</div><div class="dnum">${d.getDate()}</div></div>
          <button class="open-day" data-open="${ds}">Open →</button>
        </div>
        ${notePreview}${eventsHtml}${tasksHtml}
      </div>`;
    }

    html += `</div>`;
    root.innerHTML = html;
    root.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        getCalendar().setCurrentDate(getUtils().fromYmd(b.dataset.open));
        FlowPlanner.actions.setCalView('day');
      });
    });
    attachTaskListEvents(root);
    attachEventListEvents(root);
  }

  function renderDay() {
    const state = getState();
    const root = $('view-day');
    const currentDate = getCalendar().getCurrentDate();
    const ds = getUtils().ymd(currentDate);
    const isTod = ds === getUtils().todayStr();
    const tasks = getPlanner().tasksForDate(ds);
    const events = getPlanner().eventsForDate(ds);
    const note = state.notes[ds] || '';
    const MONTHS = getConstants().MONTHS;
    const WEEKDAYS_FULL = getConstants().WEEKDAYS_FULL;
    const fullDate = `${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
    const tasksHtml = tasks.length === 0
      ? `<div class="empty-state">No tasks yet. Tap + to add one.</div>`
      : `<div class="task-list" id="dayTaskList">${tasks.map(function (t) { return taskItemHtml(t, false); }).join('')}</div>`;
    const eventsHtml = events.length === 0
      ? `<div class="empty-state" style="padding:8px 0 4px;">No events</div>`
      : `<div class="event-list">${events.map(function (e) { return eventItemHtml(e); }).join('')}</div>`;

    root.innerHTML = `<div class="day-view">
      <div class="day-header-big ${isTod ? 'today' : ''}">
        <div class="dnum-big">${currentDate.getDate()}</div>
        <div class="info">
          <div class="dow-big">${WEEKDAYS_FULL[currentDate.getDay()]}${isTod ? ' · Today' : ''}</div>
          <div class="full-date">${fullDate}</div>
        </div>
      </div>
      <div class="section">
        <h3>Events <span class="count-pill">${events.length}</span></h3>
        ${eventsHtml}
        <button class="add-event-btn day-add-event">+ Add event</button>
      </div>
      <div class="section">
        <h3>Notes</h3>
        <textarea class="notes-area" id="notesAreaCal" placeholder="Jot down anything for this day…">${getUtils().escapeHtml(note)}</textarea>
      </div>
      <div class="section">
        <h3>Tasks <span class="count-pill">${tasks.filter(function (t) { return !t.done; }).length} open</span></h3>
        ${tasksHtml}
        <button class="add-task-btn day-add-task">+ Add task</button>
      </div>
    </div>`;

    const ta = $('notesAreaCal');
    if (ta) {
      ta.addEventListener('input', getUtils().debounce(function () {
        const v = ta.value;
        const st = getState();
        if (!st.notesMeta) st.notesMeta = {};
        if (v && v.trim()) {
          st.notes[ds] = v;
          st.notesMeta[ds] = { updatedAt: new Date().toISOString() };
        } else {
          delete st.notes[ds];
          st.notesMeta[ds] = { updatedAt: new Date().toISOString(), deleted: true };
        }
        getStorage().save();
      }, 300));
    }

    root.querySelectorAll('.day-add-task').forEach(function (b) {
      b.addEventListener('click', function () {
        getModals().openTaskModal(null, ds);
      });
    });
    root.querySelectorAll('.day-add-event').forEach(function (b) {
      b.addEventListener('click', function () {
        getModals().openEventModal(null, ds);
      });
    });
    attachTaskListEvents(root);
    attachEventListEvents(root);
    attachDragReorder(root);
  }

  function renderGoals() {
    const state = getState();
    const root = $('screen-goals');
    const activeGoals = state.goals.filter(function (g) {
      return g.status === 'active';
    });
    const doneGoals = state.goals.filter(function (g) {
      return g.status === 'completed';
    });
    let html = `<div class="goals-screen">`;

    if (state.goals.length === 0) {
      html += `<div class="empty-state" style="padding:40px 20px;">
        <div style="font-size:36px;margin-bottom:10px;">🎯</div>
        <div style="font-size:16px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No goals yet</div>
        <div style="font-size:13px;">Set a goal and link tasks to track your progress.</div>
      </div>`;
    } else {
      if (activeGoals.length > 0) {
        html += `<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:8px;">Active</div>`;
        for (const g of activeGoals) html += goalCardHtml(g);
      }
      if (doneGoals.length > 0) {
        html += `<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:14px 0 8px;">Completed</div>`;
        for (const g of doneGoals) html += goalCardHtml(g);
      }
    }

    html += `<button class="add-goal-btn" id="addGoalBtn">+ New goal</button></div>`;
    root.innerHTML = html;
    $('addGoalBtn').addEventListener('click', function () {
      getModals().openGoalModal(null);
    });
    root.querySelectorAll('.goal-card').forEach(function (card) {
      card.addEventListener('click', function () {
        getModals().openGoalModal(card.dataset.goalId);
      });
    });
  }

  function goalCardHtml(g) {
    const stats = getPlanner().goalTaskStats(g.id);
    const pct = stats.total === 0 ? 0 : Math.round(stats.done / stats.total * 100);
    const targetLabel = g.targetDate ? `Target: ${g.targetDate}` : 'No target date';

    return `<div class="goal-card" data-goal-id="${g.id}">
      <div class="goal-card-header">
        <div class="goal-name">${getUtils().escapeHtml(g.title)}</div>
        <div class="goal-status-badge ${g.status === 'completed' ? 'done' : ''}">${g.status === 'completed' ? 'Done' : 'Active'}</div>
      </div>
      <div class="goal-meta">${stats.total} task${stats.total !== 1 ? 's' : ''} · ${targetLabel}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-labels"><span>${pct}% complete</span><span>${stats.done} / ${stats.total} tasks done</span></div>
    </div>`;
  }

  function renderReviews() {
    const state = getState();
    const root = $('screen-reviews');
    const ui = getUi();
    const WEEKDAYS = getConstants().WEEKDAYS;
    let html = `<div class="reviews-screen">`;

    html += `<div class="review-type-toggle">
      <button class="rtab ${ui.reviewType === 'daily' ? 'active' : ''}" data-rtype="daily">Daily</button>
      <button class="rtab ${ui.reviewType === 'weekly' ? 'active' : ''}" data-rtype="weekly">Weekly</button>
    </div>`;

    if (ui.reviewType === 'daily') {
      const ds = getUtils().todayStr();
      const allDayTasks = getPlanner().tasksForDate(ds);
      const done = allDayTasks.filter(function (t) { return t.done; }).length;
      const created = allDayTasks.length;
      const rate = created === 0 ? 0 : Math.round(done / created * 100);
      const carried = allDayTasks.filter(function (t) { return !t.done && t.lastCarriedDate; }).length;
      const events = getPlanner().eventsForDate(ds).length;
      const trend = [];

      for (let i = 6; i >= 0; i--) {
        const d = getUtils().addDays(new Date(), -i);
        const dd = getUtils().ymd(d);
        const dt = getPlanner().tasksForDate(dd);
        const dc = dt.length === 0 ? 0 : Math.round(dt.filter(function (x) { return x.done; }).length / dt.length * 100);
        trend.push({ label: WEEKDAYS[d.getDay()].slice(0, 1), pct: dc, isToday: i === 0 });
      }

      const maxPct = Math.max.apply(null, [1].concat(trend.map(function (t) { return t.pct; })));

      html += `<div class="review-date-label">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>`;
      html += `<div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value good">${done}</div></div>
        <div class="stat-card"><div class="stat-label">Total tasks</div><div class="stat-value">${created}</div></div>
        <div class="stat-card"><div class="stat-label">Rate</div><div class="stat-value ${rate >= 70 ? 'good' : rate >= 40 ? 'warn' : 'danger'}">${rate}%</div></div>
        <div class="stat-card"><div class="stat-label">Carried over</div><div class="stat-value ${carried > 0 ? 'warn' : ''}">${carried}</div></div>
      </div>`;

      html += `<div class="trend-section"><h3>7-day completion</h3>
        <div class="trend-bars">${trend.map(function (t) { return `<div class="trend-bar ${t.isToday ? 'current' : ''}" style="height:${Math.max(4, Math.round(t.pct / maxPct * 60))}px"></div>`; }).join('')}</div>
        <div class="trend-labels">${trend.map(function (t) { return `<div class="trend-label">${t.label}</div>`; }).join('')}</div>
      </div>`;

      html += `<div class="review-rows">
        <div class="review-row"><span class="rl">Events today</span><span class="rv">${events}</span></div>
        <div class="review-row"><span class="rl">Tasks remaining</span><span class="rv">${created - done}</span></div>
        <div class="review-row"><span class="rl">Goals active</span><span class="rv">${state.goals.filter(function (g) { return g.status === 'active'; }).length}</span></div>
      </div>`;
    } else {
      const today = new Date();
      const weekStart = getUtils().startOfWeek(today);
      let weekDone = 0;
      let weekTotal = 0;
      let weekCarried = 0;
      let maxDayPct = 0;
      const days7 = [];

      for (let i = 0; i < 7; i++) {
        const d = getUtils().addDays(weekStart, i);
        const dd = getUtils().ymd(d);
        const dt = getPlanner().tasksForDate(dd);
        const dc = dt.filter(function (x) { return x.done; }).length;
        const pct = dt.length === 0 ? 0 : Math.round(dc / dt.length * 100);
        weekDone += dc;
        weekTotal += dt.length;
        weekCarried += dt.filter(function (x) { return !x.done && x.lastCarriedDate; }).length;
        days7.push({ label: WEEKDAYS[d.getDay()].slice(0, 1), pct, isToday: getUtils().isSameDay(d, today) });
        maxDayPct = Math.max(maxDayPct, pct);
      }

      const weekRate = weekTotal === 0 ? 0 : Math.round(weekDone / weekTotal * 100);
      const weekStartLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weekEndLabel = getUtils().addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      html += `<div class="review-date-label">${weekStartLabel} – ${weekEndLabel}</div>`;
      html += `<div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value good">${weekDone}</div></div>
        <div class="stat-card"><div class="stat-label">Total tasks</div><div class="stat-value">${weekTotal}</div></div>
        <div class="stat-card"><div class="stat-label">Rate</div><div class="stat-value ${weekRate >= 70 ? 'good' : weekRate >= 40 ? 'warn' : 'danger'}">${weekRate}%</div></div>
        <div class="stat-card"><div class="stat-label">Carried</div><div class="stat-value ${weekCarried > 0 ? 'warn' : ''}">${weekCarried}</div></div>
      </div>`;

      html += `<div class="trend-section"><h3>Daily completion this week</h3>
        <div class="trend-bars">${days7.map(function (t) { return `<div class="trend-bar ${t.isToday ? 'current' : ''}" style="height:${Math.max(4, Math.round(t.pct / Math.max(1, maxDayPct) * 60))}px"></div>`; }).join('')}</div>
        <div class="trend-labels">${days7.map(function (t) { return `<div class="trend-label">${t.label}</div>`; }).join('')}</div>
      </div>`;

      const goalsDone = state.goals.filter(function (g) { return g.status === 'completed'; }).length;
      html += `<div class="review-rows">
        <div class="review-row"><span class="rl">Goals active</span><span class="rv">${state.goals.filter(function (g) { return g.status === 'active'; }).length}</span></div>
        <div class="review-row"><span class="rl">Goals completed</span><span class="rv">${goalsDone}</span></div>
        <div class="review-row"><span class="rl">Total events this week</span><span class="rv">${days7.reduce(function (a, _unused, i) { return a + getPlanner().eventsForDate(getUtils().ymd(getUtils().addDays(weekStart, i))).length; }, 0)}</span></div>
      </div>`;
    }

    html += `</div>`;

    root.innerHTML = html;
    root.querySelectorAll('.rtab').forEach(function (b) {
      b.addEventListener('click', function () {
        getUi().reviewType = b.dataset.rtype;
        renderReviews();
      });
    });
  }

  /* ----------------------------------------------------------------------
   * Profile screen — Account, Cloud Sync, Backup & Restore, Settings, About
   * -------------------------------------------------------------------- */
  function renderProfile() {
    const root = $('screen-profile');
    if (!root) return;

    const syncStatus = (FlowPlanner.sync && FlowPlanner.sync.getStatus && FlowPlanner.sync.getStatus()) || { state: 'signed-out' };
    const cachedUserId = FlowPlanner.auth && FlowPlanner.auth.getCurrentUserId && FlowPlanner.auth.getCurrentUserId();
    const signedIn = !!cachedUserId;
    const lastSyncLabel = syncStatus.lastSyncedAt
      ? new Date(syncStatus.lastSyncedAt).toLocaleString()
      : 'never';

    let html = `<div class="profile-page">`;

    html += `
    <div class="profile-section">
      <h3>Account &amp; Cloud Sync</h3>
      <div class="sync-card">
        <div class="sync-card-row">
          <span class="sync-dot ${syncStatus.state}"></span>
          <div class="sync-card-text">
            <div class="sync-card-title" id="syncCardTitle">${signedIn ? 'Signed in' : 'Not signed in'}</div>
            <div class="sync-card-sub" id="syncCardSub">${signedIn
              ? 'Last sync: ' + lastSyncLabel + (syncStatus.message ? ' • ' + getUtils().escapeHtml(syncStatus.message) : '')
              : 'Sign in to keep your planner in sync across devices.'
            }</div>
          </div>
        </div>
        <div class="sync-card-actions">
          ${signedIn
            ? `<button class="btn btn-secondary" id="syncNowBtn">Sync Now</button>
               <button class="btn btn-secondary" id="logoutBtn">Log out</button>`
            : `<button class="btn btn-primary" id="signInBtn" style="width:100%;">Sign in / Create account</button>`}
        </div>
      </div>
    </div>`;

    html += `
    <div class="profile-section">
      <h3>Backup &amp; Restore</h3>
      <div class="profile-card">
        <button class="btn btn-secondary"
                onclick="exportBackup()"
                style="width:100%;margin-bottom:10px;">
          Export Backup
        </button>
        <button class="btn btn-secondary"
                onclick="document.getElementById('backupImport').click()"
                style="width:100%;">
          Import Backup
        </button>
        <input
          type="file"
          id="backupImport"
          accept=".json"
          onchange="importBackup(event)"
          style="display:none;"
        >
      </div>
    </div>`;

    html += `
    <div class="profile-section">
      <h3>Settings</h3>
      <div class="profile-card">
        <p>Settings will appear here in a future update.</p>
      </div>
    </div>`;

    html += `
    <div class="profile-section">
      <h3>About</h3>
      <div class="profile-card">
        <p>FLOW Planner</p>
        <p class="profile-version">Version ${getUtils().escapeHtml(FlowPlanner.version || '')}</p>
      </div>
    </div>`;

    html += `</div>`;

    root.innerHTML = html;

    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) signInBtn.addEventListener('click', function () {
      FlowPlanner.auth.openModal('signin');
    });
    const syncNowBtn = document.getElementById('syncNowBtn');
    if (syncNowBtn) syncNowBtn.addEventListener('click', async function () {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing…';
      try { await FlowPlanner.sync.pushNow(); }
      finally {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = 'Sync Now';
        renderProfile();
      }
    });
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async function () {
      if (!confirm('Log out? Your local data will remain on this device.')) return;
      await FlowPlanner.auth.signOut();
      renderProfile();
    });
  }

  function taskItemHtml(t, compact) {
    const state = getState();
    const PRIORITIES = getConstants().PRIORITIES;
    const isCarried = !t.done && !t.isRecurringInstance && t.due && t.due < getUtils().todayStr() && !!t.lastCarriedDate;
    const dueLabel = t.due ? formatDuePill(t) : '';
    const goal = t.goalId
      ? state.goals.find(function (g) { return g.id === t.goalId; })
      : null;

    return `<div class="task-item p-${t.priority} ${t.done ? 'done' : ''} ${isCarried ? 'carried' : ''} ${t.isRecurringInstance ? 'recurring-instance' : ''}"
         data-task-id="${t.id}" data-parent-id="${t.parentId || ''}" data-instance-date="${t.instanceDate || ''}"
         draggable="${compact ? 'false' : 'true'}">
      <button class="task-check ${t.done ? 'checked' : ''}" data-action="toggle" aria-label="Toggle done"></button>
      <div class="task-body" data-action="edit">
        <div class="task-title">${getUtils().escapeHtml(t.title)}</div>
        ${t.desc ? `<div class="task-desc">${getUtils().escapeHtml(t.desc)}</div>` : ''}
        <div class="task-meta">
          <span class="meta-pill">${(PRIORITIES[t.priority] || {}).short || '–'}</span>
          ${t.recurrence && t.recurrence.type && t.recurrence.type !== 'none' ? `<span class="meta-pill">⟳ ${t.recurrence.type}</span>` : ''}
          ${dueLabel}
          ${isCarried ? `<span class="meta-pill">carried</span>` : ''}
          ${goal ? `<span class="meta-pill goal-pill">🎯 ${getUtils().escapeHtml(goal.title.slice(0, 20))}${goal.title.length > 20 ? '…' : ''}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  function formatDuePill(t) {
    if (!t.due) return '';
    const today = getUtils().todayStr();
    const overdue = !t.done && t.due < today;
    if (t.due === today) return `<span class="meta-pill">today</span>`;
    return `<span class="meta-pill ${overdue ? 'due-overdue' : ''}">${t.due}</span>`;
  }

  function eventItemHtml(e) {
    const timeStr = e.startTime ? `${e.startTime}${e.endTime ? ' – ' + e.endTime : ''}` : 'All day';
    return `<div class="event-item" data-event-id="${e.id}">
      <div class="event-time">${timeStr}</div>
      <div class="event-body">
        <div class="event-title">${getUtils().escapeHtml(e.title)}</div>
        ${e.desc ? `<div class="event-meta">${getUtils().escapeHtml(e.desc)}</div>` : ''}
      </div>
    </div>`;
  }

  function attachTaskListEvents(scope) {
    scope.querySelectorAll('.task-item').forEach(function (el) {
      const ref = resolveTaskRef(el);
      el.querySelector('[data-action="toggle"]').addEventListener('click', function (e) {
        e.stopPropagation();
        getPlanner().toggleTaskDone(ref);
        renderAll();
      });
      const body = el.querySelector('[data-action="edit"]');
      if (body) {
        body.addEventListener('click', function () {
          if (ref.isRecurringInstance) getModals().openTaskModal(ref.parentId, null);
          else getModals().openTaskModal(ref.id, null);
        });
      }
    });
  }

  function attachEventListEvents(scope) {
    scope.querySelectorAll('.event-item').forEach(function (el) {
      el.addEventListener('click', function () {
        getModals().openEventModal(el.dataset.eventId, null);
      });
    });
  }

  function resolveTaskRef(el) {
    const id = el.dataset.taskId;
    const parentId = el.dataset.parentId;
    const instanceDate = el.dataset.instanceDate;
    if (parentId) return { id, parentId, instanceDate, isRecurringInstance: true };
    return { id };
  }

  function attachDragReorder(scope) {
    const list = scope.querySelector('#dayTaskList');
    if (!list) return;

    let dragEl = null;
    list.querySelectorAll('.task-item').forEach(function (item) {
      item.addEventListener('dragstart', function (e) {
        dragEl = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', function () {
        if (dragEl) dragEl.classList.remove('dragging');
        list.querySelectorAll('.drag-over').forEach(function (x) {
          x.classList.remove('drag-over');
        });
        dragEl = null;
        persistOrderFromDom(list);
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!dragEl || dragEl === item) return;
        list.querySelectorAll('.drag-over').forEach(function (x) {
          x.classList.remove('drag-over');
        });
        item.classList.add('drag-over');
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!dragEl || dragEl === item) return;
        const rect = item.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        if (after) item.parentNode.insertBefore(dragEl, item.nextSibling);
        else item.parentNode.insertBefore(dragEl, item);
      });
    });

    enableTouchReorder(list);
  }

  function persistOrderFromDom(list) {
    const refs = [];
    list.querySelectorAll('.task-item').forEach(function (el) {
      refs.push({
        id: el.dataset.taskId,
        parentId: el.dataset.parentId || null
      });
    });
    getPlanner().persistTaskOrder(refs);
  }

  function enableTouchReorder(list) {
    let dragging = null;
    let startY = 0;
    let longPressTimer = null;

    list.querySelectorAll('.task-item').forEach(function (item) {
      item.addEventListener('touchstart', function (e) {
        longPressTimer = setTimeout(function () {
          dragging = item;
          item.style.opacity = '0.7';
          item.style.transform = 'scale(1.02)';
          if (navigator.vibrate) navigator.vibrate(20);
          startY = e.touches[0].clientY;
        }, 350);
      }, { passive: true });

      item.addEventListener('touchmove', function (e) {
        if (!dragging) {
          clearTimeout(longPressTimer);
          return;
        }
        e.preventDefault();
        const y = e.touches[0].clientY;
        const dy = y - startY;
        dragging.style.transform = `translateY(${dy}px) scale(1.02)`;
        const siblings = Array.from(list.querySelectorAll('.task-item')).filter(function (x) {
          return x !== dragging;
        });
        for (const sibling of siblings) {
          const rect = sibling.getBoundingClientRect();
          if (y > rect.top && y < rect.bottom) {
            const after = y > rect.top + rect.height / 2;
            if (after) list.insertBefore(dragging, sibling.nextSibling);
            else list.insertBefore(dragging, sibling);
            startY = y;
            dragging.style.transform = 'translateY(0px) scale(1.02)';
            break;
          }
        }
      }, { passive: false });

      const end = function () {
        clearTimeout(longPressTimer);
        if (dragging) {
          dragging.style.opacity = '';
          dragging.style.transform = '';
          persistOrderFromDom(list);
          dragging = null;
        }
      };

      item.addEventListener('touchend', end);
      item.addEventListener('touchcancel', end);
    });
  }

  function showZoomHint(view) {
    const h = $('zoomHint');
    h.textContent = ({ month: 'Month', week: 'Week', three: '3-Day', day: 'Day' })[view];
    h.classList.add('show');
    clearTimeout(showZoomHint._t);
    showZoomHint._t = setTimeout(function () {
      h.classList.remove('show');
    }, 700);
  }

  FlowPlanner.rendering = {
    renderAll,
    updateHeader,
    setScreen,
    renderToday,
    renderMonth,
    renderWeek,
    renderThreeDay,
    renderDay,
    renderGoals,
    renderReviews,
    renderProfile,
    attachTaskListEvents,
    attachEventListEvents,
    attachDragReorder,
    showZoomHint
  };
})();
