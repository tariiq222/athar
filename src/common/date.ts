/**
 * Pure date helpers shared across billing / usage / auth. Kept dependency-free
 * so they are trivially unit-testable and safe to call from any layer.
 */

/**
 * First instant (00:00 local time) of the month containing `now`.
 * Defaults to the current time. Uses the local timezone — matching the
 * original inline `new Date(year, month, 1)` construction used by the usage
 * aggregation and billing usage windows.
 */
export function startOfMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * `base` shifted forward by `ms` milliseconds. `base` may be a Date or an
 * epoch-millis number. Equivalent to `new Date(baseMs + ms)`.
 */
export function addMs(base: Date | number, ms: number): Date {
  const baseMs = typeof base === 'number' ? base : base.getTime();
  return new Date(baseMs + ms);
}

/** `base` shifted forward by `days` days. Thin wrapper over `addMs`. */
export function addDays(base: Date | number, days: number): Date {
  return addMs(base, days * 24 * 60 * 60 * 1000);
}
