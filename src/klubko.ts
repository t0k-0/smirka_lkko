import md5 from 'blueimp-md5';
import { intervalsOverlap, localDateISO, localTime, timeToMinutes } from './time';
import type {
  ApiFlightResponse,
  KlubkoConfig,
  KlubkoFlightDto,
  LogEntry,
  PushAnalysis
} from './types';
import { ConfigRepository } from './persistence';

interface ApiEnvelope {
  status?: string;
  message?: string;
  data?: any;
  flights?: any[];
  flight?: any;
  timezone_name?: string;
}

export interface KlubkoClient {
  getConfig(): KlubkoConfig;
  setUseTest(value: boolean): void;
  setProxy(value: string): void;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  verifySession(): Promise<void>;
  isAuthenticated(): boolean;
  onAuthChange(callback: (authenticated: boolean) => void): () => void;
  getAirplanes(): Promise<unknown[]>;
  getPersons(): Promise<unknown[]>;
  getTasks(): Promise<unknown[]>;
  getAirplaneTakeoffTypes(): Promise<unknown>;
  getFlightsOfDay(date: string): Promise<ApiFlightResponse[]>;
  editFlights(flights: KlubkoFlightDto[] | Record<string, unknown>[]): Promise<ApiEnvelope>;
}

const TEST_ENDPOINTS = [
  'edit-flights/',
  'tasks/',
  'flight-dates/',
  'get-flight/',
  'get-flights-of-day/'
];

export function endpointFor(endpoint: string, useTest: boolean): string {
  if (!useTest || endpoint === 'login/' || endpoint === 'logout/') return endpoint;
  return TEST_ENDPOINTS.some((allowed) => endpoint.startsWith(allowed))
    ? `test-${endpoint}`
    : endpoint;
}

export function normalizeProxy(value: string): string {
  const trimmed = value.trim();
  return trimmed && !trimmed.endsWith('/') ? `${trimmed}/` : trimmed;
}

