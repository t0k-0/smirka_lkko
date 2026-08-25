export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const pad2 = (value: number): string => String(value).padStart(2, '0');

export function localDateISO(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localTime(date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function timeToMinutes(value: string | null | undefined): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return 0;
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function durationMinutes(from: string, to: string): number {
  let result = timeToMinutes(to) - timeToMinutes(from);
  if (result < 0) result += 24 * 60;
  return result;
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.trunc(minutes));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

export function calculateDuration(from: string, to: string): string {
  return formatDuration(durationMinutes(from, to));
}

export function localToUTC(value: string, date = new Date()): string {
  const total = ((timeToMinutes(value) + date.getTimezoneOffset()) % 1440 + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function utcOffsetLabel(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

export function intervalsOverlap(
  firstStart: string,
  firstDuration: number,
  secondStart: string,
  secondDuration: number
): boolean {
  const aStart = timeToMinutes(firstStart);
  const bStart = timeToMinutes(secondStart);
  const aEnd = aStart + Math.max(0, firstDuration);
  const bEnd = bStart + Math.max(0, secondDuration);
  if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) return true;
  if (firstDuration <= 0) return aStart >= bStart && aStart <= bEnd;
  if (secondDuration <= 0) return bStart >= aStart && bStart <= aEnd;
  return false;
}
