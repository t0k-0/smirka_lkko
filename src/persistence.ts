import { dedupeRecentConfigs, emptyComposer } from './domain';
import type {
  AppState,
  KlubkoConfig,
  LogEntry,
  PendingDailyLog,
  PersistentState,
  RecentConfig,
  SyncOperation
} from './types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AppRepository {
  load(): AppState;
  save(state: AppState): void;
  clear(): void;
}

const APP_KEY = 'gl5';
const CONFIG_KEY = 'klubko-config';
const QUEUE_KEY = 'klubko-sync-queue';
export const KLUBKO_PROXY_URL = 'https://klubko-proxy.onrender.com/';

export const defaultConfig: KlubkoConfig = {
  baseUrl: 'https://klubko.aeroklub-kolin.cz/rest-api/',
  proxyUrl: KLUBKO_PROXY_URL,
  useTest: false,
  authMode: 'password',
  username: '',
  timezone: 'Europe/Prague'
};

export function defaultState(today = new Date().toDateString()): AppState {
  return {
    schemaVersion: 1,
    theme: 'dark',
    language: 'cs',
    airport: 'LKKO',
    planes: [],
    pilots: [],
    log: [],
    airborne: [],
    takeoffs: 0,
    dayPlanes: [],
    dayPilots: [],
    presetInitialized: false,
    recentConfigs: [],
    date: today,
    dayFinalized: false,
    pendingLogs: [],
    mode: 'aerotow',
    comp: emptyComposer(),
    focus: null,
    bottomMode: 'idle',
    landId: null,
    landSlot: null,
    logFilter: '',
    utcMode: false
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isSameCalendarDay(value: unknown, today: string): boolean {
  if (value === today) return true;
  if (typeof value !== 'string') return false;
  const parsedValue = new Date(value).toDateString();
  const parsedToday = new Date(today).toDateString();
  return parsedValue !== 'Invalid Date' && parsedValue === parsedToday;
}

function logEntriesForDay(entries: LogEntry[], day: string): LogEntry[] {
  return entries.filter((entry) => !entry.date || isSameCalendarDay(entry.date, day));
}

function recentConfigsForDay(configs: RecentConfig[], day: string): RecentConfig[] {
  return dedupeRecentConfigs(
    configs.filter(
      (config) =>
        Number.isFinite(config.ts) &&
        isSameCalendarDay(new Date(config.ts).toDateString(), day)
    )
  );
}

function calendarDayISO(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(value);
  if (parsed.toString() === 'Invalid Date') return null;
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function mergePendingLog(
  pendingLogs: PendingDailyLog[],
  dateValue: string,
  entries: LogEntry[]
): PendingDailyLog[] {
  const date = calendarDayISO(dateValue);
  if (!date || !entries.length) return pendingLogs;
  const normalizedEntries = entries
    .filter((entry) => !entry.date || isSameCalendarDay(entry.date, date))
    .map((entry) => ({ ...entry, date: entry.date || date }));
  if (!normalizedEntries.length) return pendingLogs;
  const existing = pendingLogs.find((pending) => pending.date === date)?.entries ?? [];
  const byId = new Map<string, LogEntry>();
  [...existing, ...normalizedEntries].forEach((entry) => byId.set(entry.id, entry));
  return [
    ...pendingLogs.filter((pending) => pending.date !== date),
    { date, entries: [...byId.values()] }
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizePendingLogs(value: unknown): PendingDailyLog[] {
  return asArray<PendingDailyLog>(value).reduce<PendingDailyLog[]>(
    (result, pending) =>
      pending && typeof pending.date === 'string'
        ? mergePendingLog(result, pending.date, asArray<LogEntry>(pending.entries))
        : result,
    []
  );
}

export function rolloverDailyState(
  state: AppState,
  today = new Date().toDateString()
): AppState {
  if (isSameCalendarDay(state.date, today)) return state;
  const pendingLogs = state.dayFinalized
    ? state.pendingLogs
    : mergePendingLog(state.pendingLogs, state.date, logEntriesForDay(state.log, state.date));
  return {
    ...state,
    date: today,
    log: [],
    airborne: [],
    takeoffs: 0,
    dayPlanes: [],
    dayPilots: [],
    presetInitialized: false,
    recentConfigs: [],
    dayFinalized: false,
    pendingLogs,
    comp: emptyComposer(),
    focus: null,
    bottomMode: 'idle',
    landId: null,
    landSlot: null,
    logFilter: ''
  };
}

export function migrateState(raw: unknown, today = new Date().toDateString()): AppState {
  const fallback = defaultState(today);
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Record<string, any>;
  const sameDay = isSameCalendarDay(source.date, today);
  let pendingLogs = normalizePendingLogs(source.pendingLogs);
  if (!sameDay && !source.dayFinalized && typeof source.date === 'string') {
    pendingLogs = mergePendingLog(
      pendingLogs,
      source.date,
      logEntriesForDay(asArray(source.log), source.date)
    );
  }
  return {
    ...fallback,
    schemaVersion: 1,
    theme: source.theme === 'light' ? 'light' : 'dark',
    language: source.language === 'en' ? 'en' : 'cs',
    airport: typeof source.airport === 'string' ? source.airport : 'LKKO',
    planes: asArray(source.planes),
    pilots: asArray(source.pilots),
    dayPlanes: sameDay ? asArray(source.dayPlanes) : [],
    dayPilots: sameDay ? asArray(source.dayPilots) : [],
    presetInitialized: sameDay && Boolean(source.presetInitialized),
    recentConfigs: sameDay
      ? recentConfigsForDay(asArray(source.recentConfigs), today)
      : [],
    date: today,
    log: sameDay ? logEntriesForDay(asArray(source.log), today) : [],
    airborne: sameDay ? asArray(source.airborne) : [],
    takeoffs: sameDay && Number.isFinite(source.takeoffs) ? Number(source.takeoffs) : 0,
    dayFinalized: sameDay && Boolean(source.dayFinalized),
    pendingLogs
  };
}

export function persistentSnapshot(state: AppState): PersistentState {
  return {
    schemaVersion: 1,
    theme: state.theme,
    language: state.language,
    airport: state.airport,
    planes: state.planes,
    pilots: state.pilots,
    log: logEntriesForDay(state.log, state.date),
    airborne: state.airborne,
    takeoffs: state.takeoffs,
    dayPlanes: state.dayPlanes,
    dayPilots: state.dayPilots,
    presetInitialized: state.presetInitialized,
    recentConfigs: recentConfigsForDay(state.recentConfigs, state.date),
    date: state.date,
    dayFinalized: state.dayFinalized,
    pendingLogs: normalizePendingLogs(state.pendingLogs)
  };
}

export class LocalAppRepository implements AppRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  load(): AppState {
    try {
      const value = this.storage.getItem(APP_KEY);
      return value ? migrateState(JSON.parse(value)) : defaultState();
    } catch {
      return defaultState();
    }
  }

  save(state: AppState): void {
    this.storage.setItem(APP_KEY, JSON.stringify(persistentSnapshot(state)));
  }

  clear(): void {
    this.storage.removeItem(APP_KEY);
  }
}

export class ConfigRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  load(): KlubkoConfig {
    try {
      const value = this.storage.getItem(CONFIG_KEY);
      if (!value) return { ...defaultConfig };
      const parsed = JSON.parse(value) as Partial<KlubkoConfig>;
      return {
        ...defaultConfig,
        ...parsed,
        proxyUrl: KLUBKO_PROXY_URL
      };
    } catch {
      return { ...defaultConfig };
    }
  }

  save(config: KlubkoConfig): void {
    this.storage.setItem(
      CONFIG_KEY,
      JSON.stringify({ ...config, proxyUrl: KLUBKO_PROXY_URL })
    );
  }
}

export class SyncQueueRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  load(): SyncOperation[] {
    try {
      const value = this.storage.getItem(QUEUE_KEY);
      const parsed = value ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  save(queue: SyncOperation[]): void {
    this.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}
