import type {
  AerotowAirborneFlight,
  Aircraft,
  AirborneFlight,
  AppState,
  ComposerState,
  FlightRole,
  LogEntry,
  RecentConfig
} from './types';
import { calculateDuration, localDateISO } from './time';

export const uid = (): string =>
  `${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;

export function emptyComposer(): ComposerState {
  return {
    tow: { plane: null, pilot: null },
    glider: { plane: null, pilots: [null, null] },
    single: { plane: null, pilots: [null, null] }
  };
}

export function isComposerReady(state: AppState): boolean {
  if (state.mode === 'aerotow') {
    return Boolean(
      state.comp.tow.plane &&
        state.comp.tow.pilot &&
        state.comp.glider.plane &&
        state.comp.glider.pilots[0]
    );
  }
  return Boolean(state.comp.single.plane && state.comp.single.pilots[0]);
}

export function airbornePilots(flights: AirborneFlight[]): Set<string> {
  const result = new Set<string>();
  for (const flight of flights) {
    if (flight.type === 'aerotow') {
      if (!flight.tow.ldgTime) result.add(flight.tow.pilot);
      if (!flight.glider.ldgTime) flight.glider.pilots.forEach((pilot) => result.add(pilot));
    } else if (!flight.ldgTime) {
      flight.pilots.forEach((pilot) => result.add(pilot));
    }
  }
  return result;
}

export function airborneRegistrations(flights: AirborneFlight[]): Set<string> {
  const result = new Set<string>();
  for (const flight of flights) {
    if (flight.type === 'aerotow') {
      if (!flight.tow.ldgTime) result.add(flight.tow.plane.reg);
      if (!flight.glider.ldgTime) result.add(flight.glider.plane.reg);
    } else if (!flight.ldgTime) {
      result.add(flight.plane.reg);
    }
  }
  return result;
}

export function composerPilots(state: AppState, omitFocused = false): Set<string> {
  const result = new Set<string>();
  const focus = omitFocused ? state.focus : null;
  if (state.comp.tow.pilot && !(focus?.slot === 'tow')) result.add(state.comp.tow.pilot);
  state.comp.glider.pilots.forEach((pilot, index) => {
    const sub = index === 0 ? 'p0' : 'p1';
    if (pilot && !(focus?.slot === 'glider' && focus.sub === sub)) result.add(pilot);
  });
  state.comp.single.pilots.forEach((pilot, index) => {
    const sub = index === 0 ? 'p0' : 'p1';
    if (pilot && !(focus?.slot === 'single' && focus.sub === sub)) result.add(pilot);
  });
  return result;
}

export function createTakeoff(state: AppState, time: string): AirborneFlight {
  const num = state.takeoffs + 1;
  if (state.mode === 'aerotow') {
    const towPlane = state.comp.tow.plane;
    const towPilot = state.comp.tow.pilot;
    const gliderPlane = state.comp.glider.plane;
    const gliderPilots = state.comp.glider.pilots.filter((pilot): pilot is string => Boolean(pilot));
    if (!towPlane || !towPilot || !gliderPlane || !gliderPilots[0]) {
      throw new Error('Takeoff is incomplete');
    }
    return {
      id: uid(),
      type: 'aerotow',
      num,
      toTime: time,
      tow: { plane: { ...towPlane }, pilot: towPilot, ldgTime: null, dur: null },
      glider: {
        plane: { ...gliderPlane },
        pilots: gliderPilots,
        ldgTime: null,
        dur: null
      }
    };
  }
  const plane = state.comp.single.plane;
  const pilots = state.comp.single.pilots.filter((pilot): pilot is string => Boolean(pilot));
  if (!plane || !pilots[0]) throw new Error('Takeoff is incomplete');
  return {
    id: uid(),
    type: 'single',
    num,
    toTime: time,
    plane: { ...plane },
    pilots,
    ldgTime: null,
    dur: null
  };
}

export function recentFromComposer(state: AppState): RecentConfig {
  if (state.mode === 'aerotow') {
    return {
      id: uid(),
      ts: Date.now(),
      mode: 'aerotow',
      tow: {
        plane: { ...state.comp.tow.plane! },
        pilot: state.comp.tow.pilot!
      },
      glider: {
        plane: { ...state.comp.glider.plane! },
        pilots: state.comp.glider.pilots.filter((pilot): pilot is string => Boolean(pilot))
      }
    };
  }
  return {
    id: uid(),
    ts: Date.now(),
    mode: 'single',
    single: {
      plane: { ...state.comp.single.plane! },
      pilots: state.comp.single.pilots.filter((pilot): pilot is string => Boolean(pilot))
    }
  };
}

export interface LandingResult {
  airborne: AirborneFlight[];
  addedLog: LogEntry[];
}

function aerotowLog(flight: AerotowAirborneFlight): LogEntry[] {
  const pair = uid();
  return [
    {
      id: uid(),
      num: flight.num,
      date: localDateISO(),
      toTime: flight.toTime,
      fn: 'tow',
      reg: flight.tow.plane.reg,
      acType: flight.tow.plane.type,
      pilots: [flight.tow.pilot],
      ldgTime: flight.tow.ldgTime,
      dur: flight.tow.dur,
      note: '',
      pair
    },
    {
      id: uid(),
      num: flight.num,
      date: localDateISO(),
      toTime: flight.toTime,
      fn: flight.glider.plane.fn,
      reg: flight.glider.plane.reg,
      acType: flight.glider.plane.type,
      pilots: flight.glider.pilots,
      ldgTime: flight.glider.ldgTime,
      dur: flight.glider.dur,
      note: '',
      pair
    }
  ];
}

export function landFlight(
  flights: AirborneFlight[],
  flightId: string,
  slot: 'tow' | 'glider' | 'self',
  time: string
): LandingResult {
  const airborne = structuredClone(flights);
  const index = airborne.findIndex((flight) => flight.id === flightId);
  if (index < 0) return { airborne, addedLog: [] };
  const flight = airborne[index]!;
  if (flight.type === 'aerotow') {
    if (slot === 'self') return { airborne, addedLog: [] };
    flight[slot].ldgTime = time;
    flight[slot].dur = calculateDuration(flight.toTime, time);
    if (flight.tow.ldgTime && flight.glider.ldgTime) {
      airborne.splice(index, 1);
      return { airborne, addedLog: aerotowLog(flight) };
    }
    return { airborne, addedLog: [] };
  }
  flight.ldgTime = time;
  flight.dur = calculateDuration(flight.toTime, time);
  airborne.splice(index, 1);
  return {
    airborne,
    addedLog: [
      {
        id: uid(),
        num: flight.num,
        date: localDateISO(),
        toTime: flight.toTime,
        fn: flight.plane.fn,
        reg: flight.plane.reg,
        acType: flight.plane.type,
        pilots: flight.pilots,
        ldgTime: time,
        dur: flight.dur,
        note: '',
        pair: null
      }
    ]
  };
}

export function classifyAircraft(codes: string[], type: string): FlightRole {
  const hasMotor = codes.includes('M');
  const hasAerotow = codes.includes('A');
  if (hasMotor && hasAerotow) return 'tow';
  if (hasMotor) return 'motorized';
  if (hasAerotow || codes.includes('W')) return 'glider';
  return type.toLowerCase().includes('tow') ? 'tow' : 'glider';
}

export function normalizeReferenceData(
  rawPlanes: unknown[],
  rawPersons: unknown[],
  takeoffTypes: unknown
): { planes: Aircraft[]; pilots: string[] } {
  const dictionary =
    takeoffTypes && typeof takeoffTypes === 'object' && !Array.isArray(takeoffTypes)
      ? (takeoffTypes as Record<string, unknown>)
      : null;
  const normalizeRegistration = (value: unknown): string =>
    String(value ?? '')
      .toUpperCase()
      .replace(/^OK[- ]?/, '')
      .replace(/[^A-Z0-9]/g, '');
  const lookupCodes = (registration: string): string[] => {
    if (!dictionary) return [];
    const target = normalizeRegistration(registration);
    const entry = Object.entries(dictionary).find(([key]) => {
      const normalized = normalizeRegistration(key);
      return normalized === target || target.endsWith(normalized) || normalized.endsWith(target);
    });
    return entry
      ? [...new Set(String(entry[1]).toUpperCase().match(/[A-Z]/g) ?? [])]
      : [];
  };
  const planes = rawPlanes.map((raw) => {
    const source = (raw ?? {}) as Record<string, any>;
    const reg = String(source.registration ?? source.reg ?? source.signature ?? source.sign ?? '');
    const type = String(source.type ?? source.airplane_type ?? source.model ?? '');
    const codes = lookupCodes(reg);
    return {
      id: uid(),
      reg,
      type,
      seats: Number(source.seats ?? source.capacity ?? 1),
      fn: classifyAircraft(codes, type),
      takeoffTypes: codes
    };
  });
  const pilots = rawPersons
    .map((raw) => {
      if (typeof raw === 'string') return raw;
      const source = (raw ?? {}) as Record<string, any>;
      if (source.name) return String(source.name);
      return String(
        `${source.first_name ?? source.firstname ?? source.given_name ?? ''} ${
          source.last_name ?? source.surname ?? source.family_name ?? ''
        }`
      ).trim();
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return { planes, pilots };
}

export function sortLog(entries: LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => {
    if (a.num !== b.num) return a.num - b.num;
    if (a.fn === b.fn) return 0;
    return a.fn === 'tow' ? -1 : 1;
  });
}
