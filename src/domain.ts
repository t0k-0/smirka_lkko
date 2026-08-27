import type {
  AerotowAirborneFlight,
  Aircraft,
  AirborneFlight,
  AppState,
  ComposerSlot,
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
        !isReusablePassengerPlaceholder(state.comp.tow.pilot) &&
        state.comp.glider.plane &&
        state.comp.glider.pilots[0] &&
        !isReusablePassengerPlaceholder(state.comp.glider.pilots[0])
    );
  }
  return Boolean(
    state.comp.single.plane &&
      state.comp.single.pilots[0] &&
      !isReusablePassengerPlaceholder(state.comp.single.pilots[0])
  );
}

export const REUSABLE_PASSENGER_PLACEHOLDER = '+1 osoba';

export function isReusablePassengerPlaceholder(pilot: string): boolean {
  return pilot.trim().toLocaleLowerCase() === REUSABLE_PASSENGER_PLACEHOLDER;
}

export function canAssignPilotToSeat(
  pilot: string,
  slot: ComposerSlot,
  sub: 'p0' | 'p1',
  seatCount: number
): boolean {
  return (
    !isReusablePassengerPlaceholder(pilot) ||
    (slot !== 'tow' && sub === 'p1' && seatCount > 1)
  );
}

export function airbornePilots(flights: AirborneFlight[]): Set<string> {
  const result = new Set<string>();
  const addPilot = (pilot: string) => {
    if (!isReusablePassengerPlaceholder(pilot)) result.add(pilot);
  };
  for (const flight of flights) {
    if (flight.type === 'aerotow') {
      if (!flight.tow.ldgTime) addPilot(flight.tow.pilot);
      if (!flight.glider.ldgTime) flight.glider.pilots.forEach(addPilot);
    } else if (!flight.ldgTime) {
      flight.pilots.forEach(addPilot);
    }
  }
  return result;
}

