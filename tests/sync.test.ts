import { describe, expect, it, vi } from 'vitest';
import { FlightSyncService } from '../src/sync';
import type { KlubkoClient } from '../src/klubko';
import type { LogEntry, SyncOperation } from '../src/types';

const flight: LogEntry = {
  id: 'one',
  num: 1,
  date: '2026-07-25',
  toTime: '10:00',
  fn: 'glider',
  reg: 'OK-1',
  acType: 'ASK-21',
  pilots: ['Pilot'],
  ldgTime: '10:20',
  dur: '00:20',
  note: '',
  pair: null
};

class QueueRepository {
  queue: SyncOperation[] = [];
  load() {
    return this.queue;
  }
  save(queue: SyncOperation[]) {
    this.queue = structuredClone(queue);
  }
}

function client(authenticated = true) {
  return {
    isAuthenticated: () => authenticated,
    editFlights: vi.fn().mockResolvedValue({ status: 'OK' })
  } as unknown as KlubkoClient;
}

describe('offline sync queue', () => {
  it('queues when auto-sync is disabled and drains after it is enabled', async () => {
    const api = client();
    const repository = new QueueRepository();
    const service = new FlightSyncService(api, repository);
    await service.submitOrQueue('create', flight, false);
    expect(service.status().queueLength).toBe(1);
    await service.drain();
    expect(service.status().queueLength).toBe(0);
    expect(api.editFlights).toHaveBeenCalledTimes(1);
  });

  it('retains failed operations and stops after five attempts', async () => {
    const api = client();
    vi.mocked(api.editFlights).mockRejectedValue(new Error('offline'));
    const repository = new QueueRepository();
    const service = new FlightSyncService(api, repository);
    service.enqueueCreate(flight);
    for (let attempt = 0; attempt < 5; attempt += 1) await service.drain();
    expect(service.status().queueLength).toBe(0);
    expect(api.editFlights).toHaveBeenCalledTimes(5);
  });
});
