import { emptyComposer } from './domain';
import type {
  AppState,
  KlubkoConfig,
  PersistentState,
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

export const defaultConfig: KlubkoConfig = {
  baseUrl: 'https://klubko.aeroklub-kolin.cz/rest-api/',
  proxyUrl: 'https://klubko-proxy.onrender.com/',
  useTest: false,
  authMode: 'password',
  username: '',
  timezone: 'Europe/Prague'
};

export function defaultState(today = new Date().toDateString()): AppState {
  return {
    schemaVersion: 1,
    theme: 'dark',
    language: 'en',
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

export function migrateState(raw: unknown, today = new Date().toDateString()): AppState {
  const fallback = defaultState(today);
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Record<string, any>;
  const parsedSourceDay =
    typeof source.date === 'string' ? new Date(source.date).toDateString() : '';
  const parsedToday = new Date(today).toDateString();
  const sameDay =
    source.date === today ||
    (parsedSourceDay !== 'Invalid Date' && parsedSourceDay === parsedToday);
  return {
    ...fallback,
    schemaVersion: 1,
    theme: source.theme === 'light' ? 'light' : 'dark',
    language: source.language === 'cs' ? 'cs' : 'en',
    airport: typeof source.airport === 'string' ? source.airport : 'LKKO',
    planes: asArray(source.planes),
    pilots: asArray(source.pilots),
    dayPlanes: asArray(source.dayPlanes),
    dayPilots: asArray(source.dayPilots),
    presetInitialized: Boolean(source.presetInitialized),
    recentConfigs: asArray(source.recentConfigs),
    date: today,
    log: sameDay ? asArray(source.log) : [],
    airborne: sameDay ? asArray(source.airborne) : [],
    takeoffs: sameDay && Number.isFinite(source.takeoffs) ? Number(source.takeoffs) : 0
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
    log: state.log,
    airborne: state.airborne,
    takeoffs: state.takeoffs,
    dayPlanes: state.dayPlanes,
    dayPilots: state.dayPilots,
    presetInitialized: state.presetInitialized,
    recentConfigs: state.recentConfigs,
    date: new Date().toDateString()
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
        proxyUrl: parsed.proxyUrl ?? defaultConfig.proxyUrl
      };
    } catch {
      return { ...defaultConfig };
    }
  }

  save(config: KlubkoConfig): void {
    this.storage.setItem(CONFIG_KEY, JSON.stringify(config));
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
