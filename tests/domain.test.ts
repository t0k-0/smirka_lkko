import { describe, expect, it } from 'vitest';
import {
  airbornePilots,
  canAssignPilotToSeat,
  classifyAircraft,
  createTakeoff,
  dedupeRecentConfigs,
  isComposerReady,
  landFlight,
  normalizeReferenceData,
  orderPilotsForSelection,
  recentFromComposer,
  reopenLogEntry
} from '../src/domain';
import { defaultState } from '../src/persistence';
import type { Aircraft, AppState } from '../src/types';

const aircraft = (
  reg: string,
  fn: Aircraft['fn'],
  seats = 1
): Aircraft => ({
  id: reg,
  reg,
  type: fn === 'tow' ? 'Z-226' : 'ASK-21',
  seats,
  fn,
  takeoffTypes: fn === 'tow' ? ['M', 'A'] : ['A']
});

function aerotowState(): AppState {
  const state = defaultState('2026-07-25');
  state.comp.tow = { plane: aircraft('OK-TOW', 'tow'), pilot: 'Tow Pilot' };
  state.comp.glider = {
    plane: aircraft('OK-GLI', 'glider', 2),
    pilots: ['Glider Pilot', null]
  };
  return state;
}

describe('flight domain', () => {
  it('keeps only the newest copy of an identical recent configuration', () => {
    const state = aerotowState();
    const newest = recentFromComposer(state);
    const older = { ...recentFromComposer(state), id: 'older', ts: newest.ts - 1000 };

    expect(dedupeRecentConfigs([newest, older]).map((config) => config.id)).toEqual([
      newest.id
    ]);
  });

  it('requires the expected aerotow crew', () => {
    const state = aerotowState();
    expect(isComposerReady(state)).toBe(true);
    state.comp.tow.pilot = null;
    expect(isComposerReady(state)).toBe(false);
  });

  it('allows +1 osoba only in seat two of a multi-seat aircraft', () => {
    expect(canAssignPilotToSeat('+1 osoba', 'tow', 'p0', 2)).toBe(false);
    expect(canAssignPilotToSeat('+1 osoba', 'single', 'p0', 1)).toBe(false);
    expect(canAssignPilotToSeat('+1 osoba', 'single', 'p1', 1)).toBe(false);
    expect(canAssignPilotToSeat('+1 osoba', 'glider', 'p0', 2)).toBe(false);
    expect(canAssignPilotToSeat('+1 osoba', 'glider', 'p1', 2)).toBe(true);
    expect(canAssignPilotToSeat('Actual Pilot', 'single', 'p0', 1)).toBe(true);
  });

  it('cannot complete or create a configuration with +1 osoba as pilot in command', () => {
    const state = aerotowState();
    state.comp.glider.pilots = ['+1 osoba', null];
    expect(isComposerReady(state)).toBe(false);
    expect(() => createTakeoff(state, '10:00')).toThrow('Takeoff is incomplete');

    state.comp.glider.pilots = ['Glider Pilot', '+1 osoba'];
    expect(isComposerReady(state)).toBe(true);
    expect(createTakeoff(state, '10:00').type).toBe('aerotow');
  });

  it('creates an aerotow and keeps it airborne until both parts land', () => {
    const state = aerotowState();
    const flight = createTakeoff(state, '10:00');
    expect(flight.type).toBe('aerotow');
    expect(airbornePilots([flight])).toEqual(
      new Set(['Tow Pilot', 'Glider Pilot'])
    );

    const first = landFlight([flight], flight.id, 'tow', '10:12');
    expect(first.airborne).toHaveLength(1);
    expect(first.addedLog).toHaveLength(0);
    expect(airbornePilots(first.airborne)).toEqual(new Set(['Glider Pilot']));

    const second = landFlight(first.airborne, flight.id, 'glider', '10:45');
    expect(second.airborne).toHaveLength(0);
    expect(second.addedLog).toHaveLength(2);
    expect(second.addedLog[0]?.dur).toBe('00:12');
    expect(second.addedLog[1]?.dur).toBe('00:45');
    expect(second.addedLog[0]?.pair).toBe(second.addedLog[1]?.pair);
  });

  it('keeps the +1 osoba passenger placeholder reusable across airborne flights', () => {
    const first = aerotowState();
    first.comp.glider.pilots = ['Glider Pilot', '+1 osoba'];
    const second = aerotowState();
    second.comp.tow.pilot = 'Other Tow Pilot';
    second.comp.glider.pilots = ['Other Glider Pilot', '+1 osoba'];

    const blocked = airbornePilots([
      createTakeoff(first, '10:00'),
      createTakeoff(second, '10:05')
    ]);

    expect(blocked.has('+1 osoba')).toBe(false);
    expect(blocked).toContain('Glider Pilot');
    expect(blocked).toContain('Other Glider Pilot');
  });

  it('places +1 osoba after usable pilots and before unavailable pilots', () => {
    expect(
      orderPilotsForSelection(
        ['+1 osoba', 'Available Pilot', 'Airborne Pilot', 'Another Pilot'],
        new Set(['Airborne Pilot']),
        new Set()
      )
    ).toEqual(['Available Pilot', 'Another Pilot', '+1 osoba', 'Airborne Pilot']);
  });

  it('returns one side of a logged aerotow to airborne without duplicating its partner', () => {
    const state = aerotowState();
    const flight = createTakeoff(state, '10:00');
    const towLanded = landFlight([flight], flight.id, 'tow', '10:12');
    const completed = landFlight(towLanded.airborne, flight.id, 'glider', '10:45');
    state.airborne = completed.airborne;
    state.log = completed.addedLog;

    const reopened = reopenLogEntry(state, state.log[0]!.id);
    expect(reopened.log).toHaveLength(0);
    expect(reopened.airborne).toHaveLength(1);
    expect(reopened.reopened?.type).toBe('aerotow');
    if (!reopened.reopened || reopened.reopened.type !== 'aerotow') return;
    expect(reopened.reopened.tow.ldgTime).toBeNull();
    expect(reopened.reopened.glider.ldgTime).toBe('10:45');

    const relanded = landFlight(
      reopened.airborne,
      reopened.reopened.id,
      'tow',
      '10:14'
    );
    expect(relanded.addedLog).toHaveLength(2);
    expect(relanded.addedLog.map((entry) => entry.id)).toEqual(
      completed.addedLog.map((entry) => entry.id)
    );
    expect(relanded.addedLog[1]?.ldgTime).toBe('10:45');
  });

  it('classifies Klubko takeoff codes without name guessing when codes exist', () => {
    expect(classifyAircraft(['M', 'A'], 'Unknown')).toBe('tow');
    expect(classifyAircraft(['M'], 'Unknown')).toBe('motorized');
    expect(classifyAircraft(['A', 'W'], 'Unknown')).toBe('glider');
  });

  it('normalizes registrations and person records from Klubko', () => {
    const result = normalizeReferenceData(
      [
        { registration: 'OK-9825', type: 'L-23', seats: 2 },
        { registration: 'OK-MFQ', type: 'Z-226', seats: 2 }
      ],
      [{ first_name: 'Jan', last_name: 'Novák' }],
      { '9825': 'AW', MFQ: 'MA' }
    );
    expect(result.planes.map((plane) => plane.fn)).toEqual(['glider', 'tow']);
    expect(result.pilots).toEqual(['Jan Novák']);
  });
});
