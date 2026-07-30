import { describe, expect, it } from 'vitest';
import {
  calculateDuration,
  formatDuration,
  intervalsOverlap,
  localDateISO,
  timeToMinutes
} from '../src/time';

describe('time utilities', () => {
  it('calculates same-day and overnight durations', () => {
    expect(calculateDuration('10:15', '11:42')).toBe('01:27');
    expect(calculateDuration('23:50', '00:15')).toBe('00:25');
  });

  it('formats and parses durations', () => {
    expect(timeToMinutes('02:05')).toBe(125);
    expect(formatDuration(125)).toBe('02:05');
    expect(timeToMinutes('bad')).toBe(0);
  });

  it('uses the local calendar day rather than UTC', () => {
    const date = new Date(2026, 6, 25, 23, 55);
    expect(localDateISO(date)).toBe('2026-07-25');
  });

  it('detects interval and zero-duration point overlap in minutes', () => {
    expect(intervalsOverlap('10:00', 30, '10:15', 20)).toBe(true);
    expect(intervalsOverlap('10:00', 10, '10:15', 20)).toBe(false);
    expect(intervalsOverlap('10:15', 0, '10:00', 30)).toBe(true);
    expect(intervalsOverlap('10:00', 30, '10:15', 0)).toBe(true);
  });
});
