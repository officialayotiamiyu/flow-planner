/* ===========================================================
   FLOW Planner v2.2 — Personal Productivity Calendar
   -----------------------------------------------------------
   Sprint 1 of the modular refactor:
     • Logic extracted from index.html into js/app.js
     • Styles extracted into style.css
     • Single application namespace (window.FlowPlanner)
     • No more loose globals (apart from FlowPlanner + the two
       backup helpers that are still referenced via inline
       onclick attributes generated inside renderReviews()).
     • Same UI · Same localStorage key (flow_app_v2) · Same PWA
       · Same Supabase integration.

   Architecture for upcoming sprints:
     FlowPlanner.state    — application data (persisted)
     FlowPlanner.ui       — runtime UI / view state (not persisted)
     FlowPlanner.init()   — bootstrap (load → carry forward → bind → render)
     FlowPlanner.render() — re-render the active screen

     Sprint 2  →  utils.js
     Sprint 3  →  storage.js
     Sprint 4  →  calendar.js
     Sprint 5  →  tasks.js, events.js
     Sprint 6  →  goals.js, reviews.js
     Sprint 7  →  auth.js, sync.js
   =========================================================== */

(function () {
  'use strict';

  /* -----------------------------------------------------------
     1. Application namespace
     -----------------------------------------------------------
     Everything the app exposes to the page lives here. Internal
     functions (defined below) operate on `state` and `ui` directly
     — the same object references that FlowPlanner.state / .ui hold.
     Mutating `state.tasks.push(...)` from anywhere therefore stays
     observable through FlowPlanner.state.tasks.
     ----------------------------------------------------------- */
  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  FlowPlanner.version = '2.2.0';

  // Persisted application data. Loaded from localStorage on init().
  FlowPlanner.state = {
    notes:  {},
    tasks:  [],
    events: [],
    goals:  [],
    meta:   { lastOpenDate: null, lastCarryDate: null }
  };

  // Transient UI / view state. Not persisted.
  FlowPlanner.ui = {
    currentDate:     null,   // set on init()
    currentCalView:  'day',
    currentScreen:   'today',
    editingTaskId:   null,
    editingPriority: 'inu',
    editingEventId:  null,
    editingGoalId:   null,
    reviewType:      'daily'
  };

  /* -----------------------------------------------------------
     2. Module-local aliases
     -----------------------------------------------------------
     The original v2 source used loose `let state`, `let editingTaskId`,
     etc. To keep this refactor minimally invasive (and therefore safe),
     we declare local bindings here that point at the FlowPlanner
     containers. The original function bodies are unchanged below.
     ----------------------------------------------------------- */
  const state = FlowPlanner.state;          // same object ref → mutations visible everywhere

  // The original code reassigns these flags as plain identifiers.
  // We keep them as module-local `let`s and sync to FlowPlanner.ui
  // before each render via syncUiSnapshot() so external code (e.g.
  // future devtools / sync module) can read them.
  let currentDate;                          // initialised after startOfDay is defined
  let currentCalView   = FlowPlanner.ui.currentCalView;
  let currentScreen    = FlowPlanner.ui.currentScreen;
  let editingTaskId    = FlowPlanner.ui.editingTaskId;
  let editingPriority  = FlowPlanner.ui.editingPriority;
  let editingEventId   = FlowPlanner.ui.editingEventId;
  let editingGoalId    = FlowPlanner.ui.editingGoalId;

  function syncUiSnapshot() {
    FlowPlanner.ui.currentDate     = currentDate;
    FlowPlanner.ui.currentCalView  = currentCalView;
    FlowPlanner.ui.currentScreen   = currentScreen;
    FlowPlanner.ui.editingTaskId   = editingTaskId;
    FlowPlanner.ui.editingPriority = editingPriority;
    FlowPlanner.ui.editingEventId  = editingEventId;
    FlowPlanner.ui.editingGoalId   = editingGoalId;
    FlowPlanner.ui.reviewType      = reviewType;
  }

  /* ===========================================================
     3. Original v2 application code (unchanged behaviour)
     =========================================================== */

const STORAGE_KEY = 'flow_app_v2';
const CAL_VIEWS = ['month','week','three','day'];
const SCREENS = ['today','calendar','goals','reviews'];
const PRIORITIES = {
  iu:  { label:'Important & Urgent', short:'I&U' },
  inu: { label:'Important, Not Urgent', short:'I' },
  uni: { label:'Urgent, Not Important', short:'U' },
  nn:  { label:'Neither', short:'–' }
};
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEKDAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];


/* ---------- Date utilities ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function ymd(d) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}
function fromYmd(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); }
function addDays(d,n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d,n) { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate()-x.getDay()); return x; }
function startOfMonth(d) { return new Date(d.getFullYear(),d.getMonth(),1); }
function isSameDay(a,b) { return ymd(a)===ymd(b); }
function todayStr() { return ymd(new Date()); }
function uid() { return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7); }
function escapeHtml(s) {
  return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function debounce(fn,ms) { let h; return function(...a) { clearTimeout(h); h=setTimeout(()=>fn.apply(this,a),ms); }; }
const $ = id => document.getElementById(id);

/* ---------- Persistence ---------- */
function save() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); } catch(e){} }
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = Object.assign(state,p);
      if (!state.notes) state.notes={};
      if (!state.tasks) state.tasks=[];
      if (!state.events) state.events=[];
      if (!state.goals) state.goals=[];
      if (!state.meta) state.meta={};
    }
  } catch(e){}
}

