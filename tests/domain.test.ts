import { describe, expect, it } from 'vitest';
import {
  airbornePilots,
  classifyAircraft,
  createTakeoff,
  isComposerReady,
  landFlight,
  normalizeReferenceData
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
  it('requires the expected aerotow crew', () => {
    const state = aerotowState();
    expect(isComposerReady(state)).toBe(true);
    state.comp.tow.pilot = null;
    expect(isComposerReady(state)).toBe(false);
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
