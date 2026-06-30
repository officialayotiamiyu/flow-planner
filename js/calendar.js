(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  function getUi() {
    return FlowPlanner.ui;
  }

  function getUtils() {
    return FlowPlanner.utils;
  }

  function getConstants() {
    return FlowPlanner.constants;
  }

  function ensureCalendarState() {
    const ui = getUi();
    if (!ui.currentDate) ui.currentDate = getUtils().startOfDay(new Date());
    if (!ui.currentCalView) ui.currentCalView = 'day';
    return ui;
  }

  function getCurrentDate() {
    return ensureCalendarState().currentDate;
  }

  function setCurrentDate(date) {
    ensureCalendarState().currentDate = date;
    return ensureCalendarState().currentDate;
  }

  function getCurrentCalView() {
    return ensureCalendarState().currentCalView;
  }

  function setCalView(view) {
    if (!getConstants().CAL_VIEWS.includes(view)) return getCurrentCalView();
    ensureCalendarState().currentCalView = view;
    return ensureCalendarState().currentCalView;
  }

  function navigatePrev() {
    const currentDate = getCurrentDate();
    const currentCalView = getCurrentCalView();

    if (currentCalView === 'month') setCurrentDate(getUtils().addMonths(currentDate, -1));
    else if (currentCalView === 'week') setCurrentDate(getUtils().addDays(currentDate, -7));
    else if (currentCalView === 'three') setCurrentDate(getUtils().addDays(currentDate, -3));
    else setCurrentDate(getUtils().addDays(currentDate, -1));

    return getCurrentDate();
  }

  function navigateNext() {
    const currentDate = getCurrentDate();
    const currentCalView = getCurrentCalView();

    if (currentCalView === 'month') setCurrentDate(getUtils().addMonths(currentDate, 1));
    else if (currentCalView === 'week') setCurrentDate(getUtils().addDays(currentDate, 7));
    else if (currentCalView === 'three') setCurrentDate(getUtils().addDays(currentDate, 3));
    else setCurrentDate(getUtils().addDays(currentDate, 1));

    return getCurrentDate();
  }

  function goToday() {
    setCurrentDate(getUtils().startOfDay(new Date()));
    return getCurrentDate();
  }

  function zoomIn() {
    const views = getConstants().CAL_VIEWS;
    const i = views.indexOf(getCurrentCalView());
    if (i < views.length - 1) {
      setCalView(views[i + 1]);
      return views[i + 1];
    }
    return null;
  }

  function zoomOut() {
    const views = getConstants().CAL_VIEWS;
    const i = views.indexOf(getCurrentCalView());
    if (i > 0) {
      setCalView(views[i - 1]);
      return views[i - 1];
    }
    return null;
  }

  FlowPlanner.calendar = {
    ensureCalendarState,
    getCurrentDate,
    setCurrentDate,
    getCurrentCalView,
    setCalView,
    navigatePrev,
    navigateNext,
    goToday,
    zoomIn,
    zoomOut
  };
})();