/* ---------- Task helpers ---------- */
function tasksForDate(ds) {
  const today = todayStr();
  const out = [];
  for (const t of state.tasks) {
    if (t.recurrence && t.recurrence.type && t.recurrence.type!=='none') {
      if (occursOn(t,ds)) out.push(getRecurringInstance(t,ds));
    } else {
      if (computeDisplayDate(t,today)===ds) out.push(t);
    }
  }
  const pw = {iu:0,inu:1,uni:2,nn:3};
  out.sort((a,b)=>{
    if (a.done!==b.done) return a.done?1:-1;
    const pa=pw[a.priority]??9, pb=pw[b.priority]??9;
    if (pa!==pb) return pa-pb;
    return (a.order||0)-(b.order||0);
  });
  return out;
}
function computeDisplayDate(t,today) {
  if (t.done) return t.due;
  if (!t.due) return today;
  if (t.due<today) return today;
  return t.due;
}
function occursOn(t,ds) {
  const rec=t.recurrence; if (!rec||rec.type==='none') return false;
  const start=t.due; if (!start||ds<start) return false;
  const d0=fromYmd(start), d1=fromYmd(ds);
  const iv=Math.max(1,parseInt(rec.interval||1,10));
  if (rec.type==='daily') { const diff=Math.round((d1-d0)/86400000); return diff>=0&&diff%iv===0; }
  if (rec.type==='weekly') { const diff=Math.round((d1-d0)/86400000); if(diff<0||diff%7!==0) return false; return (diff/7)%iv===0; }
  if (rec.type==='monthly') { if(d1.getDate()!==d0.getDate()) return false; const m=(d1.getFullYear()-d0.getFullYear())*12+(d1.getMonth()-d0.getMonth()); return m>=0&&m%iv===0; }
  return false;
}
function getRecurringInstance(t,ds) {
  if (!t.recurrence.completions) t.recurrence.completions={};
  const done=!!t.recurrence.completions[ds];
  return { id:t.id+'#'+ds, parentId:t.id, instanceDate:ds, isRecurringInstance:true, title:t.title, desc:t.desc, due:ds, priority:t.priority, done, order:t.order||0, recurrence:t.recurrence, goalId:t.goalId };
}
function toggleTaskDone(ref) {
  if (ref.isRecurringInstance) {
    const parent=state.tasks.find(x=>x.id===ref.parentId); if (!parent) return;
    if (!parent.recurrence.completions) parent.recurrence.completions={};
    const d=ref.instanceDate;
    if (parent.recurrence.completions[d]) delete parent.recurrence.completions[d];
    else parent.recurrence.completions[d]=true;
  } else {
    const t=state.tasks.find(x=>x.id===ref.id); if (!t) return;
    t.done=!t.done; t.completedOn=t.done?todayStr():null;
    if (t.done&&t.due&&t.due<todayStr()) t.due=todayStr();
  }
  save(); renderAll();
}
function runCarryForward() {
  const today = todayStr();
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

/* ---------- Event helpers ---------- */
function eventsForDate(ds) {
  return state.events.filter(e=>e.date===ds).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));
}

/* ---------- Goal helpers ---------- */
function goalTaskStats(goalId) {
  const tasks = state.tasks.filter(t=>t.goalId===goalId&&(!t.recurrence||t.recurrence.type==='none'));
  const done = tasks.filter(t=>t.done).length;
  return { total: tasks.length, done };
}

/* ===========================================================
   RENDERING
   =========================================================== */
function renderAll() {
  updateHeader();
  if (currentScreen==='today') renderToday();
  else if (currentScreen==='calendar') {
    if (currentCalView==='month') renderMonth();
    else if (currentCalView==='week') renderWeek();
    else if (currentCalView==='three') renderThreeDay();
    else renderDay();
  }
  else if (currentScreen==='goals') renderGoals();
  else if (currentScreen==='reviews') renderReviews();
}