export function orderPilotsForSelection(
  pilots: string[],
  blockedAirborne: ReadonlySet<string>,
  blockedComposer: ReadonlySet<string>
): string[] {
  const rank = (pilot: string): number => {
    if (blockedAirborne.has(pilot) || blockedComposer.has(pilot)) return 2;
    return isReusablePassengerPlaceholder(pilot) ? 1 : 0;
  };
  return [...pilots].sort((first, second) => rank(first) - rank(second));
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
    if (
      !towPlane ||
      !towPilot ||
      isReusablePassengerPlaceholder(towPilot) ||
      !gliderPlane ||
      !gliderPilots[0] ||
      isReusablePassengerPlaceholder(gliderPilots[0])
    ) {
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
  if (!plane || !pilots[0] || isReusablePassengerPlaceholder(pilots[0])) {
    throw new Error('Takeoff is incomplete');
  }
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

function recentConfigKey(config: RecentConfig): string {
  const normalize = (value: string): string => value.trim().toLocaleLowerCase();
  if (config.mode === 'aerotow') {
    return [
      config.mode,
      normalize(config.tow.plane.reg),
      normalize(config.tow.pilot),
      normalize(config.glider.plane.reg),
      ...config.glider.pilots.map(normalize)
    ].join('|');
  }
  return [
    config.mode,
    normalize(config.single.plane.reg),
    ...config.single.pilots.map(normalize)
  ].join('|');
}

export function dedupeRecentConfigs(configs: RecentConfig[]): RecentConfig[] {
  const seen = new Set<string>();
  return configs.filter((config) => {
    let key: string;
    try {
      key = recentConfigKey(config);
    } catch {
      return true;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface LandingResult {
  airborne: AirborneFlight[];
  addedLog: LogEntry[];
}

function aerotowLog(flight: AerotowAirborneFlight): LogEntry[] {
  const towBase = flight.reopenedLog?.tow;
  const gliderBase = flight.reopenedLog?.glider;
  const pair = towBase?.pair || gliderBase?.pair || uid();
  return [
    {
      ...towBase,
      id: towBase?.id || uid(),
      num: flight.num,
      date: towBase?.date || localDateISO(),
      toTime: flight.toTime,
      fn: 'tow',
      reg: flight.tow.plane.reg,
      acType: flight.tow.plane.type,
      pilots: [flight.tow.pilot],
      ldgTime: flight.tow.ldgTime,
      dur: flight.tow.dur,
      note: towBase?.note || '',
      synced: false,
      pair
    },
    {
      ...gliderBase,
      id: gliderBase?.id || uid(),
      num: flight.num,
      date: gliderBase?.date || localDateISO(),
      toTime: flight.toTime,
      fn: flight.glider.plane.fn,
      reg: flight.glider.plane.reg,
      acType: flight.glider.plane.type,
      pilots: flight.glider.pilots,
      ldgTime: flight.glider.ldgTime,
      dur: flight.glider.dur,
      note: gliderBase?.note || '',
      synced: false,
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
  const base = flight.reopenedLog;
  return {
    airborne,
    addedLog: [
      {
        ...base,
        id: base?.id || uid(),
        num: flight.num,
        date: base?.date || localDateISO(),
        toTime: flight.toTime,
        fn: flight.plane.fn,
        reg: flight.plane.reg,
        acType: flight.plane.type,
        pilots: flight.pilots,
        ldgTime: time,
        dur: flight.dur,
        note: base?.note || '',
        synced: false,
        pair: null
      }
    ]
  };
}

export interface ReopenResult {
  airborne: AirborneFlight[];
  log: LogEntry[];
  reopened: AirborneFlight | null;
}

function aircraftFromLog(entry: LogEntry, planes: Aircraft[]): Aircraft {
  const known = planes.find((plane) => plane.reg === entry.reg);
  if (known) return { ...known };
  return {
    id: uid(),
    reg: entry.reg,
    type: entry.acType,
    seats: Math.max(1, entry.pilots.filter(Boolean).length),
    fn: entry.fn,
    takeoffTypes: []
  };
}

export function reopenLogEntry(state: AppState, entryId: string): ReopenResult {
  const selected = state.log.find((entry) => entry.id === entryId);
  if (!selected) return { airborne: state.airborne, log: state.log, reopened: null };

  const partner = selected.pair
    ? state.log.find(
        (entry) => entry.pair === selected.pair && entry.id !== selected.id
      )
    : undefined;
  const towEntry = selected.fn === 'tow' ? selected : partner?.fn === 'tow' ? partner : undefined;
  const gliderEntry = selected.fn !== 'tow' ? selected : partner?.fn !== 'tow' ? partner : undefined;

  if (towEntry && gliderEntry) {
    const reopenTow = selected.id === towEntry.id;
    const flight: AerotowAirborneFlight = {
      id: uid(),
      type: 'aerotow',
      num: selected.num,
      toTime: selected.toTime,
      tow: {
        plane: aircraftFromLog(towEntry, state.planes),
        pilot: towEntry.pilots[0] || '',
        ldgTime: reopenTow ? null : towEntry.ldgTime,
        dur: reopenTow ? null : towEntry.dur
      },
      glider: {
        plane: aircraftFromLog(gliderEntry, state.planes),
        pilots: gliderEntry.pilots.filter(Boolean),
        ldgTime: reopenTow ? gliderEntry.ldgTime : null,
        dur: reopenTow ? gliderEntry.dur : null
      },
      reopenedLog: {
        tow: structuredClone(towEntry),
        glider: structuredClone(gliderEntry)
      }
    };
    const removed = new Set([towEntry.id, gliderEntry.id]);
    return {
      airborne: [...state.airborne, flight],
      log: state.log.filter((entry) => !removed.has(entry.id)),
      reopened: flight
    };
  }

  const flight: AirborneFlight = {
    id: uid(),
    type: 'single',
    num: selected.num,
    toTime: selected.toTime,
    plane: aircraftFromLog(selected, state.planes),
    pilots: selected.pilots.filter(Boolean),
    ldgTime: null,
    dur: null,
    reopenedLog: structuredClone(selected)
  };
  return {
    airborne: [...state.airborne, flight],
    log: state.log
      .filter((entry) => entry.id !== selected.id)
      .map((entry) =>
        entry.pair === selected.pair ? { ...entry, pair: null } : entry
      ),
    reopened: flight
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
