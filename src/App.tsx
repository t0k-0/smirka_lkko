import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import {
  AirbornePanel,
  BottomPanel,
  ComposerPanel,
  filteredLog
} from './components/flight';
import {
  LogOverlay,
  PresetManager,
  PushDialog,
  Settings
} from './components/overlays';
import {
  Header,
  Login,
  TimeDialog,
  ToastStack
} from './components/shell';
import {
  airbornePilots,
  airborneRegistrations,
  composerPilots,
  createTakeoff,
  emptyComposer,
  isComposerReady,
  landFlight,
  normalizeReferenceData,
  recentFromComposer
} from './domain';
import { analyzePush, computeSnap, type KlubkoClient } from './klubko';
import type { AppRepository } from './persistence';
import type { FlightSyncService, SyncStatus } from './sync';
import type {
  Aircraft,
  AppState,
  ComposerSlot,
  LogEntry,
  PushAnalysis,
  RecentConfig
} from './types';
import {
  calculateDuration,
  localDateISO,
  localTime
} from './time';
import { exportFlightLog } from './pdf';

interface Services {
  repository: AppRepository;
  client: KlubkoClient;
  sync: FlightSyncService;
}

type StateAction =
  | { type: 'patch'; patch: Partial<AppState> }
  | { type: 'replace'; state: AppState }
  | { type: 'update'; update: (state: AppState) => AppState };

function reducer(state: AppState, action: StateAction): AppState {
  if (action.type === 'replace') return action.state;
  if (action.type === 'update') return action.update(state);
  return { ...state, ...action.patch };
}

type Overlay =
  | 'none'
  | 'log'
  | 'settings'
  | 'planes'
  | 'pilots'
  | 'push';

interface TimeDialogState {
  title: string;
  value: string;
  confirm: (value: string) => void;
}

interface Toast {
  id: number;
  message: string;
}


function flightAsLogEntries(flight: AppState['airborne'][number]): LogEntry[] {
  const common = {
    date: localDateISO(),
    toTime: flight.toTime,
    ldgTime: null,
    dur: '00:00',
    note: '',
    task: '',
    starts: 1
  };
  if (flight.type === 'aerotow') {
    const pair = flight.id;
    return [
      {
        ...common,
        id: `${flight.id}-tow`,
        num: flight.num,
        fn: 'tow',
        reg: flight.tow.plane.reg,
        acType: flight.tow.plane.type,
        pilots: [flight.tow.pilot],
        pair
      },
      {
        ...common,
        id: `${flight.id}-glider`,
        num: flight.num,
        fn: flight.glider.plane.fn,
        reg: flight.glider.plane.reg,
        acType: flight.glider.plane.type,
        pilots: flight.glider.pilots,
        pair
      }
    ];
  }
  return [
    {
      ...common,
      id: flight.id,
      num: flight.num,
      fn: flight.plane.fn,
      reg: flight.plane.reg,
      acType: flight.plane.type,
      pilots: flight.pilots,
      pair: null
    }
  ];
}

