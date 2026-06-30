(function () {
  'use strict';

  const FlowPlanner = (window.FlowPlanner = window.FlowPlanner || {});

  FlowPlanner.version = FlowPlanner.version || '2.2.0';

  FlowPlanner.constants = FlowPlanner.constants || {
    STORAGE_KEY: 'flow_app_v2',
    CAL_VIEWS: ['month', 'week', 'three', 'day'],
    SCREENS: ['today', 'calendar', 'goals', 'reviews', 'profile'],
    PRIORITIES: {
      iu: { label: 'Important & Urgent', short: 'I&U' },
      inu: { label: 'Important, Not Urgent', short: 'I' },
      uni: { label: 'Urgent, Not Important', short: 'U' },
      nn: { label: 'Neither', short: '–' }
    },
    WEEKDAYS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    WEEKDAYS_FULL: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function ymd(d) {
    const x = startOfDay(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }

  function fromYmd(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function addMonths(d, n) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  }

  function startOfWeek(d) {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function isSameDay(a, b) {
    return ymd(a) === ymd(b);
  }

  function todayStr() {
    return ymd(new Date());
  }

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function debounce(fn, ms) {
    let h;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(h);
      h = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }

  FlowPlanner.utils = {
    startOfDay,
    ymd,
    fromYmd,
    addDays,
    addMonths,
    startOfWeek,
    startOfMonth,
    isSameDay,
    todayStr,
    uid,
    escapeHtml,
    debounce
  };
})();
