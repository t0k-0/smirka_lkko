import { describe, expect, it } from 'vitest';
import {
  analyzePush,
  computeSnap,
  endpointFor,
  logToApiFlight,
  normalizeProxy
} from '../src/klubko';
import type { LogEntry } from '../src/types';

const entry: LogEntry = {
  id: 'local-1',
  num: 1,
  date: '2026-07-25',
  toTime: '10:00',
  fn: 'glider',
  reg: 'OK-1234',
  acType: 'ASK-21',
  pilots: ['Pilot One'],
  ldgTime: '10:30',
  dur: '00:30',
  note: '',
  pair: null
};

describe('Klubko mapping and reconciliation', () => {
  it('applies test prefixes only to supported endpoints', () => {
    expect(endpointFor('edit-flights/', true)).toBe('test-edit-flights/');
    expect(endpointFor('airplanes/', true)).toBe('airplanes/');
    expect(endpointFor('login/', true)).toBe('login/');
  });

  it('normalizes proxy URLs', () => {
    expect(normalizeProxy('https://proxy.example')).toBe('https://proxy.example/');
    expect(normalizeProxy('')).toBe('');
  });

  it('maps flat log records and produces a deterministic checksum', () => {
    const dto = logToApiFlight(entry);
    expect(dto.duration).toBe(30);
    expect(dto.powered).toBe('W');
    expect(computeSnap(dto)).toMatch(/^[a-f0-9]{32}$/);
    expect(computeSnap(dto)).toBe(computeSnap(dto));
  });

  it('updates overlapping server flights and creates non-overlapping flights', () => {
    const overlapping = analyzePush([entry], [
      {
        ...logToApiFlight(entry),
        flight_id: 42,
        takeoff: '09:55',
        duration: 40
      }
    ]);
    expect(overlapping.toUpdate).toHaveLength(1);
    expect(overlapping.toUpdate[0]?.api.flight_id).toBe(42);
    expect(overlapping.toUpdate[0]?.api.takeoff).toBe('09:55');

    const separate = analyzePush([entry], [
      { ...logToApiFlight(entry), flight_id: 42, takeoff: '11:00' }
    ]);
    expect(separate.toCreate).toHaveLength(1);
  });
});
