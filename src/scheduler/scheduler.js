/**
 * src/scheduler/scheduler.js
 * CLIENT-SIDE display helpers only.
 * All scheduling computation has moved to the backend.
 * These functions are kept here so Timeline, ScheduleTable, and page
 * components can format times without extra API calls.
 *
 * SCHEDULE_START is now a parameter (from settings.schedule_start),
 * not a module-level constant, to support user-configurable start times.
 */

// Default fallback (used when settings haven't loaded yet)
const DEFAULT_START_ISO = '2026-11-02T08:00:00';

function getStart(scheduleStartISO) {
  return new Date(scheduleStartISO ?? DEFAULT_START_ISO);
}

/** Convert minutes-since-start → Date */
export function fromMins(mins, scheduleStartISO) {
  return new Date(getStart(scheduleStartISO).getTime() + mins * 60000);
}

/** Convert Date → minutes since schedule start */
export function toMins(date, scheduleStartISO) {
  return (date.getTime() - getStart(scheduleStartISO).getTime()) / 60000;
}

/** Format a Date as HH:MM (or "DD MMM HH:MM" if past midnight relative to start) */
export function fmtTime(date, scheduleStartISO) {
  if (!date) return '—';
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  const startDay = getStart(scheduleStartISO).toDateString();
  if (d.toDateString() !== startDay) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
           ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
