

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Aircraft, AppState, ComposerMode, ComposerSlot, LogEntry, RecentConfig } from '../types';
import { airbornePilots, airborneRegistrations, composerPilots, isComposerReady, sortLog } from '../domain';
import { localTime } from '../time';
import { translate } from '../i18n';

const roleLabel = { tow: 'TOW', glider: 'GLI', motorized: 'MOT' } as const;

export function AirbornePanel({
  state,
  onLand
}: {
  state: AppState;
  onLand: (id: string, slot: 'tow' | 'glider' | 'self') => void;
}) {
  return (
    <div class="panel" id="top-panel">
      <div class="panel-label">
        {translate(state.language, 'airborne')} <span class="cnt">{state.airborne.length || ''}</span>
      </div>
      <div id="airborne-scroll">
        {!state.airborne.length && <div class="no-abn">{translate(state.language, 'noFlightsAirborne')}</div>}
        {state.airborne.map((flight) =>
          flight.type === 'aerotow' ? (
            <div
              class={`abn-entry aerotow${state.landId === flight.id ? ' land-sel' : ''}`}
              key={flight.id}
            >
              <div class="abn-badge">{translate(state.language, 'aerotow')} · #{flight.num}</div>
              <AirborneRow
                role="tow"
                reg={flight.tow.plane.reg}
                pilots={[flight.tow.pilot]}
                takeoff={flight.toTime}
                landing={flight.tow.ldgTime}
                selected={state.landId === flight.id && state.landSlot === 'tow'}
                onClick={() => !flight.tow.ldgTime && onLand(flight.id, 'tow')}
              />
              <AirborneRow
                role="glider"
                reg={flight.glider.plane.reg}
                pilots={flight.glider.pilots}
                takeoff={flight.toTime}
                landing={flight.glider.ldgTime}
                selected={state.landId === flight.id && state.landSlot === 'glider'}
                onClick={() => !flight.glider.ldgTime && onLand(flight.id, 'glider')}
              />
            </div>
          ) : (
            <div
              class={`abn-entry single-${flight.plane.fn}${
                state.landId === flight.id ? ' land-sel' : ''
              }`}
              key={flight.id}
            >
              <AirborneRow
                role={flight.plane.fn}
                reg={flight.plane.reg}
                pilots={flight.pilots}
                takeoff={flight.toTime}
                landing={flight.ldgTime}
                selected={state.landId === flight.id}
                onClick={() => onLand(flight.id, 'self')}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function AirborneRow({
  role,
  reg,
  pilots,
  takeoff,
  landing,
  selected,
  onClick
}: {
  role: 'tow' | 'glider' | 'motorized';
  reg: string;
  pilots: string[];
  takeoff: string;
  landing: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={`abn-row${landing ? ' done' : ''}${selected ? ' land-sel' : ''}`}
      onClick={onClick}
    >
      <span class={`fn-badge ${role}`}>{roleLabel[role]}</span>
      <span class="abn-info">
        <span class={`abn-reg ${role}`}>{reg}</span>
        <span class="abn-pilot">{pilots.join(', ')}</span>
      </span>
      <span class="abn-time-col">
        <span class="abn-time">{takeoff}</span>
        {landing && <span class="abn-ldg">{landing}</span>}
      </span>
      {landing ? <span class="ldg-ok">LDG</span> : <span class="abn-tap-arr">▼</span>}
    </button>
  );
}

export function ComposerPanel({
  state,
  onMode,
  onFocus,
  onClear,
  onDropPilot
}: {
  state: AppState;
  onMode: (mode: ComposerMode) => void;
  onFocus: (slot: ComposerSlot, sub?: 'plane' | 'p0' | 'p1') => void;
  onClear: (slot: ComposerSlot) => void;
  onDropPilot: (
    pilot: string,
    slot: ComposerSlot,
    sub: 'p0' | 'p1'
  ) => void;
}) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      class="panel"
      id="composer-panel"
      onTouchStart={(event) => {
        const point = event.touches[0];
        if (point) touch.current = { x: point.clientX, y: point.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        const end = event.changedTouches[0];
        touch.current = null;
        if (!start || !end) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          onMode(state.mode === 'aerotow' ? 'single' : 'aerotow');
        }
      }}
    >
      <div id="mode-bar">
        <span class="swipe-hint L">←</span>
        <div class="mode-tabs">
          <button
            class={`mode-tab${state.mode === 'aerotow' ? ' active' : ''}`}
            onClick={() => onMode('aerotow')}
          >
            {translate(state.language, 'aerotow')}
          </button>
          <button
            class={`mode-tab${state.mode === 'single' ? ' active' : ''}`}
            onClick={() => onMode('single')}
          >
            {translate(state.language, 'single')}
          </button>
        </div>
        <span class="swipe-hint R">→</span>
      </div>
      <div id="composer-body">
        {state.mode === 'aerotow' ? (
          <>
            <FlightSlot
              slot="tow"
              language={state.language}
              plane={state.comp.tow.plane}
              pilots={[state.comp.tow.pilot]}
              focused={state.focus?.slot === 'tow'}
              onFocus={onFocus}
              onClear={onClear}
              onDropPilot={onDropPilot}
            />
            <FlightSlot
              slot="glider"
              language={state.language}
              plane={state.comp.glider.plane}
              pilots={state.comp.glider.pilots}
              focused={state.focus?.slot === 'glider'}
              onFocus={onFocus}
              onClear={onClear}
              onDropPilot={onDropPilot}
            />
          </>
        ) : (
          <FlightSlot
            slot="single"
            language={state.language}
            plane={state.comp.single.plane}
            pilots={state.comp.single.pilots}
            focused={state.focus?.slot === 'single'}
            onFocus={onFocus}
            onClear={onClear}
            onDropPilot={onDropPilot}
          />
        )}
      </div>
    </div>
  );
}

export function FlightSlot({
  slot,
  language,
  plane,
  pilots,
  focused,
  onFocus,
  onClear,
  onDropPilot
}: {
  slot: ComposerSlot;
  language: 'en' | 'cs';
  plane: Aircraft | null;
  pilots: readonly (string | null)[];
  focused: boolean;
  onFocus: (slot: ComposerSlot, sub?: 'plane' | 'p0' | 'p1') => void;
  onClear: (slot: ComposerSlot) => void;
  onDropPilot: (
    pilot: string,
    slot: ComposerSlot,
    sub: 'p0' | 'p1'
  ) => void;
}) {
  const role = slot === 'tow' ? 'tow' : plane?.fn || 'glider';
  if (!plane) {
    const label =
      slot === 'tow'
        ? translate(language, 'selectTowplane')
        : slot === 'glider'
          ? translate(language, 'selectGlider')
          : translate(language, 'selectAircraft');
    return (
      <button
        class={`slot-card slot-empty ${role}-type${focused ? ' focused' : ''}`}
        onClick={() => onFocus(slot)}
      >
        <span class={`slot-top-bar ${role}`} />
        <span class="slot-empty-label">{label}</span>
        {slot === 'single' && (
          <span class="slot-empty-sub">{translate(language, 'towplaneOrMotorized')}</span>
        )}
      </button>
    );
  }
  return (
    <div
      class={`slot-card ${role}-type${focused ? ' focused' : ''}`}
      onClick={() => onFocus(slot)}
    >
      <div class={`slot-top-bar ${role}`} />
      <div class="slot-inner">
        <div class="slot-plane-row">
          <span class={`fn-badge ${role}`}>{roleLabel[role]}</span>
          <span class={`slot-reg ${role}`}>{plane.reg}</span>
          <span class="slot-actype">{plane.type}</span>
          <button
            class="slot-clr"
            onClick={(event) => {
              event.stopPropagation();
              onClear(slot);
            }}
          >
            CLR
          </button>
        </div>
        <div class="slot-pilots">
          {Array.from({ length: slot === 'tow' ? 1 : plane.seats === 2 ? 2 : 1 }).map(
            (_, index) => {
              const sub = index === 0 ? 'p0' : 'p1';
              return (
                <button
                  class={`p-chip${pilots[index] ? '' : ' empty'}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onFocus(slot, sub);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const pilot = event.dataTransfer?.getData('text/plain');
                    if (pilot) onDropPilot(pilot, slot, sub);
                  }}
                  data-drop-slot={slot}
                  data-drop-sub={sub}
                >
                  {pilots[index] || `${translate(language, 'pilot')}${slot === 'tow' ? '' : ` ${index + 1}`}`}
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}

export function BottomPanel({
  state,
  onPatch,
  onPlane,
  onPilot,
  onTakeoff,
  onLanding,
  onCancelLanding,
  onClear,
  onTime,
  onRecent,
  notify
}: {
  state: AppState;
  onPatch: (patch: Partial<AppState>) => void;
  onPlane: (plane: Aircraft) => void;
  onPilot: (
    pilot: string,
    target?: { slot: ComposerSlot; sub: 'p0' | 'p1' }
  ) => void;
  onTakeoff: () => void;
  onLanding: () => void;
  onCancelLanding: () => void;
  onClear: () => void;
  onTime: (kind: 'takeoff' | 'landing') => void;
  onRecent: (config: RecentConfig) => void;
  notify: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  useEffect(() => setSearch(''), [state.bottomMode, state.focus]);
  if (state.bottomMode === 'planes' && state.focus) {
    const roles =
      state.focus.slot === 'tow'
        ? ['tow']
        : state.focus.slot === 'glider'
          ? ['glider']
          : ['tow', 'motorized'];
    const planes = state.planes.filter(
      (plane) =>
        roles.includes(plane.fn) &&
        state.dayPlanes.includes(plane.reg) &&
        !airborneRegistrations(state.airborne).has(plane.reg) &&
        (!search ||
          plane.reg.toLowerCase().includes(search.toLowerCase()) ||
          plane.type.toLowerCase().includes(search.toLowerCase()))
    );
    return (
      <SelectionPanel
        label={translate(state.language, 'selectAircraftTitle')}
        search={search}
        onSearch={setSearch}
        empty={translate(state.language, 'noMatchingPlanes')}
        language={state.language}
      >
        <div class="sel-grid">
          {planes.map((plane) => (
            <button
              class={`plane-card ${plane.fn}`}
              onClick={() => onPlane(plane)}
              key={plane.id}
            >
              <span class={`pc-reg ${plane.fn}`}>{plane.reg}</span>
              <span class="pc-type">{plane.type}</span>
              <span class="pc-seats">
                {plane.seats} {plane.seats > 1 ? 'SEATS' : 'SEAT'}{' '}
                {plane.takeoffTypes.length ? `· ${plane.takeoffTypes.join('')}` : ''}
              </span>
            </button>
          ))}
          {!planes.length && <div class="no-items">{translate(state.language, 'noMatchingPlanes')}</div>}
        </div>
      </SelectionPanel>
    );
  }
  if (state.bottomMode === 'pilots' && state.focus) {
    const blockedAirborne = airbornePilots(state.airborne);
    const blockedComposer = composerPilots(state, true);
    const pilots = state.pilots.filter(
      (pilot) =>
        state.dayPilots.includes(pilot) &&
        (!search || pilot.toLowerCase().includes(search.toLowerCase()))
    );
    const orderedPilots = [...pilots].sort((first, second) => {
      const firstBlocked = blockedAirborne.has(first) || blockedComposer.has(first);
      const secondBlocked = blockedAirborne.has(second) || blockedComposer.has(second);
      return Number(firstBlocked) - Number(secondBlocked);
    });
    return (
      <SelectionPanel
        label={`${translate(state.language, 'selectPilot')}${state.focus.sub === 'p1' ? '2' : '1'}`}
        search={search}
        onSearch={setSearch}
        empty={translate(state.language, 'noMatchingPilots')}
        language={state.language}
      >
        <div class="drag-hint-bar">{translate(state.language, 'dragToSlot')}</div>
        <div class="pilots-grid">
          {orderedPilots.map((pilot) => {
            const reason = blockedAirborne.has(pilot)
                ? translate(state.language, 'airborne')
              : blockedComposer.has(pilot)
                ? translate(state.language, 'inUse')
                : '';
            return (
              <button
                class={`pilot-card${reason ? ' pilot-unavail' : ''}`}
                disabled={Boolean(reason)}
                draggable={!reason}
                onDragStart={(event) => event.dataTransfer?.setData('text/plain', pilot)}
                onTouchEnd={(event) => {
                  const point = event.changedTouches[0];
                  if (!point) return;
                  const destination = document
                    .elementFromPoint(point.clientX, point.clientY)
                    ?.closest<HTMLElement>('[data-drop-slot]');
                  const slot = destination?.dataset.dropSlot as ComposerSlot | undefined;
                  const sub = destination?.dataset.dropSub as 'p0' | 'p1' | undefined;
                  if (slot && sub) {
                    event.preventDefault();
                    onPilot(pilot, { slot, sub });
                  }
                }}
                onClick={() => onPilot(pilot)}
                key={pilot}
              >
                <span>{pilot}</span>
                {reason && <span class="pilot-unavail-note">{reason}</span>}
              </button>
            );
          })}
          {!pilots.length && <div class="no-items">{translate(state.language, 'noMatchingPilots')}</div>}
        </div>
        {state.focus.sub === 'p1' && (
          <button
            class="btn-solo-full"
            onClick={() => {
              const candidate = { ...state, focus: null, bottomMode: 'ready' as const };
              if (isComposerReady(candidate)) onPatch(candidate);
              else notify('PILOT 1 IS REQUIRED');
            }}
          >
            {translate(state.language, 'soloNoSecond')}
          </button>
        )}
      </SelectionPanel>
    );
  }
  if (state.bottomMode === 'ready') {
    return (
      <div class="action-row">
        <button class="btn-side" onClick={() => onClear()}>
          {translate(state.language, 'clear')}
        </button>
        <button class="btn-log takeoff" onClick={() => onTakeoff()}>
          <LiveClock />
          <span class="sub">{translate(state.language, 'logTakeoff')}</span>
        </button>
        <button class="btn-side" onClick={() => onTime('takeoff')}>
          {translate(state.language, 'set')}
          <br />
          {translate(state.language, 'time')}
        </button>
      </div>
    );
  }
  if (state.bottomMode === 'landing') {
    const flight = state.airborne.find((item) => item.id === state.landId);
    if (!flight) return null;
    const reg =
      flight.type === 'aerotow' && state.landSlot !== 'self'
        ? flight[state.landSlot!].plane.reg
        : flight.type === 'single'
          ? flight.plane.reg
          : '';
    return (
      <div class="landing-panel">
        <div class="land-ctx">
            <span>▼ {translate(state.language, 'landing')}</span>
          <strong>{reg}</strong>
          <span>{translate(state.language, 'takeoffShort')} {flight.toTime}</span>
        </div>
        <div class="action-row">
          <button class="btn-side" onClick={() => onCancelLanding()}>
            {translate(state.language, 'cancelAction')}
          </button>
          <button class="btn-log land" onClick={() => onLanding()}>
            <LiveClock />
            <span class="sub">{translate(state.language, 'logLanding')}</span>
          </button>
          <button class="btn-side" onClick={() => onTime('landing')}>
            {translate(state.language, 'set')}
            <br />
            {translate(state.language, 'time')}
          </button>
        </div>
      </div>
    );
  }
  if (state.bottomMode === 'recents') {
    return (
      <div class="recent-panel">
        <div class="bottom-lbl">
          <span>{translate(state.language, 'recentConfigs')}</span>
          <button class="bottom-lbl-r" onClick={() => onPatch({ bottomMode: 'idle' })}>
            {translate(state.language, 'back')}
          </button>
        </div>
        <div class="recents-list">
          {state.recentConfigs.map((config) => (
            <button class="recent-card" onClick={() => onRecent(config)} key={config.id}>
              <span class={`rc-mode-badge rc-${config.mode}`}>
                {config.mode.toUpperCase()}
              </span>
              {config.mode === 'aerotow' ? (
                <>
                  <span class="rc-row">
                    <b>{config.tow.plane.reg}</b> {config.tow.pilot}
                  </span>
                  <span class="rc-row">
                    <b>{config.glider.plane.reg}</b> {config.glider.pilots.join(' · ')}
                  </span>
                </>
              ) : (
                <span class="rc-row">
                  <b>{config.single.plane.reg}</b> {config.single.pilots.join(' · ')}
                </span>
              )}
            </button>
          ))}
          {!state.recentConfigs.length && (
            <div class="rc-empty">{translate(state.language, 'noRecent')}</div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div class="bottom-idle">
      <div class="idle-hint">{translate(state.language, 'tapSlot')}</div>
      <div class="idle-swipe-hint">
        {state.recentConfigs.length
          ? translate(state.language, 'swipeRecents')
          : translate(state.language, 'buildHistory')}
      </div>
      {state.recentConfigs.length > 0 && (
        <button class="hdr-btn recents-btn" onClick={() => onPatch({ bottomMode: 'recents' })}>
          {translate(state.language, 'recentConfigs')} →
        </button>
      )}
    </div>
  );
}

export function SelectionPanel({
  label,
  search,
  onSearch,
  language,
  children
}: {
  label: string;
  search: string;
  onSearch: (value: string) => void;
  language: 'en' | 'cs';
  empty: string;
  children: preact.ComponentChildren;
}) {
  return (
    <div class="selection-panel">
      <div class="bottom-lbl">{label}</div>
      <div class="selection-search">
        <input
          aria-label="Search"
          placeholder={translate(language, 'search')}
          value={search}
          onInput={(event) => onSearch(event.currentTarget.value)}
        />
      </div>
      {children}
    </div>
  );
}

export function LiveClock() {
  const [time, setTime] = useState(localTime());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(localTime()), 8000);
    return () => window.clearInterval(timer);
  }, []);
  return <span class="clk live-clock">{time}</span>;
}

export function filteredLog(state: AppState): LogEntry[] {
  let result = sortLog(state.log);
  if (state.logFilter) {
    const [field, value] = state.logFilter.split('::');
    result = result.filter((entry) =>
      field === 'reg' ? entry.reg === value : entry.pilots.includes(value || '')
    );
  }
  return result;
}
