import { describe, expect, it } from 'vitest';
import {
  ConfigRepository,
  LocalAppRepository,
  SyncQueueRepository,
  defaultState,
  migrateState
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

describe('persistence', () => {
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

  it('resets daily data but retains references and preferences on a new day', () => {
    const migrated = migrateState(
      {
        theme: 'light',
        date: '2026-07-24',
        planes: [{ reg: 'OK-1' }],
        pilots: ['Pilot'],
        log: [{ id: '1' }],
        airborne: [{ id: '2' }],
        takeoffs: 4
      },
      '2026-07-25'
    );
    expect(migrated.log).toEqual([]);
    expect(migrated.airborne).toEqual([]);
    expect(migrated.takeoffs).toBe(0);
    expect(migrated.planes).toHaveLength(1);
    expect(migrated.theme).toBe('light');
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
    config.save({ ...current, username: 'tester' });
    expect(config.load().username).toBe('tester');

    const queue = new SyncQueueRepository(storage);
    queue.save([]);
    expect(queue.load()).toEqual([]);
  });
});
