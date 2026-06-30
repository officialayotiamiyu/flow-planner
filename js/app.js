(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  FlowPlanner.version = FlowPlanner.version || '2.2.0';

  FlowPlanner.state = FlowPlanner.state || {
    notes: {},
    tasks: [],
    events: [],
    goals: [],
    meta: { lastOpenDate: null, lastCarryDate: null }
  };

  FlowPlanner.ui = FlowPlanner.ui || {
    currentDate: FlowPlanner.utils.startOfDay(new Date()),
    currentCalView: 'day',
    currentScreen: 'today',
    editingTaskId: null,
    editingPriority: 'inu',
    editingEventId: null,
    editingGoalId: null,
    reviewType: 'daily'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function render() {
    FlowPlanner.rendering.renderAll();
  }

  function setScreen(screen) {
    FlowPlanner.rendering.setScreen(screen);
  }

  function setCalView(view) {
    FlowPlanner.calendar.setCalView(view);
    if (FlowPlanner.ui.currentScreen !== 'calendar') {
      FlowPlanner.rendering.setScreen('calendar');
    } else {
      render();
    }
  }

  function navigatePrev() {
    FlowPlanner.calendar.navigatePrev();
    render();
  }

  function navigateNext() {
    FlowPlanner.calendar.navigateNext();
    render();
  }

  function goToday() {
    FlowPlanner.calendar.goToday();
    render();
  }

  function zoomIn() {
    const next = FlowPlanner.calendar.zoomIn();
    if (next) FlowPlanner.rendering.showZoomHint(next);
    if (FlowPlanner.ui.currentScreen !== 'calendar') {
      FlowPlanner.rendering.setScreen('calendar');
    } else if (next) {
      render();
    }
  }

  function zoomOut() {
    const next = FlowPlanner.calendar.zoomOut();
    if (next) FlowPlanner.rendering.showZoomHint(next);
    if (FlowPlanner.ui.currentScreen !== 'calendar') {
      FlowPlanner.rendering.setScreen('calendar');
    } else if (next) {
      render();
    }
  }

  function closeFabMenu() {
    $('fabMenu').classList.remove('open');
    $('fabOverlay').classList.remove('open');
    $('fab').textContent = '+';
  }

  function attachGestures() {
    const main = $('main');
    let initialDist = 0;
    let isPinching = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let swipeHandled = false;

    main.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        isPinching = true;
        initialDist = pinchDist(e.touches);
      } else if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swipeHandled = false;
      }
    }, { passive: true });

    main.addEventListener('touchmove', function (e) {
      if (isPinching && e.touches.length === 2) {
        const d = pinchDist(e.touches);
        const r = d / initialDist;
        if (r > 1.35) {
          zoomIn();
          isPinching = false;
        } else if (r < 0.7) {
          zoomOut();
          isPinching = false;
        }
      } else if (e.touches.length === 1 && !swipeHandled && FlowPlanner.ui.currentScreen === 'calendar') {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 40) {
          if (dx < 0) navigateNext();
          else navigatePrev();
          swipeHandled = true;
        }
      }
    }, { passive: true });

    main.addEventListener('touchend', function () {
      isPinching = false;
    });

    main.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    }, { passive: false });
  }

  function pinchDist(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  function attachKeyboard() {
    document.addEventListener('keydown', function (e) {
      const modals = FlowPlanner.modals;
      const calendar = FlowPlanner.calendar;

      if (modals.isAnyModalOpen()) {
        if (e.key === 'Escape') modals.closeAllModals();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          if ($('taskModal').classList.contains('active')) modals.saveTaskFromModal();
          else if ($('eventModal').classList.contains('active')) modals.saveEventFromModal();
          else modals.saveGoalFromModal();
        }
        return;
      }

      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      if (e.key === 'ArrowLeft' && FlowPlanner.ui.currentScreen === 'calendar') navigatePrev();
      else if (e.key === 'ArrowRight' && FlowPlanner.ui.currentScreen === 'calendar') navigateNext();
      else if (e.key === 't' || e.key === 'T') {
        goToday();
        setScreen('today');
      } else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-' || e.key === '_') zoomOut();
      else if (e.key === '1') setScreen('today');
      else if (e.key === '2') setScreen('calendar');
      else if (e.key === '3') setScreen('goals');
      else if (e.key === '4') setScreen('reviews');
      else if (e.key === 'n' || e.key === 'N') FlowPlanner.modals.openTaskModal(null, FlowPlanner.utils.ymd(calendar.getCurrentDate()));
      else if (e.key === 'e' || e.key === 'E') FlowPlanner.modals.openEventModal(null, FlowPlanner.utils.ymd(calendar.getCurrentDate()));
    });
  }

  function bind() {
    $('prevBtn').addEventListener('click', navigatePrev);
    $('nextBtn').addEventListener('click', navigateNext);
    $('todayBtn').addEventListener('click', goToday);
    $('zoomInBtn').addEventListener('click', zoomIn);
    $('zoomOutBtn').addEventListener('click', zoomOut);

    document.querySelectorAll('.view-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        setCalView(b.dataset.view);
      });
    });

    document.querySelectorAll('.bnav-item').forEach(function (b) {
      b.addEventListener('click', function () {
        setScreen(b.dataset.screen);
      });
    });

    $('fab').addEventListener('click', function () {
      const isOpen = $('fabMenu').classList.contains('open');
      if (isOpen) {
        closeFabMenu();
        return;
      }
      $('fabMenu').classList.add('open');
      $('fabOverlay').classList.add('open');
      $('fab').textContent = '✕';
    });

    $('fabOverlay').addEventListener('click', closeFabMenu);
    $('fabAddTask').addEventListener('click', function () {
      closeFabMenu();
      FlowPlanner.modals.openTaskModal(null, FlowPlanner.utils.ymd(FlowPlanner.calendar.getCurrentDate()));
    });
    $('fabAddEvent').addEventListener('click', function () {
      closeFabMenu();
      FlowPlanner.modals.openEventModal(null, FlowPlanner.utils.ymd(FlowPlanner.calendar.getCurrentDate()));
    });

    $('cancelTaskBtn').addEventListener('click', FlowPlanner.modals.closeTaskModal);
    $('saveTaskBtn').addEventListener('click', FlowPlanner.modals.saveTaskFromModal);
    $('deleteTaskBtn').addEventListener('click', FlowPlanner.modals.deleteCurrentTask);
    $('taskModal').addEventListener('click', function (e) {
      if (e.target === $('taskModal')) FlowPlanner.modals.closeTaskModal();
    });
    document.querySelectorAll('.prio-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        FlowPlanner.ui.editingPriority = b.dataset.prio;
        FlowPlanner.modals.refreshPrioritySelection();
      });
    });
    $('recType').addEventListener('change', FlowPlanner.modals.updateRecUnitLabel);

    $('cancelEventBtn').addEventListener('click', FlowPlanner.modals.closeEventModal);
    $('saveEventBtn').addEventListener('click', FlowPlanner.modals.saveEventFromModal);
    $('deleteEventBtn').addEventListener('click', FlowPlanner.modals.deleteCurrentEvent);
    $('eventModal').addEventListener('click', function (e) {
      if (e.target === $('eventModal')) FlowPlanner.modals.closeEventModal();
    });

    $('cancelGoalBtn').addEventListener('click', FlowPlanner.modals.closeGoalModal);
    $('saveGoalBtn').addEventListener('click', FlowPlanner.modals.saveGoalFromModal);
    $('deleteGoalBtn').addEventListener('click', FlowPlanner.modals.deleteCurrentGoal);
    $('toggleGoalStatusBtn').addEventListener('click', FlowPlanner.modals.toggleCurrentGoalStatus);
    $('goalModal').addEventListener('click', function (e) {
      if (e.target === $('goalModal')) FlowPlanner.modals.closeGoalModal();
    });

    attachGestures();
    attachKeyboard();
  }

  function init() {
    FlowPlanner.storage.load();
    FlowPlanner.storage.runCarryForward();
    bind();
    FlowPlanner.storage.seedIfEmpty();
    render();
  }

  FlowPlanner.init = init;
  FlowPlanner.render = render;
  FlowPlanner.save = FlowPlanner.storage.save;
  FlowPlanner.load = FlowPlanner.storage.load;

  FlowPlanner.actions = {
    setScreen,
    setCalView,
    goToday,
    navigatePrev,
    navigateNext,
    zoomIn,
    zoomOut,
    openTaskModal: function (taskId, defaultDate) {
      FlowPlanner.modals.openTaskModal(taskId, defaultDate);
    },
    openEventModal: function (eventId, defaultDate) {
      FlowPlanner.modals.openEventModal(eventId, defaultDate);
    },
    openGoalModal: function (goalId) {
      FlowPlanner.modals.openGoalModal(goalId);
    },
    exportBackup: FlowPlanner.storage.exportBackup,
    importBackup: FlowPlanner.storage.importBackup
  };

  document.addEventListener('DOMContentLoaded', init);
})();