function updateHeader() {
  const scope=$('scopeTitle'), sub=$('scopeSub');
  if (currentScreen==='today') {
    scope.textContent='Today'; sub.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  } else if (currentScreen==='goals') {
    scope.textContent='Goals'; sub.textContent=`${state.goals.filter(g=>g.status==='active').length} active`;
  } else if (currentScreen==='reviews') {
    scope.textContent='Reviews'; sub.textContent='Progress over time';
  } else if (currentScreen==='calendar') {
    if (currentCalView==='month') { scope.textContent=`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`; sub.textContent='Month view'; }
    else if (currentCalView==='week') {
      const s=startOfWeek(currentDate), e=addDays(s,6);
      scope.textContent=`${MONTHS[s.getMonth()].slice(0,3)} ${s.getDate()} – ${MONTHS[e.getMonth()].slice(0,3)} ${e.getDate()}`;
      sub.textContent=`Week of ${s.toLocaleDateString()}`;
    } else if (currentCalView==='three') {
      const e=addDays(currentDate,2);
      scope.textContent=`${MONTHS[currentDate.getMonth()].slice(0,3)} ${currentDate.getDate()} – ${MONTHS[e.getMonth()].slice(0,3)} ${e.getDate()}`;
      sub.textContent='3-day view';
    } else {
      scope.textContent=`${WEEKDAYS_FULL[currentDate.getDay()]} ${currentDate.getDate()}`;
      sub.textContent=`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
  }
  document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===currentCalView));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+currentCalView));
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.toggle('active',b.dataset.screen===currentScreen));
  document.body.className='screen-'+currentScreen;
  $('fab').classList.toggle('fab-hidden', currentScreen==='goals'||currentScreen==='reviews');
}

/* ---------- Today Screen ---------- */
function renderToday() {
  const root=$('screen-today');
  const ds=todayStr();
  const allTasks=tasksForDate(ds);
  const todayTasks=allTasks.filter(t=>!t.done&&(!t.lastCarriedDate||t.due===ds));
  const overdueCarried=allTasks.filter(t=>!t.done&&t.lastCarriedDate&&t.due<ds);
  // "important" = iu or inu, excluding overdue
  const importantTasks=allTasks.filter(t=>!t.done&&(t.priority==='iu'||t.priority==='inu')&&!t.lastCarriedDate);
  const upcomingDays=[];
  for (let i=1;i<=7;i++) {
    const d=addDays(new Date(),i);
    const dd=ymd(d);
    const dt=state.tasks.filter(t=>t.due===dd&&!t.done&&(!t.recurrence||t.recurrence.type==='none'));
    if (dt.length>0) upcomingDays.push({date:d,dateStr:dd,tasks:dt});
  }
  const todayEvents=eventsForDate(ds);
  const note=state.notes[ds]||'';

  let html=`<div class="day-view">`;

  // Overdue / carried
  if (overdueCarried.length>0) {
    html+=`<div class="section">
      <h3>Overdue <span class="count-pill" style="background:rgba(255,93,107,0.2);color:var(--p-iu);">${overdueCarried.length}</span></h3>
      <div class="task-list">${overdueCarried.map(t=>taskItemHtml(t,false)).join('')}</div>
    </div>`;
  }

  // Today's tasks
  html+=`<div class="section">
    <h3>Today's tasks <span class="count-pill">${allTasks.filter(t=>!t.done).length} open</span></h3>
    ${todayTasks.length===0&&overdueCarried.length===0?`<div class="empty-state">No tasks yet. Tap + to add one.</div>`:
      todayTasks.length>0?`<div class="task-list" id="todayTaskList">${todayTasks.map(t=>taskItemHtml(t,false)).join('')}</div>`:''}
    <button class="add-task-btn today-add-task">+ Add task</button>
  </div>`;

  // Events
  html+=`<div class="section">
    <h3>Events <span class="count-pill">${todayEvents.length}</span></h3>
    ${todayEvents.length===0?`<div class="empty-state" style="padding:8px 0 4px;">No events scheduled</div>`:
      `<div class="event-list">${todayEvents.map(e=>eventItemHtml(e)).join('')}</div>`}
    <button class="add-event-btn today-add-event">+ Add event</button>
  </div>`;

  // Notes
  html+=`<div class="section">
    <h3>Notes</h3>
    <textarea class="notes-area" id="notesArea" placeholder="Jot down anything for today…">${escapeHtml(note)}</textarea>
  </div>`;

  // Upcoming (next 7 days with tasks)
  if (upcomingDays.length>0) {
    html+=`<div class="section"><h3>Upcoming — next 7 days</h3>`;
    for (const {date,dateStr,tasks} of upcomingDays) {
      html+=`<div style="margin-bottom:10px;">
        <div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:5px;">
          ${WEEKDAYS_FULL[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()].slice(0,3)}
        </div>
        <div class="task-list">${tasks.slice(0,3).map(t=>taskItemHtml(t,true)).join('')}${tasks.length>3?`<div class="empty-state" style="padding:4px;">+${tasks.length-3} more</div>`:''}</div>
      </div>`;
    }
    html+=`</div>`;
  }

  html+=`</div>`;
  root.innerHTML=html;

  const ta=$('notesArea');
  if (ta) ta.addEventListener('input',debounce(()=>{ const v=ta.value; if(v&&v.trim()) state.notes[ds]=v; else delete state.notes[ds]; save(); },300));

  root.querySelectorAll('.today-add-task').forEach(b=>b.addEventListener('click',()=>openTaskModal(null,ds)));
  root.querySelectorAll('.today-add-event').forEach(b=>b.addEventListener('click',()=>openEventModal(null,ds)));
  attachTaskListEvents(root);
  attachEventListEvents(root);
}

/* ---------- Month View ---------- */
function renderMonth() {
  const root=$('view-month');
  const first=startOfMonth(currentDate);
  const gridStart=startOfWeek(first);
  const todayY=todayStr();
  const cm=currentDate.getMonth();
  let html=`<div class="month-weekdays">${WEEKDAYS.map(w=>`<div>${w}</div>`).join('')}</div><div class="month-grid">`;
  for (let i=0;i<42;i++) {
    const d=addDays(gridStart,i);
    const ds=ymd(d);
    const inMonth=d.getMonth()===cm;
    const isTod=ds===todayY;
    const dayTasks=tasksForDate(ds);
    const dayEvents=eventsForDate(ds);
    const note=state.notes[ds];
    const prioPresent=new Set(); let incomplete=0;
    for (const t of dayTasks) { if (!t.done) { prioPresent.add(t.priority); incomplete++; } }
    const dotsHtml=[...prioPresent].map(p=>`<span class="dot ${p}"></span>`).join('')+
      (dayEvents.length>0?'<span class="dot event"></span>':'')+
      (note&&note.trim()?'<span class="dot note"></span>':'');
    html+=`<div class="month-cell ${inMonth?'':'other-month'} ${isTod?'today':''}" data-date="${ds}">
      <span class="day-num">${d.getDate()}</span>
      <div class="dots">${dotsHtml}</div>
      ${incomplete>0?`<div class="count">${incomplete}</div>`:''}
    </div>`;
  }
  html+=`</div>
  <div class="month-legend">
    <div class="legend-item"><span class="dot iu"></span> I&amp;U</div>
    <div class="legend-item"><span class="dot inu"></span> Important</div>
    <div class="legend-item"><span class="dot uni"></span> Urgent</div>
    <div class="legend-item"><span class="dot nn"></span> Low</div>
    <div class="legend-item"><span class="dot event"></span> Event</div>
    <div class="legend-item"><span class="dot note"></span> Note</div>
  </div>`;
  root.innerHTML=html;
  root.querySelectorAll('.month-cell').forEach(cell=>{
    cell.addEventListener('click',()=>{ currentDate=fromYmd(cell.dataset.date); setCalView('day'); });
  });
}

/* ---------- Week & 3-Day Views ---------- */
function renderWeek() { renderMultiDay('week',startOfWeek(currentDate),7); }
function renderThreeDay() { renderMultiDay('three',startOfDay(currentDate),3); }
function renderMultiDay(kind,start,count) {
  const root=$('view-'+kind);
  const today=todayStr();
  let html=`<div class="multi-day ${kind}">`;
  for (let i=0;i<count;i++) {
    const d=addDays(start,i); const ds=ymd(d);
    const isTod=ds===today;
    const tasks=tasksForDate(ds); const events=eventsForDate(ds);
    const incomplete=tasks.filter(t=>!t.done).length;
    const note=state.notes[ds]||'';
    let tasksHtml=tasks.length===0?`<div class="empty-state" style="padding:8px;">No tasks</div>`:
      `<div class="task-list">${tasks.slice(0,5).map(t=>taskItemHtml(t,true)).join('')}${tasks.length>5?`<div class="empty-state" style="padding:4px;">+${tasks.length-5} more</div>`:''}</div>`;
    let eventsHtml=events.length>0?`<div class="event-list">${events.slice(0,2).map(e=>eventItemHtml(e)).join('')}</div>`:'';
    const notePreview=note.trim()?`<div style="font-size:12px;color:var(--text-dim);margin-top:4px;">📝 ${escapeHtml(note.trim().slice(0,60))}${note.length>60?'…':''}</div>`:'';
    html+=`<div class="day-card ${isTod?'today':''}" data-date="${ds}">
      <div class="day-card-header">
        <div><div class="dow">${WEEKDAYS_FULL[d.getDay()]}</div><div class="dnum">${d.getDate()}</div></div>
        <button class="open-day" data-open="${ds}">Open →</button>
      </div>
      ${notePreview}${eventsHtml}${tasksHtml}
    </div>`;
  }
  html+=`</div>`;
  root.innerHTML=html;
  root.querySelectorAll('[data-open]').forEach(b=>{
    b.addEventListener('click',e=>{ e.stopPropagation(); currentDate=fromYmd(b.dataset.open); setCalView('day'); });
  });
  attachTaskListEvents(root); attachEventListEvents(root);
}

/* ---------- Day View (Calendar) ---------- */
function renderDay() {
  const root=$('view-day');
  const ds=ymd(currentDate);
  const isTod=ds===todayStr();
  const tasks=tasksForDate(ds);
  const events=eventsForDate(ds);
  const note=state.notes[ds]||'';
  const fullDate=`${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  let tasksHtml=tasks.length===0?`<div class="empty-state">No tasks yet. Tap + to add one.</div>`:
    `<div class="task-list" id="dayTaskList">${tasks.map(t=>taskItemHtml(t,false)).join('')}</div>`;
  let eventsHtml=events.length===0?`<div class="empty-state" style="padding:8px 0 4px;">No events</div>`:
    `<div class="event-list">${events.map(e=>eventItemHtml(e)).join('')}</div>`;
  root.innerHTML=`<div class="day-view">
    <div class="day-header-big ${isTod?'today':''}">
      <div class="dnum-big">${currentDate.getDate()}</div>
      <div class="info">
        <div class="dow-big">${WEEKDAYS_FULL[currentDate.getDay()]}${isTod?' · Today':''}</div>
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
      <textarea class="notes-area" id="notesAreaCal" placeholder="Jot down anything for this day…">${escapeHtml(note)}</textarea>
    </div>
    <div class="section">
      <h3>Tasks <span class="count-pill">${tasks.filter(t=>!t.done).length} open</span></h3>
      ${tasksHtml}
      <button class="add-task-btn day-add-task">+ Add task</button>
    </div>
  </div>`;
  const ta=$('notesAreaCal');
  if (ta) ta.addEventListener('input',debounce(()=>{ const v=ta.value; if(v&&v.trim()) state.notes[ds]=v; else delete state.notes[ds]; save(); },300));
  root.querySelectorAll('.day-add-task').forEach(b=>b.addEventListener('click',()=>openTaskModal(null,ds)));
  root.querySelectorAll('.day-add-event').forEach(b=>b.addEventListener('click',()=>openEventModal(null,ds)));
  attachTaskListEvents(root); attachEventListEvents(root); attachDragReorder(root);
}

/* ---------- Goals Screen ---------- */
function renderGoals() {
  const root=$('screen-goals');
  const activeGoals=state.goals.filter(g=>g.status==='active');
  const doneGoals=state.goals.filter(g=>g.status==='completed');
  let html=`<div class="goals-screen">`;

  if (state.goals.length===0) {
    html+=`<div class="empty-state" style="padding:40px 20px;">
      <div style="font-size:36px;margin-bottom:10px;">🎯</div>
      <div style="font-size:16px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No goals yet</div>
      <div style="font-size:13px;">Set a goal and link tasks to track your progress.</div>
    </div>`;
  } else {
    if (activeGoals.length>0) {
      html+=`<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:8px;">Active</div>`;
      for (const g of activeGoals) html+=goalCardHtml(g);
    }
    if (doneGoals.length>0) {
      html+=`<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:14px 0 8px;">Completed</div>`;
      for (const g of doneGoals) html+=goalCardHtml(g);
    }
  }

  html+=`<button class="add-goal-btn" id="addGoalBtn">+ New goal</button></div>`;
  root.innerHTML=html;
  $('addGoalBtn').addEventListener('click',()=>openGoalModal(null));
  root.querySelectorAll('.goal-card').forEach(card=>{
    card.addEventListener('click',()=>openGoalModal(card.dataset.goalId));
  });
}

function goalCardHtml(g) {
  const {total,done}=goalTaskStats(g.id);
  const pct=total===0?0:Math.round((done/total)*100);
  const targetLabel=g.targetDate?`Target: ${g.targetDate}`:'No target date';
  return `<div class="goal-card" data-goal-id="${g.id}">
    <div class="goal-card-header">
      <div class="goal-name">${escapeHtml(g.title)}</div>
      <div class="goal-status-badge ${g.status==='completed'?'done':''}">${g.status==='completed'?'Done':'Active'}</div>
    </div>
    <div class="goal-meta">${total} task${total!==1?'s':''} · ${targetLabel}</div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="progress-labels"><span>${pct}% complete</span><span>${done} / ${total} tasks done</span></div>
  </div>`;
}

/* ---------- Reviews Screen ---------- */
let reviewType='daily';
function renderReviews() {
  const root=$('screen-reviews');
  let html=`<div class="reviews-screen">`;
  html+=`<div class="review-type-toggle">
    <button class="rtab ${reviewType==='daily'?'active':''}" data-rtype="daily">Daily</button>
    <button class="rtab ${reviewType==='weekly'?'active':''}" data-rtype="weekly">Weekly</button>
  </div>`;

  if (reviewType==='daily') {
    const ds=todayStr();
    const allDayTasks=tasksForDate(ds);
    const done=allDayTasks.filter(t=>t.done).length;
    const created=allDayTasks.length;
    const rate=created===0?0:Math.round((done/created)*100);
    const carried=allDayTasks.filter(t=>!t.done&&t.lastCarriedDate).length;
    const events=eventsForDate(ds).length;

    // 7-day trend
    const trend=[];
    for (let i=6;i>=0;i--) {
      const d=addDays(new Date(),-i);
      const dd=ymd(d);
      const dt=tasksForDate(dd);
      const dc=dt.length===0?0:Math.round((dt.filter(x=>x.done).length/dt.length)*100);
      trend.push({label:WEEKDAYS[d.getDay()].slice(0,1),pct:dc,isToday:i===0});
    }
    const maxPct=Math.max(1,...trend.map(t=>t.pct));

    html+=`<div class="review-date-label">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>`;
    html+=`<div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value good">${done}</div></div>
      <div class="stat-card"><div class="stat-label">Total tasks</div><div class="stat-value">${created}</div></div>
      <div class="stat-card"><div class="stat-label">Rate</div><div class="stat-value ${rate>=70?'good':rate>=40?'warn':'danger'}">${rate}%</div></div>
      <div class="stat-card"><div class="stat-label">Carried over</div><div class="stat-value ${carried>0?'warn':''}">${carried}</div></div>
    </div>`;

    html+=`<div class="trend-section"><h3>7-day completion</h3>
      <div class="trend-bars">${trend.map(t=>`<div class="trend-bar ${t.isToday?'current':''}" style="height:${Math.max(4,Math.round((t.pct/maxPct)*60))}px"></div>`).join('')}</div>
      <div class="trend-labels">${trend.map(t=>`<div class="trend-label">${t.label}</div>`).join('')}</div>
    </div>`;

    html+=`<div class="review-rows">
      <div class="review-row"><span class="rl">Events today</span><span class="rv">${events}</span></div>
      <div class="review-row"><span class="rl">Tasks remaining</span><span class="rv">${created-done}</span></div>
      <div class="review-row"><span class="rl">Goals active</span><span class="rv">${state.goals.filter(g=>g.status==='active').length}</span></div>
    </div>`;

  } else {
    // Weekly
    const today=new Date();
    const weekStart=startOfWeek(today);
    let weekDone=0, weekTotal=0, weekCarried=0, maxDayPct=0;
    const days7=[];
    for (let i=0;i<7;i++) {
      const d=addDays(weekStart,i);
      const dd=ymd(d);
      const dt=tasksForDate(dd);
      const dc=dt.filter(x=>x.done).length;
      const pct=dt.length===0?0:Math.round((dc/dt.length)*100);
      weekDone+=dc; weekTotal+=dt.length; weekCarried+=dt.filter(x=>!x.done&&x.lastCarriedDate).length;
      days7.push({label:WEEKDAYS[d.getDay()].slice(0,1),pct,isToday:isSameDay(d,today)});
      maxDayPct=Math.max(maxDayPct,pct);
    }
    const weekRate=weekTotal===0?0:Math.round((weekDone/weekTotal)*100);
    const weekStartLabel=weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const weekEndLabel=addDays(weekStart,6).toLocaleDateString('en-US',{month:'short',day:'numeric'});

    html+=`<div class="review-date-label">${weekStartLabel} – ${weekEndLabel}</div>`;
    html+=`<div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value good">${weekDone}</div></div>
      <div class="stat-card"><div class="stat-label">Total tasks</div><div class="stat-value">${weekTotal}</div></div>
      <div class="stat-card"><div class="stat-label">Rate</div><div class="stat-value ${weekRate>=70?'good':weekRate>=40?'warn':'danger'}">${weekRate}%</div></div>
      <div class="stat-card"><div class="stat-label">Carried</div><div class="stat-value ${weekCarried>0?'warn':''}">${weekCarried}</div></div>
    </div>`;

    html+=`<div class="trend-section"><h3>Daily completion this week</h3>
      <div class="trend-bars">${days7.map(t=>`<div class="trend-bar ${t.isToday?'current':''}" style="height:${Math.max(4,Math.round((t.pct/Math.max(1,maxDayPct))*60))}px"></div>`).join('')}</div>
      <div class="trend-labels">${days7.map(t=>`<div class="trend-label">${t.label}</div>`).join('')}</div>
    </div>`;

    const goalsDone=state.goals.filter(g=>g.status==='completed').length;
    html+=`<div class="review-rows">
      <div class="review-row"><span class="rl">Goals active</span><span class="rv">${state.goals.filter(g=>g.status==='active').length}</span></div>
      <div class="review-row"><span class="rl">Goals completed</span><span class="rv">${goalsDone}</span></div>
      <div class="review-row"><span class="rl">Total events this week</span><span class="rv">${days7.reduce((a,_,i)=>a+eventsForDate(ymd(addDays(weekStart,i))).length,0)}</span></div>
    </div>`;
  }

  html+=`
  <div style="margin-top:20px;">
    <h3>Backup & Restore</h3>

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
  root.innerHTML=html;
  root.querySelectorAll('.rtab').forEach(b=>{
    b.addEventListener('click',()=>{ reviewType=b.dataset.rtype; renderReviews(); });
  });
}

/* ---------- Task item HTML ---------- */
function taskItemHtml(t,compact) {
  const isCarried=!t.done&&!t.isRecurringInstance&&t.due&&t.due<todayStr()&&!!t.lastCarriedDate;
  const dueLabel=t.due?formatDuePill(t):'';
  const goal=t.goalId?state.goals.find(g=>g.id===t.goalId):null;
  return `<div class="task-item p-${t.priority} ${t.done?'done':''} ${isCarried?'carried':''} ${t.isRecurringInstance?'recurring-instance':''}"
       data-task-id="${t.id}" data-parent-id="${t.parentId||''}" data-instance-date="${t.instanceDate||''}"
       draggable="${compact?'false':'true'}">
    <button class="task-check ${t.done?'checked':''}" data-action="toggle" aria-label="Toggle done"></button>
    <div class="task-body" data-action="edit">
      <div class="task-title">${escapeHtml(t.title)}</div>
      ${t.desc?`<div class="task-desc">${escapeHtml(t.desc)}</div>`:''}
      <div class="task-meta">
        <span class="meta-pill">${PRIORITIES[t.priority]?.short||'–'}</span>
        ${t.recurrence&&t.recurrence.type&&t.recurrence.type!=='none'?`<span class="meta-pill">⟳ ${t.recurrence.type}</span>`:''}
        ${dueLabel}
        ${isCarried?`<span class="meta-pill">carried</span>`:''}
        ${goal?`<span class="meta-pill goal-pill">🎯 ${escapeHtml(goal.title.slice(0,20))}${goal.title.length>20?'…':''}</span>`:''}
      </div>
    </div>
  </div>`;
}
function formatDuePill(t) {
  if (!t.due) return '';
  const today=todayStr();
  const overdue=!t.done&&t.due<today;
  if (t.due===today) return `<span class="meta-pill">today</span>`;
  return `<span class="meta-pill ${overdue?'due-overdue':''}">${t.due}</span>`;
}

/* ---------- Event item HTML ---------- */
function eventItemHtml(e) {
  const timeStr=e.startTime?`${e.startTime}${e.endTime?' – '+e.endTime:''}`:'All day';
  return `<div class="event-item" data-event-id="${e.id}">
    <div class="event-time">${timeStr}</div>
    <div class="event-body">
      <div class="event-title">${escapeHtml(e.title)}</div>
      ${e.desc?`<div class="event-meta">${escapeHtml(e.desc)}</div>`:''}
    </div>
  </div>`;
}

/* ---------- Event & task listeners ---------- */
function attachTaskListEvents(scope) {
  scope.querySelectorAll('.task-item').forEach(el=>{
    const ref=resolveTaskRef(el);
    el.querySelector('[data-action="toggle"]').addEventListener('click',e=>{ e.stopPropagation(); toggleTaskDone(ref); });
    const body=el.querySelector('[data-action="edit"]');
    if (body) body.addEventListener('click',()=>{ if (ref.isRecurringInstance) openTaskModal(ref.parentId,null); else openTaskModal(ref.id,null); });
  });
}
function attachEventListEvents(scope) {
  scope.querySelectorAll('.event-item').forEach(el=>{
    el.addEventListener('click',()=>openEventModal(el.dataset.eventId,null));
  });
}
function resolveTaskRef(el) {
  const id=el.dataset.taskId, parentId=el.dataset.parentId, instanceDate=el.dataset.instanceDate;
  if (parentId) return {id,parentId,instanceDate,isRecurringInstance:true};
  return {id};
}

/* ---------- Drag reorder ---------- */
function attachDragReorder(scope) {
  const list=scope.querySelector('#dayTaskList'); if (!list) return;
  let dragEl=null;
  list.querySelectorAll('.task-item').forEach(item=>{
    item.addEventListener('dragstart',e=>{ dragEl=item; item.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    item.addEventListener('dragend',()=>{ if(dragEl) dragEl.classList.remove('dragging'); list.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over')); dragEl=null; persistOrderFromDom(); });
    item.addEventListener('dragover',e=>{ e.preventDefault(); if (!dragEl||dragEl===item) return; list.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over')); item.classList.add('drag-over'); });
    item.addEventListener('drop',e=>{ e.preventDefault(); if (!dragEl||dragEl===item) return; const rect=item.getBoundingClientRect(); const after=(e.clientY-rect.top)>rect.height/2; if(after) item.parentNode.insertBefore(dragEl,item.nextSibling); else item.parentNode.insertBefore(dragEl,item); });
  });
  enableTouchReorder(list);
}
function persistOrderFromDom() {
  const list=document.querySelector('#dayTaskList'); if (!list) return;
  let i=0;
  list.querySelectorAll('.task-item').forEach(el=>{
    const id=el.dataset.taskId, pId=el.dataset.parentId;
    const t=pId?state.tasks.find(x=>x.id===pId):state.tasks.find(x=>x.id===id);
    if (t) t.order=i++;
  });
  save();
}
function enableTouchReorder(list) {
  let dragging=null,startY=0,longPressTimer=null;
  list.querySelectorAll('.task-item').forEach(item=>{
    item.addEventListener('touchstart',e=>{ longPressTimer=setTimeout(()=>{ dragging=item; item.style.opacity='0.7'; item.style.transform='scale(1.02)'; if(navigator.vibrate) navigator.vibrate(20); startY=e.touches[0].clientY; },350); },{passive:true});
    item.addEventListener('touchmove',e=>{ if (!dragging){clearTimeout(longPressTimer);return;} e.preventDefault(); const y=e.touches[0].clientY; const dy=y-startY; dragging.style.transform=`translateY(${dy}px) scale(1.02)`; const sibs=[...list.querySelectorAll('.task-item')].filter(x=>x!==dragging); for(const s of sibs){const r=s.getBoundingClientRect();if(y>r.top&&y<r.bottom){const after=y>r.top+r.height/2;if(after)list.insertBefore(dragging,s.nextSibling);else list.insertBefore(dragging,s);startY=y;dragging.style.transform=`translateY(0px) scale(1.02)`;break;}} },{passive:false});
    const end=()=>{ clearTimeout(longPressTimer); if(dragging){dragging.style.opacity='';dragging.style.transform='';persistOrderFromDom();dragging=null;} };
    item.addEventListener('touchend',end); item.addEventListener('touchcancel',end);
  });
}

/* ===========================================================
   TASK MODAL
   =========================================================== */
function populateGoalSelect(selectedId) {
  const sel=$('taskGoal');
  sel.innerHTML='<option value="">— No goal —</option>';
  state.goals.filter(g=>g.status==='active').forEach(g=>{
    const opt=document.createElement('option');
    opt.value=g.id; opt.textContent=g.title;
    if (g.id===selectedId) opt.selected=true;
    sel.appendChild(opt);
  });
}
function openTaskModal(taskId,defaultDate) {
  editingTaskId=taskId;
  const t=taskId?state.tasks.find(x=>x.id===taskId):null;
  $('taskModalTitle').textContent=t?'Edit Task':'New Task';
  $('taskTitle').value=t?t.title:'';
  $('taskDesc').value=t?(t.desc||''):'';  
  $('taskDue').value=t?(t.due||''):(defaultDate||todayStr());
  editingPriority=t?t.priority:'inu';
  refreshPrioritySelection();
  populateGoalSelect(t?t.goalId:null);
  const rec=t&&t.recurrence?t.recurrence:{type:'none',interval:1};
  $('recType').value=rec.type||'none'; $('recInterval').value=rec.interval||1; updateRecUnitLabel();
  $('deleteTaskBtn').style.display=t?'':'none';
  $('taskModal').classList.add('active');
  setTimeout(()=>$('taskTitle').focus(),50);
}
function closeTaskModal() { $('taskModal').classList.remove('active'); editingTaskId=null; }
function refreshPrioritySelection() { document.querySelectorAll('.prio-opt').forEach(b=>b.classList.toggle('selected',b.dataset.prio===editingPriority)); }
function updateRecUnitLabel() { const v=$('recType').value; const m={none:'',daily:'day(s)',weekly:'week(s)',monthly:'month(s)'}; $('recUnitLabel').textContent=m[v]||''; $('recInterval').disabled=(v==='none'); }
function saveTaskFromModal() {
  const title=$('taskTitle').value.trim(); if (!title){$('taskTitle').focus();return;}
  const desc=$('taskDesc').value.trim();
  const due=$('taskDue').value||todayStr();
  const recType=$('recType').value;
  const recInterval=Math.max(1,parseInt($('recInterval').value||1,10));
  const recurrence=recType==='none'?{type:'none'}:{type:recType,interval:recInterval,completions:{}};
  const goalId=$('taskGoal').value||null;
  if (editingTaskId) {
    const t=state.tasks.find(x=>x.id===editingTaskId);
    if (t) {
      const oldComp=t.recurrence&&t.recurrence.completions;
      t.title=title; t.desc=desc; t.due=due; t.priority=editingPriority; t.recurrence=recurrence; t.goalId=goalId;
      if (recurrence.type!=='none'&&oldComp&&t.recurrence.type===recType) t.recurrence.completions=oldComp;
    }
  } else {
    const maxOrder=state.tasks.reduce((m,t)=>Math.max(m,t.order||0),0);
    state.tasks.push({id:uid(),title,desc,due,priority:editingPriority,done:false,completedOn:null,createdAt:todayStr(),recurrence,order:maxOrder+1,goalId});
  }
  save(); closeTaskModal(); renderAll();
}
function deleteCurrentTask() {
  if (!editingTaskId) return;
  if (!confirm('Delete this task?')) return;
  state.tasks=state.tasks.filter(t=>t.id!==editingTaskId);
  save(); closeTaskModal(); renderAll();
}

/* ===========================================================
   EVENT MODAL
   =========================================================== */
function openEventModal(eventId,defaultDate) {
  editingEventId=eventId;
  const e=eventId?state.events.find(x=>x.id===eventId):null;
  $('eventModalTitle').textContent=e?'Edit Event':'New Event';
  $('eventTitle').value=e?e.title:'';
  $('eventDesc').value=e?(e.desc||''):'';
  $('eventDate').value=e?e.date:(defaultDate||todayStr());
  $('eventStart').value=e?(e.startTime||''):'';
  $('eventEnd').value=e?(e.endTime||''):'';
  $('deleteEventBtn').style.display=e?'':'none';
  $('eventModal').classList.add('active');
  setTimeout(()=>$('eventTitle').focus(),50);
}
function closeEventModal() { $('eventModal').classList.remove('active'); editingEventId=null; }
function saveEventFromModal() {
  const title=$('eventTitle').value.trim(); if (!title){$('eventTitle').focus();return;}
  const desc=$('eventDesc').value.trim();
  const date=$('eventDate').value||todayStr();
  const startTime=$('eventStart').value||'';
  const endTime=$('eventEnd').value||'';
  if (editingEventId) {
    const e=state.events.find(x=>x.id===editingEventId);
    if (e) { e.title=title; e.desc=desc; e.date=date; e.startTime=startTime; e.endTime=endTime; }
  } else {
    state.events.push({id:uid(),title,desc,date,startTime,endTime,createdAt:todayStr()});
  }
  save(); closeEventModal(); renderAll();
}
function deleteCurrentEvent() {
  if (!editingEventId) return;
  if (!confirm('Delete this event?')) return;
  state.events=state.events.filter(e=>e.id!==editingEventId);
  save(); closeEventModal(); renderAll();
}

/* ===========================================================
   GOAL MODAL
   =========================================================== */
function openGoalModal(goalId) {
  editingGoalId=goalId;
  const g=goalId?state.goals.find(x=>x.id===goalId):null;
  $('goalModalTitle').textContent=g?'Edit Goal':'New Goal';
  $('goalTitle').value=g?g.title:'';
  $('goalDesc').value=g?(g.desc||''):'';
  $('goalTarget').value=g?(g.targetDate||''):'';
  $('deleteGoalBtn').style.display=g?'':'none';
  const completeRow=$('goalCompleteRow');
  const toggleBtn=$('toggleGoalStatusBtn');
  if (g) {
    completeRow.style.display='';
    toggleBtn.textContent=g.status==='active'?'Mark as completed ✓':'Reopen goal ↩';
    toggleBtn.style.color=g.status==='active'?'var(--goal-green)':'var(--text-dim)';
  } else {
    completeRow.style.display='none';
  }
  $('goalModal').classList.add('active');
  setTimeout(()=>$('goalTitle').focus(),50);
}
function closeGoalModal() { $('goalModal').classList.remove('active'); editingGoalId=null; }
function saveGoalFromModal() {
  const title=$('goalTitle').value.trim(); if (!title){$('goalTitle').focus();return;}
  const desc=$('goalDesc').value.trim();
  const targetDate=$('goalTarget').value||'';
  if (editingGoalId) {
    const g=state.goals.find(x=>x.id===editingGoalId);
    if (g) { g.title=title; g.desc=desc; g.targetDate=targetDate; }
  } else {
    state.goals.push({id:uid(),title,desc,targetDate,status:'active',createdAt:todayStr()});
  }
  save(); closeGoalModal(); renderAll();
}
function deleteCurrentGoal() {
  if (!editingGoalId) return;
  if (!confirm('Delete this goal? Tasks linked to it will be unlinked.')) return;
  state.tasks.forEach(t=>{ if(t.goalId===editingGoalId) t.goalId=null; });
  state.goals=state.goals.filter(g=>g.id!==editingGoalId);
  save(); closeGoalModal(); renderAll();
}

/* ===========================================================
   NAVIGATION
   =========================================================== */
function setScreen(s) {
  if (!SCREENS.includes(s)) return;
  currentScreen=s;
  document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active', el.id==='screen-'+s));
  // For calendar, also ensure the inner view is correct
  if (s==='calendar') {
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+currentCalView));
  }
  renderAll();
}
function setCalView(v) {
  if (!CAL_VIEWS.includes(v)) return;
  currentCalView=v;
  if (currentScreen!=='calendar') setScreen('calendar');
  else renderAll();
}
function navigatePrev() {
  if (currentCalView==='month') currentDate=addMonths(currentDate,-1);
  else if (currentCalView==='week') currentDate=addDays(currentDate,-7);
  else if (currentCalView==='three') currentDate=addDays(currentDate,-3);
  else currentDate=addDays(currentDate,-1);
  renderAll();
}
function navigateNext() {
  if (currentCalView==='month') currentDate=addMonths(currentDate,1);
  else if (currentCalView==='week') currentDate=addDays(currentDate,7);
  else if (currentCalView==='three') currentDate=addDays(currentDate,3);
  else currentDate=addDays(currentDate,1);
  renderAll();
}
function goToday() { currentDate=startOfDay(new Date()); renderAll(); }
function zoomIn() { const i=CAL_VIEWS.indexOf(currentCalView); if(i<CAL_VIEWS.length-1){setCalView(CAL_VIEWS[i+1]);showZoomHint(CAL_VIEWS[i+1]);} }
function zoomOut() { const i=CAL_VIEWS.indexOf(currentCalView); if(i>0){setCalView(CAL_VIEWS[i-1]);showZoomHint(CAL_VIEWS[i-1]);} }
function showZoomHint(v) { const h=$('zoomHint'); h.textContent=({month:'Month',week:'Week',three:'3-Day',day:'Day'})[v]; h.classList.add('show'); clearTimeout(showZoomHint._t); showZoomHint._t=setTimeout(()=>h.classList.remove('show'),700); }

/* ---------- Gestures ---------- */
function attachGestures() {
  const main=$('main');
  let initialDist=0,isPinching=false,touchStartX=0,touchStartY=0,swipeHandled=false;
  main.addEventListener('touchstart',e=>{ if(e.touches.length===2){isPinching=true;initialDist=pinchDist(e.touches);}else if(e.touches.length===1){touchStartX=e.touches[0].clientX;touchStartY=e.touches[0].clientY;swipeHandled=false;} },{passive:true});
  main.addEventListener('touchmove',e=>{ if(isPinching&&e.touches.length===2){const d=pinchDist(e.touches),r=d/initialDist;if(r>1.35){zoomIn();isPinching=false;}else if(r<0.7){zoomOut();isPinching=false;}}else if(e.touches.length===1&&!swipeHandled&&currentScreen==='calendar'){const dx=e.touches[0].clientX-touchStartX,dy=e.touches[0].clientY-touchStartY;if(Math.abs(dx)>60&&Math.abs(dy)<40){if(dx<0)navigateNext();else navigatePrev();swipeHandled=true;}} },{passive:true});
  main.addEventListener('touchend',()=>{isPinching=false;});
  main.addEventListener('wheel',e=>{ if(e.ctrlKey||e.metaKey){e.preventDefault();if(e.deltaY<0)zoomIn();else zoomOut();} },{passive:false});
}
function pinchDist(t) { return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY); }

/* ---------- Keyboard ---------- */
function attachKeyboard() {
  document.addEventListener('keydown',e=>{
    const modalOpen=$('taskModal').classList.contains('active')||$('eventModal').classList.contains('active')||$('goalModal').classList.contains('active');
    if (modalOpen) {
      if (e.key==='Escape') { closeTaskModal(); closeEventModal(); closeGoalModal(); }
      if (e.key==='Enter'&&(e.metaKey||e.ctrlKey)) { if($('taskModal').classList.contains('active')) saveTaskFromModal(); else if($('eventModal').classList.contains('active')) saveEventFromModal(); else saveGoalFromModal(); }
      return;
    }
    if (e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT') return;
    if (e.key==='ArrowLeft'&&currentScreen==='calendar') navigatePrev();
    else if (e.key==='ArrowRight'&&currentScreen==='calendar') navigateNext();
    else if (e.key==='t'||e.key==='T') { goToday(); setScreen('today'); }
    else if (e.key==='+'||e.key==='=') zoomIn();
    else if (e.key==='-'||e.key==='_') zoomOut();
    else if (e.key==='1') setScreen('today');
    else if (e.key==='2') setScreen('calendar');
    else if (e.key==='3') setScreen('goals');
    else if (e.key==='4') setScreen('reviews');
    else if (e.key==='n'||e.key==='N') openTaskModal(null,ymd(currentDate));
    else if (e.key==='e'||e.key==='E') openEventModal(null,ymd(currentDate));
  });
}

/* ===========================================================
   BIND & INIT
   =========================================================== */
function bind() {
  $('prevBtn').addEventListener('click',navigatePrev);
  $('nextBtn').addEventListener('click',navigateNext);
  $('todayBtn').addEventListener('click',goToday);
  $('zoomInBtn').addEventListener('click',zoomIn);
  $('zoomOutBtn').addEventListener('click',zoomOut);
  document.querySelectorAll('.view-tab').forEach(b=>b.addEventListener('click',()=>setCalView(b.dataset.view)));
  document.querySelectorAll('.bnav-item').forEach(b=>b.addEventListener('click',()=>setScreen(b.dataset.screen)));
  // FAB — toggle quick-add menu
  function closeFabMenu() {
    $('fabMenu').classList.remove('open');
    $('fabOverlay').classList.remove('open');
    $('fab').textContent='+';
  }
  $('fab').addEventListener('click',()=>{
    const isOpen=$('fabMenu').classList.contains('open');
    if (isOpen) { closeFabMenu(); return; }
    $('fabMenu').classList.add('open');
    $('fabOverlay').classList.add('open');
    $('fab').textContent='✕';
  });
  $('fabOverlay').addEventListener('click',closeFabMenu);
  $('fabAddTask').addEventListener('click',()=>{ closeFabMenu(); openTaskModal(null,ymd(currentDate)); });
  $('fabAddEvent').addEventListener('click',()=>{ closeFabMenu(); openEventModal(null,ymd(currentDate)); });

  // Task modal
  $('cancelTaskBtn').addEventListener('click',closeTaskModal);
  $('saveTaskBtn').addEventListener('click',saveTaskFromModal);
  $('deleteTaskBtn').addEventListener('click',deleteCurrentTask);
  $('taskModal').addEventListener('click',e=>{ if(e.target===$('taskModal')) closeTaskModal(); });
  document.querySelectorAll('.prio-opt').forEach(b=>b.addEventListener('click',()=>{ editingPriority=b.dataset.prio; refreshPrioritySelection(); }));
  $('recType').addEventListener('change',updateRecUnitLabel);

  // Event modal
  $('cancelEventBtn').addEventListener('click',closeEventModal);
  $('saveEventBtn').addEventListener('click',saveEventFromModal);
  $('deleteEventBtn').addEventListener('click',deleteCurrentEvent);
  $('eventModal').addEventListener('click',e=>{ if(e.target===$('eventModal')) closeEventModal(); });

  // Goal modal
  $('cancelGoalBtn').addEventListener('click',closeGoalModal);
  $('saveGoalBtn').addEventListener('click',saveGoalFromModal);
  $('deleteGoalBtn').addEventListener('click',deleteCurrentGoal);
  $('toggleGoalStatusBtn').addEventListener('click',()=>{
    if (!editingGoalId) return;
    const g=state.goals.find(x=>x.id===editingGoalId); if (!g) return;
    g.status=g.status==='active'?'completed':'active';
    save(); closeGoalModal(); renderAll();
  });
  $('goalModal').addEventListener('click',e=>{ if(e.target===$('goalModal')) closeGoalModal(); });

  attachGestures();
  attachKeyboard();
}

function seedIfEmpty() {
  if (state.tasks.length===0&&Object.keys(state.notes).length===0&&state.events.length===0&&state.goals.length===0) {
    const ds=todayStr();
    state.goals.push({id:'g1',title:'Try Flow v2',desc:'Explore all the features',targetDate:'',status:'active',createdAt:ds});
    state.tasks.push({id:'t1',title:'Welcome to Flow v2 ✨',desc:'Tasks, events, goals and reviews — all in one place.',due:ds,priority:'inu',done:false,createdAt:ds,recurrence:{type:'none'},order:1,goalId:'g1'});
    state.tasks.push({id:'t2',title:'Tap the circle to complete a task',desc:'Try checking this one off.',due:ds,priority:'uni',done:false,createdAt:ds,recurrence:{type:'none'},order:2,goalId:null});
    state.tasks.push({id:'t3',title:'Try adding an event',desc:'Tap "+ Add event" below.',due:ds,priority:'nn',done:false,createdAt:ds,recurrence:{type:'none'},order:3,goalId:'g1'});
    state.events.push({id:'e1',title:'Quick catch-up',desc:'Zoom call',date:ds,startTime:'10:00',endTime:'10:30',createdAt:ds});
    state.notes[ds]='Pinch to zoom views. Swipe left/right to navigate dates. Press N for a new task, E for a new event.';
    save();
  }
}

function init() {
  load();
  runCarryForward();
  bind();
  seedIfEmpty();
  renderAll();
}

document.addEventListener('DOMContentLoaded',init);

function exportBackup() {
  const data = localStorage.getItem('flow_app_v2');

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

  reader.onload = function(e) {
    try {
      JSON.parse(e.target.result);

      if (
        !confirm(
          'This will replace all current data. Continue?'
        )
      ) return;

      localStorage.setItem(
        'flow_app_v2',
        e.target.result
      );

      alert('Backup restored.');

      location.reload();

    } catch {
      alert('Invalid backup file.');
    }
  };

  reader.readAsText(file);
}

  /* ===========================================================
     4. Wire up FlowPlanner public surface
     =========================================================== */

  // Initialise the runtime date reference now that startOfDay() exists.
  currentDate = startOfDay(new Date());
  FlowPlanner.ui.currentDate = currentDate;

  // Public API — convenient handles for future modules / devtools.
  // FlowPlanner.render() also keeps FlowPlanner.ui synced for outside observers.
  FlowPlanner.init   = init;
  FlowPlanner.render = function () { syncUiSnapshot(); return renderAll(); };
  FlowPlanner.save   = save;
  FlowPlanner.load   = load;

  FlowPlanner.actions = {
    setScreen,
    setCalView,
    goToday,
    navigatePrev,
    navigateNext,
    zoomIn,
    zoomOut,
    openTaskModal,
    openEventModal,
    openGoalModal,
    exportBackup,
    importBackup
  };

  // Take an initial snapshot so FlowPlanner.ui is populated even before
  // the first user-driven render. (init() will call renderAll() shortly.)
  syncUiSnapshot();

  /* ===========================================================
     5. Inline-onclick bridges
     -----------------------------------------------------------
     renderReviews() generates buttons whose onclick attributes
     call exportBackup() / importBackup(event) by name. Those
     handlers must therefore be reachable from the global scope.
     This is the only intentional leak from the IIFE.
     =========================================================== */
  window.exportBackup = exportBackup;
  window.importBackup = importBackup;

})();
