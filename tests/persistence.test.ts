import { describe, expect, it } from 'vitest';
import {
  ConfigRepository,
  KLUBKO_PROXY_URL,
  LocalAppRepository,
  SyncQueueRepository,
  defaultState,
  migrateState,
  persistentSnapshot,
  rolloverDailyState
} from '../src/persistence';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const recentConfig = (id: string, ts: number, reg = 'OK-1') => ({
  id,
  ts,
  mode: 'single' as const,
  single: {
    plane: {
      id: reg,
      reg,
      type: 'ASK-21',
      seats: 2,
      fn: 'glider' as const,
      takeoffTypes: ['A']
    },
    pilots: ['Pilot']
  }
});

describe('persistence', () => {
  it('defaults new installations to Czech while preserving an English preference', () => {
    expect(defaultState('2026-07-25').language).toBe('cs');
    expect(migrateState({ language: 'en' }, '2026-07-25').language).toBe('en');
  });

  it('migrates the current unversioned gl5 shape', () => {
    const migrated = migrateState(
      {
        theme: 'light',
        language: 'cs',
        date: '2026-07-25',
        planes: [{ reg: 'OK-1' }],
        pilots: ['Pilot'],
        log: [{ id: '1' }],
        airborne: [{ id: '2' }],
        takeoffs: 4,
        dayPlanes: ['OK-1'],
        dayPilots: ['Pilot'],
        presetInitialized: true,
        recentConfigs: []
      },
      '2026-07-25'
    );
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.theme).toBe('light');
    expect(migrated.log).toHaveLength(1);
    expect(migrated.comp.tow.plane).toBeNull();
  });

  it('resets daily working data but retains references and an unfinished prior log', () => {
    const migrated = migrateState(
      {
        theme: 'light',
        date: '2026-07-24',
        planes: [{ reg: 'OK-1' }],
        pilots: ['Pilot'],
        log: [{ id: '1' }],
        airborne: [{ id: '2' }],
        takeoffs: 4,
        recentConfigs: [{ id: 'recent-1' }]
      },
      '2026-07-25'
    );
    expect(migrated.log).toEqual([]);
    expect(migrated.airborne).toEqual([]);
    expect(migrated.takeoffs).toBe(0);
    expect(migrated.recentConfigs).toEqual([]);
    expect(migrated.dayPlanes).toEqual([]);
    expect(migrated.dayPilots).toEqual([]);
    expect(migrated.presetInitialized).toBe(false);
    expect(migrated.pendingLogs).toEqual([
      { date: '2026-07-24', entries: [{ id: '1', date: '2026-07-24' }] }
    ]);
    expect(migrated.planes).toHaveLength(1);
    expect(migrated.theme).toBe('light');
  });

  it('rolls an open app into a clean daily history without relabeling old data', () => {
    const state = defaultState('2026-07-24');
    state.log = [{ id: 'log-1' } as never];
    state.airborne = [{ id: 'airborne-1' } as never];
    state.recentConfigs = [{ id: 'recent-1' } as never];
    state.takeoffs = 3;
    state.dayPilots = ['Pilot'];

    expect(persistentSnapshot(state).date).toBe('2026-07-24');
    const rolled = rolloverDailyState(state, '2026-07-25');
    expect(rolled.date).toBe('2026-07-25');
    expect(rolled.log).toEqual([]);
    expect(rolled.airborne).toEqual([]);
    expect(rolled.recentConfigs).toEqual([]);
    expect(rolled.takeoffs).toBe(0);
    expect(rolled.dayPilots).toEqual([]);
    expect(rolled.dayPlanes).toEqual([]);
    expect(rolled.presetInitialized).toBe(false);
    expect(rolled.pendingLogs[0]?.date).toBe('2026-07-24');
    expect(rolled.pendingLogs[0]?.entries.map((entry) => entry.id)).toEqual(['log-1']);
  });

  it('does not retain a prior-day log after a final export or push', () => {
    const state = defaultState('2026-07-24');
    state.log = [{ id: 'log-1' } as never];
    state.dayFinalized = true;

    const rolled = rolloverDailyState(state, '2026-07-25');
    expect(rolled.log).toEqual([]);
    expect(rolled.pendingLogs).toEqual([]);
  });

  it('filters stray dated log and recent-history records outside the active day', () => {
    const migrated = migrateState(
      {
        date: '2026-07-25',
        log: [
          { id: 'today', date: '2026-07-25' },
          { id: 'yesterday', date: '2026-07-24' },
          { id: 'legacy-without-date' }
        ],
        recentConfigs: [
          recentConfig('today', new Date(2026, 6, 25, 10).getTime()),
          recentConfig('today-duplicate', new Date(2026, 6, 25, 9).getTime()),
          recentConfig('today-other', new Date(2026, 6, 25, 8).getTime(), 'OK-2'),
          recentConfig('yesterday', new Date(2026, 6, 24, 10).getTime())
        ]
      },
      '2026-07-25'
    );

    expect(migrated.log.map((entry) => entry.id)).toEqual([
      'today',
      'legacy-without-date'
    ]);
    expect(migrated.recentConfigs.map((config) => config.id)).toEqual([
      'today',
      'today-other'
    ]);
  });

  it('round trips app/config/queue data under the existing keys', () => {
    const storage = new MemoryStorage();
    const app = new LocalAppRepository(storage);
    const state = defaultState('2026-07-25');
    state.pilots = ['Pilot'];
    app.save(state);
    expect(app.load().pilots).toEqual(['Pilot']);

    const config = new ConfigRepository(storage);
    const current = config.load();
    storage.setItem(
      'klubko-config',
      JSON.stringify({ ...current, proxyUrl: 'https://wrong.example/' })
    );
    expect(config.load().proxyUrl).toBe(KLUBKO_PROXY_URL);
    config.save({ ...current, username: 'tester', proxyUrl: 'https://wrong.example/' });
    expect(config.load().username).toBe('tester');
    expect(config.load().proxyUrl).toBe(KLUBKO_PROXY_URL);

    const queue = new SyncQueueRepository(storage);
    queue.save([]);
    expect(queue.load()).toEqual([]);
  });
});