export class HttpKlubkoClient implements KlubkoClient {
  private config: KlubkoConfig;
  private authenticated = false;
  private callbacks = new Set<(value: boolean) => void>();
  private heartbeat: number | undefined;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly configRepository: ConfigRepository,
    fetcher?: typeof fetch
  ) {
    this.config = configRepository.load();
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  getConfig(): KlubkoConfig {
    return { ...this.config };
  }

  setUseTest(value: boolean): void {
    this.config.useTest = value;
    this.saveConfig();
  }

  setProxy(value: string): void {
    this.config.proxyUrl = normalizeProxy(value);
    this.saveConfig();
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  onAuthChange(callback: (authenticated: boolean) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private setAuthenticated(value: boolean): void {
    if (this.authenticated === value) return;
    this.authenticated = value;
    this.callbacks.forEach((callback) => callback(value));
  }

  private saveConfig(): void {
    this.configRepository.save(this.config);
  }

  private buildUrl(endpoint: string): string {
    const resolved = endpointFor(endpoint, this.config.useTest);
    return this.config.proxyUrl
      ? `${this.config.proxyUrl}rest-api/${resolved}`
      : `${this.config.baseUrl}${resolved}`;
  }

  private async request(endpoint: string, init: RequestInit = {}): Promise<ApiEnvelope> {
    const bodyIsForm = init.body instanceof FormData;
    const response = await this.fetchWithRetry(this.buildUrl(endpoint), {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(bodyIsForm ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
        ...init.headers
      }
    });
    const text = await response.text();
    let data: ApiEnvelope;
    try {
      data = JSON.parse(text) as ApiEnvelope;
    } catch {
      throw new Error(`Invalid JSON response (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let error: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetcher(url, init);
      } catch (caught) {
        error = caught;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
    throw error instanceof Error ? error : new Error('NETWORK_ERROR: Cannot reach API');
  }

  async login(username: string, password: string): Promise<void> {
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);
    const response = await this.fetchWithRetry(this.buildUrl('login/'), {
      method: 'POST',
      credentials: 'include',
      body: form
    });
    const data = (await response.json()) as ApiEnvelope;
    if (!response.ok || data.status !== 'OK') throw new Error(data.message || 'Login failed');
    this.config.username = username;
    this.config.authMode = 'password';
    await this.verifySession();
    this.saveConfig();
    this.startHeartbeat();
  }

  async verifySession(): Promise<void> {
    try {
      let data = await this.request('');
      if (data.status !== 'OK') data = await this.request('login/');
      if (data.status !== 'OK') throw new Error(data.message || 'Session verification failed');
      this.config.timezone = data.timezone_name || 'Europe/Prague';
      this.saveConfig();
      this.setAuthenticated(true);
    } catch (error) {
      this.setAuthenticated(false);
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.stopHeartbeat();
    this.config.username = '';
    this.setAuthenticated(false);
    this.saveConfig();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      void this.verifySession().catch(() => this.stopHeartbeat());
    }, 5 * 60 * 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== undefined) window.clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private async getData(endpoint: string): Promise<any> {
    const response = await this.request(endpoint);
    if (response.status !== 'OK') throw new Error(response.message || 'API request failed');
    return response.data;
  }

  getAirplanes(): Promise<unknown[]> {
    return this.getData('airplanes/');
  }

  getPersons(): Promise<unknown[]> {
    return this.getData('persons/');
  }

  getTasks(): Promise<unknown[]> {
    return this.getData('tasks/');
  }

  getAirplaneTakeoffTypes(): Promise<unknown> {
    return this.getData('airplane-takeoff-types/');
  }

  async getFlightsOfDay(date: string): Promise<ApiFlightResponse[]> {
    const response = await this.request(`get-flights-of-day/?date=${encodeURIComponent(date)}`);
    return Array.isArray(response.flights) ? (response.flights as ApiFlightResponse[]) : [];
  }

  editFlights(flights: KlubkoFlightDto[] | Record<string, unknown>[]): Promise<ApiEnvelope> {
    return this.request('edit-flights/', {
      method: 'POST',
      body: JSON.stringify(flights)
    }).then((response) => {
      if (response.status === 'ERROR') throw new Error(response.message || 'Flight update failed');
      return response;
    });
  }
}

export function roleToPowered(role: string): 'A' | 'M' | 'W' {
  if (role === 'tow') return 'A';
  if (role === 'motorized') return 'M';
  return 'W';
}

export function logToApiFlight(entry: LogEntry): KlubkoFlightDto {
  return {
    ...(entry.flight_id ? { flight_id: entry.flight_id } : {}),
    ...(entry.snap ? { snap: entry.snap } : {}),
    ...(entry.pay ? { pay: entry.pay } : {}),
    date: entry.date || localDateISO(),
    takeoff: entry.toTime || localTime(),
    duration: entry.dur ? timeToMinutes(entry.dur) : 0,
    sign: entry.reg,
    crew: entry.pilots.filter(Boolean),
    starts: entry.starts || 1,
    powered: roleToPowered(entry.fn),
    task: entry.task || '',
    note: entry.note || ''
  };
}

export function computeSnap(flight: KlubkoFlightDto): string {
  const crew = `[${flight.crew.join(', ')}]`;
  const pay = flight.pay
    ? ` [${Object.entries(flight.pay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${name}: ${String(value)}`)
        .join(', ')}]`
    : '';
  return md5(
    `${flight.date}T${flight.takeoff} ${flight.duration} ${flight.starts}${flight.powered} ${
      flight.sign
    } ${crew} "${flight.task}" "${flight.note}"${pay}`
  );
}

export function analyzePush(
  localFlights: LogEntry[],
  serverFlights: ApiFlightResponse[]
): PushAnalysis {
  const analysis: PushAnalysis = { toCreate: [], toUpdate: [], errors: [] };
  for (const local of localFlights) {
    const api = logToApiFlight(local);
    const server = serverFlights.find(
      (candidate) =>
        candidate.sign === api.sign &&
        intervalsOverlap(
          candidate.takeoff,
          Number(candidate.duration) || 0,
          api.takeoff,
          Number(api.duration) || 0
        )
    );
    if (!server) {
      analysis.toCreate.push({ local, api });
      continue;
    }
    analysis.toUpdate.push({
      local,
      server,
      api: {
        flight_id: server.flight_id,
        date: server.date || api.date,
        takeoff: server.takeoff,
        duration: Number(server.duration) || api.duration,
        sign: server.sign,
        crew: api.crew,
        starts: Number(server.starts) || api.starts || 1,
        powered: server.powered || api.powered,
        task: server.task || '',
        note: server.note || '',
        ...(api.pay ? { pay: api.pay } : {})
      }
    });
  }
  return analysis;
}
