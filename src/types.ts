export type Language = 'en' | 'cs';
export type Theme = 'dark' | 'light';
export type ComposerMode = 'aerotow' | 'single';
export type FlightRole = 'tow' | 'glider' | 'motorized';
export type ComposerSlot = 'tow' | 'glider' | 'single';

export interface Aircraft {
  id: string;
  reg: string;
  type: string;
  seats: number;
  fn: FlightRole;
  takeoffTypes: string[];
}

export interface TowComposer {
  plane: Aircraft | null;
  pilot: string | null;
}

export interface CrewComposer {
  plane: Aircraft | null;
  pilots: [string | null, string | null];
}

export interface ComposerState {
  tow: TowComposer;
  glider: CrewComposer;
  single: CrewComposer;
}

export interface AerotowAirborneFlight {
  id: string;
  type: 'aerotow';
  num: number;
  toTime: string;
  tow: {
    plane: Aircraft;
    pilot: string;
    ldgTime: string | null;
    dur: string | null;
  };
  glider: {
    plane: Aircraft;
    pilots: string[];
    ldgTime: string | null;
    dur: string | null;
  };
  reopenedLog?: {
    tow: LogEntry;
    glider: LogEntry;
  };
}

export interface SingleAirborneFlight {
  id: string;
  type: 'single';
  num: number;
  toTime: string;
  plane: Aircraft;
  pilots: string[];
  ldgTime: string | null;
  dur: string | null;
  reopenedLog?: LogEntry;
}

export type AirborneFlight = AerotowAirborneFlight | SingleAirborneFlight;

export interface LogEntry {
  id: string;
  num: number;
  date?: string;
  toTime: string;
  fn: FlightRole;
  reg: string;
  acType: string;
  pilots: string[];
  ldgTime: string | null;
  dur: string | null;
  note: string;
  pair: string | null;
  synced?: boolean;
  flight_id?: number | string;
  snap?: string;
  starts?: number;
  task?: string;
  pay?: Record<string, unknown>;
}

export interface AerotowRecentConfig {
  id: string;
  ts: number;
  mode: 'aerotow';
  tow: { plane: Aircraft; pilot: string };
  glider: { plane: Aircraft; pilots: string[] };
}

export interface SingleRecentConfig {
  id: string;
  ts: number;
  mode: 'single';
  single: { plane: Aircraft; pilots: string[] };
}

export type RecentConfig = AerotowRecentConfig | SingleRecentConfig;

export interface PendingDailyLog {
  date: string;
  entries: LogEntry[];
}

export interface PersistentState {
  schemaVersion: 1;
  theme: Theme;
  language: Language;
  airport: string;
  planes: Aircraft[];
  pilots: string[];
  log: LogEntry[];
  airborne: AirborneFlight[];
  takeoffs: number;
  dayPlanes: string[];
  dayPilots: string[];
  presetInitialized: boolean;
  recentConfigs: RecentConfig[];
  date: string;
  dayFinalized: boolean;
  pendingLogs: PendingDailyLog[];
}

export interface AppState extends PersistentState {
  mode: ComposerMode;
  comp: ComposerState;
  focus: { slot: ComposerSlot; sub: 'plane' | 'p0' | 'p1' } | null;
  bottomMode: 'idle' | 'planes' | 'pilots' | 'ready' | 'landing' | 'recents';
  landId: string | null;
  landSlot: 'tow' | 'glider' | 'self' | null;
  logFilter: string;
  utcMode: boolean;
}

export interface KlubkoConfig {
  baseUrl: string;
  proxyUrl: string;
  useTest: boolean;
  authMode: 'password' | 'cert';
  username: string;
  timezone: string;
}

export interface KlubkoFlightDto {
  flight_id?: number | string;
  snap?: string;
  date: string;
  takeoff: string;
  duration: number;
  sign: string;
  crew: string[];
  starts: number;
  powered: 'A' | 'M' | 'W';
  task: string;
  note: string;
  pay?: Record<string, unknown>;
}

export interface ApiFlightResponse extends KlubkoFlightDto {
  landing?: string;
}

export type SyncOperation =
  | { type: 'create' | 'update'; flight: LogEntry; timestamp: number; retries: number }
  | { type: 'delete'; flightId: number | string; snap: string; timestamp: number; retries: number };

export interface PushItem {
  local: LogEntry;
  api: KlubkoFlightDto;
  server?: ApiFlightResponse;
}

export interface PushAnalysis {
  toCreate: PushItem[];
  toUpdate: PushItem[];
  errors: string[];
}
