import { computeSnap, logToApiFlight, type KlubkoClient } from './klubko';
import type { LogEntry, SyncOperation } from './types';

export interface SyncStatus {
  queueLength: number;
  syncing: boolean;
}

export interface SyncQueueStore {
  load(): SyncOperation[];
  save(queue: SyncOperation[]): void;
}

export class FlightSyncService {
  private queue: SyncOperation[];
  private syncing = false;
  private callbacks = new Set<(status: SyncStatus) => void>();

  constructor(
    private readonly client: KlubkoClient,
    private readonly repository: SyncQueueStore
  ) {
    this.queue = repository.load();
  }

  onChange(callback: (status: SyncStatus) => void): () => void {
    this.callbacks.add(callback);
    callback(this.status());
    return () => this.callbacks.delete(callback);
  }

  status(): SyncStatus {
    return { queueLength: this.queue.length, syncing: this.syncing };
  }

  enqueueCreate(flight: LogEntry): void {
    this.enqueue({ type: 'create', flight, timestamp: Date.now(), retries: 0 });
  }

  enqueueUpdate(flight: LogEntry): void {
    this.enqueue({ type: 'update', flight, timestamp: Date.now(), retries: 0 });
  }

  enqueueDelete(flightId: number | string, snap: string): void {
    this.enqueue({ type: 'delete', flightId, snap, timestamp: Date.now(), retries: 0 });
  }

  private enqueue(operation: SyncOperation): void {
    this.queue.push(structuredClone(operation));
    this.persist();
  }

  async submitOrQueue(type: 'create' | 'update', flight: LogEntry, enabled: boolean): Promise<void> {
    if (!enabled || !this.client.isAuthenticated()) {
      if (type === 'create') this.enqueueCreate(flight);
      else this.enqueueUpdate(flight);
      return;
    }
    try {
      await this.submit(type, flight);
    } catch {
      if (type === 'create') this.enqueueCreate(flight);
      else this.enqueueUpdate(flight);
    }
  }

  async drain(): Promise<void> {
    if (this.syncing || !this.client.isAuthenticated() || this.queue.length === 0) return;
    this.syncing = true;
    this.notify();
    const pending = this.queue.splice(0);
    this.persist();
    for (const operation of pending) {
      try {
        if (operation.type === 'delete') {
          await this.client.editFlights([
            { flight_id: operation.flightId, snap: operation.snap, delete: 'y' }
          ]);
        } else {
          await this.submit(operation.type, operation.flight);
        }
      } catch {
        const retry = { ...operation, retries: operation.retries + 1 };
        if (retry.retries < 5) this.queue.push(retry);
      }
    }
    this.syncing = false;
    this.persist();
  }

  private async submit(type: 'create' | 'update', flight: LogEntry): Promise<void> {
    const api = logToApiFlight(flight);
    if (type === 'create' || !api.snap) api.snap = computeSnap(api);
    await this.client.editFlights([api]);
  }

  private persist(): void {
    this.repository.save(this.queue);
    this.notify();
  }

  private notify(): void {
    const status = this.status();
    this.callbacks.forEach((callback) => callback(status));
  }
}