export function App({ services }: { services: Services }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => services.repository.load());
  const [authenticated, setAuthenticated] = useState(services.client.isAuthenticated());
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [timeDialog, setTimeDialog] = useState<TimeDialogState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(services.sync.status());
  const [autoSync, setAutoSync] = useState(true);
  const [pushAnalysis, setPushAnalysis] = useState<PushAnalysis | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const toastId = useRef(0);
  const bottomTouch = useRef<{ x: number; y: number } | null>(null);

  const notify = (message: string, timeout = 1800) => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(
      () => setToasts((items) => items.filter((item) => item.id !== id)),
      timeout
    );
  };

  useEffect(() => {
    document.body.dataset.theme = state.theme;
    document.documentElement.lang = state.language;
    const icon = document.querySelector<HTMLLinkElement>('#page-favicon');
    if (icon) {
      icon.href = `${import.meta.env.BASE_URL}icon_${
        state.theme === 'dark' ? 'darkmode' : 'lightmode'
      }.svg`;
    }
    services.repository.save(state);
  }, [services.repository, state]);

  useEffect(
    () =>
      services.client.onAuthChange((value) => {
        setAuthenticated(value);
        if (!value) {
          setOverlay('none');
          notify('KLUBKO SESSION EXPIRED - LOGIN AGAIN TO SYNC', 3000);
        }
      }),
    [services.client]
  );

  useEffect(() => services.sync.onChange(setSyncStatus), [services.sync]);

  useEffect(() => {
    const online = () => {
      if (autoSync && services.client.isAuthenticated()) void services.sync.drain();
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [autoSync, services.client, services.sync]);

  const patch = (value: Partial<AppState>) => dispatch({ type: 'patch', patch: value });
  const update = (fn: (current: AppState) => AppState) =>
    dispatch({ type: 'update', update: fn });

  const resetComposer = (mode = state.mode) =>
    patch({
      mode,
      comp: emptyComposer(),
      focus: null,
      bottomMode: 'idle'
    });

  const advanceComposer = (candidate: AppState) => {
    if (isComposerReady(candidate)) {
      return { ...candidate, focus: null, bottomMode: 'ready' as const };
    }
    if (candidate.mode === 'aerotow') {
      if (!candidate.comp.tow.plane)
        return {
          ...candidate,
          focus: { slot: 'tow' as const, sub: 'plane' as const },
          bottomMode: 'planes' as const
        };
      if (!candidate.comp.tow.pilot)
        return {
          ...candidate,
          focus: { slot: 'tow' as const, sub: 'p0' as const },
          bottomMode: 'pilots' as const
        };
      if (!candidate.comp.glider.plane)
        return {
          ...candidate,
          focus: { slot: 'glider' as const, sub: 'plane' as const },
          bottomMode: 'planes' as const
        };
      return {
        ...candidate,
        focus: { slot: 'glider' as const, sub: 'p0' as const },
        bottomMode: 'pilots' as const
      };
    }
    if (!candidate.comp.single.plane)
      return {
        ...candidate,
        focus: { slot: 'single' as const, sub: 'plane' as const },
        bottomMode: 'planes' as const
      };
    return {
      ...candidate,
      focus: { slot: 'single' as const, sub: 'p0' as const },
      bottomMode: 'pilots' as const
    };
  };

  const focusSlot = (
    slot: ComposerSlot,
    sub?: 'plane' | 'p0' | 'p1'
  ) => {
    const plane =
      slot === 'tow'
        ? state.comp.tow.plane
        : slot === 'glider'
          ? state.comp.glider.plane
          : state.comp.single.plane;
    patch({
      focus: {
        slot,
        sub:
          sub ??
          (plane
            ? slot === 'tow'
              ? 'p0'
              : state.comp[slot].pilots[0]
                ? 'p1'
                : 'p0'
            : 'plane')
      },
      bottomMode: plane ? 'pilots' : 'planes'
    });
  };

  const selectPlane = (plane: Aircraft) => {
    update((current) => {
      const next = structuredClone(current);
      const slot = next.focus?.slot;
      if (!slot) return current;
      if (slot === 'tow') next.comp.tow = { plane, pilot: null };
      else next.comp[slot] = { plane, pilots: [null, null] };
      next.focus = { slot, sub: 'p0' };
      next.bottomMode = 'pilots';
      return next;
    });
  };

  const selectPilot = (pilot: string, target = state.focus) => {
    if (!target || target.sub === 'plane') return;
    if (airbornePilots(state.airborne).has(pilot)) {
      notify(`${pilot.split(' ')[0]!.toUpperCase()} IS AIRBORNE`);
      return;
    }
    const occupied = composerPilots({ ...state, focus: target }, true);
    if (occupied.has(pilot)) {
      notify('ALREADY IN THIS TAKEOFF');
      return;
    }
    update((current) => {
      const next = structuredClone(current);
      if (target.slot === 'tow') next.comp.tow.pilot = pilot;
      else {
        const index = target.sub === 'p1' ? 1 : 0;
        next.comp[target.slot].pilots[index] = pilot;
        const plane = next.comp[target.slot].plane;
        if (index === 0 && plane?.seats === 2) {
          next.focus = { slot: target.slot, sub: 'p1' };
          next.bottomMode = 'pilots';
          return next;
        }
      }
      return advanceComposer(next);
    });
  };

  const clearSlot = (slot: ComposerSlot) => {
    update((current) => {
      const next = structuredClone(current);
      if (slot === 'tow') next.comp.tow = { plane: null, pilot: null };
      else next.comp[slot] = { plane: null, pilots: [null, null] };
      next.focus = null;
      next.bottomMode = 'idle';
      return next;
    });
  };

  const takeoff = (time = localTime()) => {
    if (!isComposerReady(state)) return;
    const flight = createTakeoff(state, time);
    const recent = recentFromComposer(state);
    update((current) => ({
      ...current,
      airborne: [...current.airborne, flight],
      takeoffs: current.takeoffs + 1,
      recentConfigs: [recent, ...current.recentConfigs].slice(0, 5),
      comp: emptyComposer(),
      focus: null,
      bottomMode: 'idle'
    }));
    flightAsLogEntries(flight).forEach((entry) => {
      void services.sync.submitOrQueue('create', entry, autoSync);
    });
  };

  const chooseLanding = (
    id: string,
    slot: 'tow' | 'glider' | 'self'
  ) => {
    patch({ landId: id, landSlot: slot, bottomMode: 'landing' });
  };

  const landing = (time = localTime()) => {
    if (!state.landId || !state.landSlot) return;
    const result = landFlight(state.airborne, state.landId, state.landSlot, time);
    update((current) => ({
      ...current,
      airborne: result.airborne,
      log: [...current.log, ...result.addedLog],
      landId: null,
      landSlot: null,
      bottomMode: 'idle'
    }));
    result.addedLog.forEach((entry) => {
      void services.sync.submitOrQueue('update', entry, autoSync);
    });
  };

  const loadRecent = (config: RecentConfig) => {
    const unavailablePilots = airbornePilots(state.airborne);
    const unavailablePlanes = airborneRegistrations(state.airborne);
    const comp = emptyComposer();
    if (config.mode === 'aerotow') {
      const tow = state.planes.find((plane) => plane.reg === config.tow.plane.reg);
      if (tow && !unavailablePlanes.has(tow.reg)) {
        comp.tow.plane = tow;
        if (!unavailablePilots.has(config.tow.pilot)) comp.tow.pilot = config.tow.pilot;
      }
      const glider = state.planes.find((plane) => plane.reg === config.glider.plane.reg);
      if (glider && !unavailablePlanes.has(glider.reg)) {
        comp.glider.plane = glider;
        config.glider.pilots.forEach((pilot, index) => {
          if (index < 2 && !unavailablePilots.has(pilot)) comp.glider.pilots[index] = pilot;
        });
      }
    } else {
      const plane = state.planes.find((item) => item.reg === config.single.plane.reg);
      if (plane && !unavailablePlanes.has(plane.reg)) {
        comp.single.plane = plane;
        config.single.pilots.forEach((pilot, index) => {
          if (index < 2 && !unavailablePilots.has(pilot)) comp.single.pilots[index] = pilot;
        });
      }
    }
    const candidate = { ...state, mode: config.mode, comp };
    dispatch({ type: 'replace', state: advanceComposer(candidate) });
  };

  const syncReferenceData = async () => {
    if (!services.client.isAuthenticated()) return;
    try {
      const [planes, people, , takeoffTypes] = await Promise.all([
        services.client.getAirplanes(),
        services.client.getPersons(),
        services.client.getTasks(),
        services.client.getAirplaneTakeoffTypes()
      ]);
      const normalized = normalizeReferenceData(planes, people, takeoffTypes);
      update((current) => ({
        ...current,
        ...normalized,
        dayPlanes: current.dayPlanes.filter((reg) =>
          normalized.planes.some((plane) => plane.reg === reg)
        ),
        dayPilots: current.dayPilots.filter((pilot) => normalized.pilots.includes(pilot)),
        presetInitialized: true
      }));
      notify(`SYNCED ${normalized.planes.length} PLANES, ${normalized.pilots.length} PILOTS`, 2200);
    } catch (error) {
      notify(`SYNC FAILED: ${error instanceof Error ? error.message : String(error)}`, 3000);
    }
  };

  const deleteLogEntry = (entry: LogEntry) => {
    const partner = entry.pair
      ? state.log.find((candidate) => candidate.pair === entry.pair && candidate.id !== entry.id)
      : undefined;
    if (
      !window.confirm(
        `DELETE FLIGHT #${entry.num} - ${entry.reg}${partner ? ` + ${partner.reg}` : ''}?`
      )
    )
      return;
    let ids = new Set([entry.id]);
    if (partner && window.confirm(`Also delete aerotow partner ${partner.reg}?`)) {
      ids = new Set([entry.id, partner.id]);
    }
    update((current) => ({
      ...current,
      log: current.log
        .filter((item) => !ids.has(item.id))
        .map((item) =>
          item.pair === entry.pair && !ids.has(item.id) ? { ...item, pair: null } : item
        )
    }));
    if (entry.flight_id && entry.snap)
      services.sync.enqueueDelete(entry.flight_id, entry.snap);
  };

  const editEntry = (id: string, field: 'pilot0' | 'pilot1' | 'note') => {
    const entry = state.log.find((item) => item.id === id);
    if (!entry) return;
    const index = field === 'pilot1' ? 1 : 0;
    const current =
      field === 'note' ? entry.note : entry.pilots[index] || '';
    if (field !== 'note') {
      openPilotPicker(current, state.dayPilots, (value) => {
        update((app) => ({
          ...app,
          log: app.log.map((item) => {
            if (item.id !== id) return item;
            const pilots = [...item.pilots];
            pilots[index] = value;
            return { ...item, pilots };
          })
        }));
      });
      return;
    }
    const value = window.prompt(
      `Note for ${entry.reg}:`,
      current
    );
    if (value === null) return;
    update((app) => ({
      ...app,
      log: app.log.map((item) => {
        if (item.id !== id) return item;
        if (field === 'note') return { ...item, note: value.trim() };
        const pilots = [...item.pilots];
        pilots[index] = value.trim();
        return { ...item, pilots };
      })
    }));
  };

  const openPilotPicker = (
    current: string,
    pilots: string[],
    confirm: (value: string) => void
  ) => {
    const options = [...new Set([current, ...pilots].filter(Boolean))];
    if (!options.length) return;
    const select = document.createElement('select');
    select.value = current;
    select.setAttribute('aria-label', 'Select pilot');
    options.forEach((pilot) => {
      const option = document.createElement('option');
      option.value = pilot;
      option.textContent = pilot;
      select.appendChild(option);
    });
    select.style.position = 'fixed';
    select.style.opacity = '0';
    select.style.pointerEvents = 'none';
    document.body.appendChild(select);
    const cleanup = () => {
      select.removeEventListener('change', changed);
      select.removeEventListener('cancel', cleanup);
      select.remove();
    };
    const changed = () => {
      if (select.value) confirm(select.value);
      cleanup();
    };
    select.addEventListener('change', changed, { once: true });
    select.addEventListener('cancel', cleanup, { once: true });
    try {
      if (typeof select.showPicker === 'function') {
        select.showPicker();
      } else {
        cleanup();
        const fallback = window.prompt(`Select pilot:\n${options.join('\n')}`, current);
        if (fallback !== null && options.includes(fallback.trim())) confirm(fallback.trim());
      }
    } catch {
      cleanup();
      const fallback = window.prompt(`Select pilot:\n${options.join('\n')}`, current);
      if (fallback !== null && options.includes(fallback.trim())) confirm(fallback.trim());
    }
  };

  const editTime = (entry: LogEntry, field: 'toTime' | 'ldgTime') => {
    openTimePicker(
      entry[field] || localTime(),
      (value) => {
        update((current) => {
          const log = current.log.map((item) => {
            const same = item.id === entry.id || (field === 'toTime' && entry.pair && item.pair === entry.pair);
            if (!same) return item;
            const changed = { ...item, [field]: value };
            return {
              ...changed,
              dur:
                changed.toTime && changed.ldgTime
                  ? calculateDuration(changed.toTime, changed.ldgTime)
                  : changed.dur
            };
          });
          return { ...current, log };
        });
      },
      field === 'toTime' ? 'EDIT TAKEOFF TIME' : 'EDIT LANDING TIME'
    );
  };

  const openTimePicker = (
    value: string,
    confirm: (value: string) => void,
    title: string
  ) => {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    input.setAttribute('aria-label', title);
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    const cleanup = () => {
      input.removeEventListener('change', changed);
      input.removeEventListener('cancel', cleanup);
      input.remove();
    };
    const changed = () => {
      if (input.value) confirm(input.value);
      cleanup();
    };
    input.addEventListener('change', changed, { once: true });
    input.addEventListener('cancel', cleanup, { once: true });
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        setTimeDialog({ title, value, confirm });
        cleanup();
      }
    } catch {
      setTimeDialog({ title, value, confirm });
      cleanup();
    }
  };

  const preparePush = async () => {
    setOverlay('push');
    setPushBusy(true);
    setPushAnalysis(null);
    try {
      const local = state.log.filter(
        (entry) => entry.toTime && (!entry.date || entry.date === localDateISO())
      );
      const server = await services.client.getFlightsOfDay(localDateISO());
      setPushAnalysis(analyzePush(local, server));
    } catch (error) {
      notify(`FAILED TO PREPARE PUSH: ${error instanceof Error ? error.message : String(error)}`, 3000);
    } finally {
      setPushBusy(false);
    }
  };

  const confirmPush = async () => {
    if (!pushAnalysis) return;
    setPushBusy(true);
    const failures: string[] = [];
    for (const item of [...pushAnalysis.toCreate, ...pushAnalysis.toUpdate]) {
      try {
        if (item.server) item.api.snap = computeSnap(item.api);
        await services.client.editFlights([item.api]);
        update((current) => ({
          ...current,
          log: current.log.map((entry) =>
            entry.id === item.local.id ? { ...entry, synced: true } : entry
          )
        }));
      } catch (error) {
        failures.push(`${item.api.sign}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setPushBusy(false);
    if (failures.length) notify(`PUSH FINISHED WITH ${failures.length} ERROR(S)`, 3000);
    else {
      notify(`PUSHED ${pushAnalysis.toCreate.length + pushAnalysis.toUpdate.length} FLIGHTS`, 2500);
      setOverlay('none');
    }
  };

  if (!authenticated) {
    return (
      <>
        <Login
          state={state}
          client={services.client}
          onLanguage={(language) => patch({ language })}
          onTheme={() => patch({ theme: state.theme === 'dark' ? 'light' : 'dark' })}
          onSuccess={async () => {
            setAuthenticated(true);
            await syncReferenceData();
            if (autoSync) await services.sync.drain();
          }}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <div id="app">
        <Header
          state={state}
          syncStatus={syncStatus}
          online={authenticated}
          onLog={() => setOverlay('log')}
          onSettings={() => setOverlay('settings')}
        />
        <AirbornePanel state={state} onLand={chooseLanding} />
        <ComposerPanel
          state={state}
          onMode={(mode) => resetComposer(mode)}
          onFocus={focusSlot}
          onClear={clearSlot}
          onDropPilot={(pilot, slot, sub) => selectPilot(pilot, { slot, sub })}
        />
        <div class="panel" id="bottom-panel">
          <div
            id="bottom-content"
            onTouchStart={(event) => {
              if (state.bottomMode !== 'idle' && state.bottomMode !== 'recents') return;
              const point = event.touches[0];
              if (point) bottomTouch.current = { x: point.clientX, y: point.clientY };
            }}
            onTouchEnd={(event) => {
              const start = bottomTouch.current;
              const end = event.changedTouches[0];
              bottomTouch.current = null;
              if (!start || !end) return;
              const dx = end.clientX - start.x;
              const dy = end.clientY - start.y;
              if (Math.abs(dx) <= 52 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
              if (dx < 0 && state.bottomMode === 'idle' && state.recentConfigs.length) {
                patch({ bottomMode: 'recents' });
              } else if (dx > 0 && state.bottomMode === 'recents') {
                patch({ bottomMode: 'idle' });
              }
            }}
          >
            <BottomPanel
              state={state}
              onPatch={patch}
              onPlane={selectPlane}
              onPilot={selectPilot}
              onTakeoff={takeoff}
              onLanding={landing}
              onCancelLanding={() =>
                patch({ landId: null, landSlot: null, bottomMode: 'idle' })
              }
              onClear={() => resetComposer()}
              onTime={(kind) =>
                openTimePicker(
                  localTime(),
                  kind === 'takeoff' ? takeoff : landing,
                  kind === 'takeoff' ? 'SET TAKEOFF TIME' : 'SET LANDING TIME'
                )
              }
              onRecent={loadRecent}
              notify={notify}
            />
          </div>
        </div>
      </div>
      {overlay === 'log' && (
        <LogOverlay
          state={state}
          onClose={() => setOverlay('none')}
          onPatch={patch}
          onEdit={editEntry}
          onEditTime={editTime}
          onDelete={deleteLogEntry}
          onExport={() =>
            void exportFlightLog(
              filteredLog(state),
              state.language,
              state.airport,
              state.logFilter
            ).catch(() => notify('PDF EXPORT FAILED', 2500))
          }
          onPush={() => void preparePush()}
        />
      )}
      {overlay === 'settings' && (
        <Settings
          state={state}
          client={services.client}
          onClose={() => setOverlay('none')}
          onPatch={patch}
          onSync={() => void syncReferenceData()}
          onManager={(kind) => setOverlay(kind)}
          onLogout={() => void services.client.logout()}
          onClearLog={() => {
            if (window.confirm('CLEAR FLIGHT LOG? This cannot be undone.')) {
              patch({ log: [], takeoffs: 0 });
              setOverlay('none');
            }
          }}
        />
      )}
      {(overlay === 'planes' || overlay === 'pilots') && (
        <PresetManager
          kind={overlay}
          state={state}
          onPatch={patch}
          onClose={() => setOverlay('settings')}
          notify={notify}
        />
      )}
      {overlay === 'push' && (
        <PushDialog
          analysis={pushAnalysis}
          busy={pushBusy}
          onClose={() => setOverlay('none')}
          onConfirm={() => void confirmPush()}
        />
      )}
      {timeDialog && (
        <TimeDialog
          dialog={timeDialog}
          onClose={() => setTimeDialog(null)}
        />
      )}
      <ToastStack toasts={toasts} />
    </>
  );
}
