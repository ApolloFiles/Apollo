import { getLocale } from '$lib/paraglide/runtime';
import { createSubscriber } from 'svelte/reactivity';

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

const subscribeToClockTick = createSubscriber((update) => {
  const intervalId = setInterval(update, 30_000);
  return () => clearInterval(intervalId);
});

export function formatAbsoluteDate(date: Date, withTime = true): string {
  return date.toLocaleDateString(getLocale(), {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } as const : {}),
  });
}

export function formatRelativeDate(date: Date): string {
  // Re-runs the calling effect every 30s so rendered values don't go stale
  subscribeToClockTick();

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'always' });

  for (const [unit, secondsPerUnit] of RELATIVE_TIME_UNITS) {
    if (Math.abs(deltaSeconds) >= secondsPerUnit) {
      return formatter.format(Math.round(deltaSeconds / secondsPerUnit), unit);
    }
  }
  return formatter.format(deltaSeconds, 'second');
}
