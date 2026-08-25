import { useRef, useState } from 'preact/hooks';
import type { AppState, LogEntry, PushAnalysis } from '../types';
import type { KlubkoClient } from '../klubko';
import { filteredLog } from './flight';
import { translate } from '../i18n';
import { localToUTC, pad2, timeToMinutes, utcOffsetLabel } from '../time';

function LanguageSwitch({
  language,
  onChange
}: {
  language: 'en' | 'cs';
  onChange: (language: 'en' | 'cs') => void;
}) {
  return (
    <div class="language-switch" role="group" aria-label="Language">
      <button type="button" class={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => onChange('en')}>
        EN
      </button>
      <button type="button" class={language === 'cs' ? 'active' : ''} aria-pressed={language === 'cs'} onClick={() => onChange('cs')}>
        CZ
      </button>
    </div>
  );
}

export function LogOverlay({
  state,
  onClose,
  onPatch,
  onEdit,
  onEditTime,
  onDelete,
  onExport,
  onPush
}: {
  state: AppState;
  onClose: () => void;
  onPatch: (patch: Partial<AppState>) => void;
  onEdit: (id: string, field: 'pilot0' | 'pilot1' | 'note') => void;
  onEditTime: (entry: LogEntry, field: 'toTime' | 'ldgTime') => void;
  onDelete: (entry: LogEntry) => void;
  onExport: () => void;
  onPush: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const logTouch = useRef<{ x: number; y: number } | null>(null);
  const entries = filteredLog(state);
  const total = entries.reduce((sum, entry) => sum + timeToMinutes(entry.dur), 0);
  const filters = {
    regs: [...new Set(state.log.map((entry) => entry.reg))],
    pilots: [...new Set(state.log.flatMap((entry) => entry.pilots).filter(Boolean))]
  };
  return (
    <div id="log-overlay" class={`open${editMode ? ' edit-active' : ''}`}>
      <div class="log-hdr">
        <span class="log-hdr-title">{translate(state.language, 'log')}</span>
        <div class="export-dropdown">
          <button class="log-hdr-btn export" onClick={() => setExportOpen(!exportOpen)}>
            {translate(state.language, 'export')} ▾
          </button>
          <div class={`export-menu${exportOpen ? ' open' : ''}`}>
            <button onClick={onExport}>📄 EXPORT PDF</button>
            <button onClick={onPush}>☁ PUSH TO KLUBKO</button>
          </div>
        </div>
        <button class="log-hdr-btn" onClick={onClose}>
          {translate(state.language, 'close')}
        </button>
      </div>
      <div class="log-filter-bar">
        <span class="filter-lbl">{translate(state.language, 'filter')}</span>
        <select class="filter-sel" value={state.logFilter} onChange={(event) => onPatch({ logFilter: event.currentTarget.value })}>
          <option value="">{translate(state.language, 'filterAll')}</option>
          <optgroup label={translate(state.language, 'byAircraft')}>
            {filters.regs.map((reg) => (
              <option value={`reg::${reg}`}>{reg}</option>
            ))}
          </optgroup>
          <optgroup label={translate(state.language, 'byPilot')}>
            {filters.pilots.map((pilot) => (
              <option value={`pilot::${pilot}`}>{pilot}</option>
            ))}
          </optgroup>
        </select>
        <button class="filter-all" onClick={() => onPatch({ logFilter: '' })}>
          {translate(state.language, 'all')}
        </button>
        <button
          class={`filter-tz-btn${state.utcMode ? ' utc-on' : ''}`}
          onClick={() => onPatch({ utcMode: !state.utcMode })}
        >
          {state.utcMode ? 'UTC' : utcOffsetLabel()}
        </button>
      </div>
      <div class="log-stats">
        {entries.length} {translate(state.language, 'flightsHeader')} | {new Set(entries.map((entry) => entry.num)).size} {translate(state.language, 'takeoffs')} |
        TOTAL: {pad2(Math.floor(total / 60))}:{pad2(total % 60)}{' '}
        {state.utcMode ? '(UTC)' : `(${utcOffsetLabel()})`}
      </div>
      <div
        class={`log-wrap${editMode ? ' edit-mode' : ''}`}
        onTouchStart={(event) => {
          const point = event.touches[0];
          if (point) logTouch.current = { x: point.clientX, y: point.clientY };
        }}
        onTouchEnd={(event) => {
          const start = logTouch.current;
          const end = event.changedTouches[0];
          logTouch.current = null;
          if (!start || !end) return;
          const dx = end.clientX - start.x;
          const dy = end.clientY - start.y;
          if (Math.abs(dx) <= 52 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
          if (dx < 0) setEditMode(true);
          else if (editMode) setEditMode(false);
        }}
      >
        <table class="log-tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>{translate(state.language, 'acType')}</th>
              <th>{translate(state.language, 'reg')}</th>
              <th>{translate(state.language, 'pilot1')}</th>
              <th>{translate(state.language, 'pilot2')}</th>
              <th>{translate(state.language, 'takeoffShort')}</th>
              <th>{translate(state.language, 'landingShort')}</th>
              <th>{translate(state.language, 'dur')}</th>
              <th>NOTE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr class={`flight-row ${entry.num % 2 ? 'odd' : 'even'}`} key={entry.id}>
                <td class="mono flight-num">{entry.num}</td>
                <td>{entry.acType}</td>
                <td class="mono">{entry.reg}</td>
                <td class={`log-edit-td${editMode ? '' : ' edit-locked'}`} aria-disabled={!editMode} onClick={() => editMode && onEdit(entry.id, 'pilot0')}>
                  {entry.pilots[0] || '-'}
                </td>
                <td class={`log-edit-td${editMode ? '' : ' edit-locked'}`} aria-disabled={!editMode} onClick={() => editMode && onEdit(entry.id, 'pilot1')}>
                  {entry.pilots[1] || '+'}
                </td>
                <td class={`log-edit-td mono${editMode ? '' : ' edit-locked'}`} aria-disabled={!editMode} onClick={() => editMode && onEditTime(entry, 'toTime')}>
                  {state.utcMode ? localToUTC(entry.toTime) : entry.toTime}
                </td>
                <td class={`log-edit-td mono${editMode ? '' : ' edit-locked'}`} aria-disabled={!editMode} onClick={() => editMode && onEditTime(entry, 'ldgTime')}>
                  {entry.ldgTime
                    ? state.utcMode
                      ? localToUTC(entry.ldgTime)
                      : entry.ldgTime
                    : '-'}
                </td>
                <td class="mono">{entry.dur || '-'}</td>
                <td class={`note-td${editMode ? '' : ' edit-locked'}`} aria-disabled={!editMode} onClick={() => editMode && onEdit(entry.id, 'note')}>
                  {entry.note || '+'}
                </td>
                <td class={`log-del-td${editMode ? '' : ' edit-locked'}`} aria-disabled={!editMode} onClick={() => editMode && onDelete(entry)}>
                  ✕
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <div class="log-empty">NO FLIGHTS LOGGED</div>}
        {entries.length > 0 && (
          <div class={`log-edit-hint${editMode ? ' active' : ''}`}>
            {editMode ? translate(state.language, 'editActive') : translate(state.language, 'swipeEdit')}
            <button class="log-edit-toggle" onClick={() => setEditMode(!editMode)}>
              {editMode ? translate(state.language, 'lock') : translate(state.language, 'edit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Settings({
  state,
  client,
  onClose,
  onPatch,
  onSync,
  onManager,
  onLogout,
  onClearLog
}: {
  state: AppState;
  client: KlubkoClient;
  onClose: () => void;
  onPatch: (patch: Partial<AppState>) => void;
  onSync: () => void;
  onManager: (kind: 'planes' | 'pilots') => void;
  onLogout: () => void;
  onClearLog: () => void;
}) {
  return (
    <div id="settings-overlay">
      <div class="settings-box">
        <div class="settings-hdr">
          <span class="settings-title">{translate(state.language, 'settings')}</span>
          <button class="settings-close" onClick={onClose}>
            {translate(state.language, 'done')}
          </button>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <div class="settings-sec-hdr">{translate(state.language, 'account')}</div>
            <div class="account-row">
              <div class="auth-status">
                <img
                  class="account-logo"
                  src={`${import.meta.env.BASE_URL}icon_${
                    state.theme === 'dark' ? 'darkmode' : 'lightmode'
                  }.svg`}
                  alt=""
                />
                <span class="account-copy">
                  <span class="account-label">{translate(state.language, 'loggedInAs')}</span>
                  <strong class="account-username">{client.getConfig().username}</strong>
                </span>
              </div>
              <button class="settings-row-btn danger account-logout" onClick={onLogout}>
                {translate(state.language, 'logout')}
              </button>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">LANGUAGE</div>
            <div class="settings-language-control">
              <LanguageSwitch
              language={state.language}
              onChange={(language) => onPatch({ language })}
              />
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">{translate(state.language, 'sync')}</div>
            <button class="settings-row-btn" onClick={onSync}>
              {translate(state.language, 'syncNow')}
            </button>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">{translate(state.language, 'presetManagement')}</div>
            <button class="settings-row-btn" onClick={() => onManager('planes')}>
              <span class="settings-action-icon" aria-hidden="true">✈</span>
              {translate(state.language, 'managePlanes')}
            </button>
            <button class="settings-row-btn" onClick={() => onManager('pilots')}>
              <span class="settings-action-icon" aria-hidden="true">♙</span>
              {translate(state.language, 'managePilots')}
            </button>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">{translate(state.language, 'other')}</div>
            <button class="settings-row-btn danger-soft" onClick={onClearLog}>
              {translate(state.language, 'clearFlightLog')}
            </button>
            <button
              class="settings-row-btn"
              onClick={() => onPatch({ theme: state.theme === 'dark' ? 'light' : 'dark' })}
            >
              {state.theme === 'dark'
                ? `☀ ${translate(state.language, 'lightMode')}`
                : `☾ ${translate(state.language, 'darkMode')}`}
            </button>
            <div class="setup-hint">{translate(state.language, 'airfield')}: {state.airport} (non-editable)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PresetChips({
  values,
  onRemove
}: {
  values: string[];
  onRemove: (value: string) => void;
}) {
  return (
    <div class="preset-chips">
      {values.map((value) => (
        <span class="preset-chip" key={value}>
          {value}
          <button class="x" onClick={() => onRemove(value)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function PresetManager({
  kind,
  state,
  onPatch,
  onClose,
  notify
}: {
  kind: 'planes' | 'pilots';
  state: AppState;
  onPatch: (patch: Partial<AppState>) => void;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const values =
    kind === 'planes'
      ? state.planes.filter(
          (plane) =>
            !search ||
            plane.reg.toLowerCase().includes(search.toLowerCase()) ||
            plane.type.toLowerCase().includes(search.toLowerCase())
        )
      : state.pilots.filter(
          (pilot) => !search || pilot.toLowerCase().includes(search.toLowerCase())
        );
  const selected = kind === 'planes' ? state.dayPlanes : state.dayPilots;
  const allValues =
    kind === 'planes' ? state.planes.map((plane) => plane.reg) : state.pilots;
  return (
    <div class="mgr-modal">
      <div class="mgr-box">
        <div class="mgr-hdr">
          <span>{kind === 'planes' ? 'MANAGE PLANES' : 'MANAGE PILOTS'}</span>
          <button class="mgr-close" onClick={onClose}>
            DONE
          </button>
        </div>
        <div class="mgr-body">
          <input
            class="mgr-search"
            placeholder="Search..."
            value={search}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <div class="mgr-actions">
            <button
              onClick={() =>
                onPatch(kind === 'planes' ? { dayPlanes: allValues } : { dayPilots: allValues })
              }
            >
              ADD ALL
            </button>
            <button
              onClick={() =>
                onPatch(kind === 'planes' ? { dayPlanes: [] } : { dayPilots: [] })
              }
            >
              REMOVE ALL
            </button>
          </div>
          <div class="mgr-list">
            {values.map((value) => {
              const label = typeof value === 'string' ? value : value.reg;
              const active = selected.includes(label);
              return (
                <div class="mgr-item" key={label}>
                  <div>
                    <strong>{label}</strong>
                    {typeof value !== 'string' && (
                      <div class="meta">
                        {value.type} · {value.seats} seats · {value.takeoffTypes.join('')}
                      </div>
                    )}
                  </div>
                  <button
                    class={active ? 'mgr-remove-btn' : 'mgr-add-btn'}
                    onClick={() => {
                      const next = active
                        ? selected.filter((item) => item !== label)
                        : [...selected, label];
                      onPatch(kind === 'planes' ? { dayPlanes: next } : { dayPilots: next });
                      notify(`${active ? 'REMOVED' : 'ADDED'} ${label}`);
                    }}
                  >
                    {active ? 'REMOVE' : 'ADD'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PushDialog({
  analysis,
  busy,
  onClose,
  onConfirm
}: {
  analysis: PushAnalysis | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const total = (analysis?.toCreate.length || 0) + (analysis?.toUpdate.length || 0);
  return (
    <div id="api-push-modal">
      <div class="api-push-box">
        <div class="api-push-hdr">
          <span class="api-push-title">PUSH TO KLUBKO</span>
          <button class="api-push-close" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <div class="api-push-body">
          {busy && !analysis && <div class="api-push-summary">Fetching server flights...</div>}
          {analysis && (
            <>
              <div class="api-push-summary">
                <span>{analysis.toCreate.length} NEW</span> ·{' '}
                <span>{analysis.toUpdate.length} UPDATE</span> ·{' '}
                <span>{analysis.errors.length} ERROR</span>
              </div>
              {analysis.toUpdate.map((item) => (
                <PushFlight item={item} action="UPDATE" />
              ))}
              {analysis.toCreate.map((item) => (
                <PushFlight item={item} action="CREATE" />
              ))}
            </>
          )}
        </div>
        <div class="api-push-actions">
          <button class="api-push-btn cancel" onClick={onClose}>
            CANCEL
          </button>
          <button class="api-push-btn" disabled={busy || total === 0} onClick={onConfirm}>
            {busy ? 'PUSHING...' : `PUSH ALL (${total})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PushFlight({
  item,
  action
}: {
  item: PushAnalysis['toCreate'][number];
  action: 'CREATE' | 'UPDATE';
}) {
  return (
    <div class={`api-push-flight${action === 'UPDATE' ? ' hl' : ''}`}>
      <div class="api-push-flight-row">
        <span class="api-push-flight-label">REG:</span>
        <span class="api-push-flight-val">{item.api.sign}</span>
      </div>
      <div class="api-push-flight-row">
        <span class="api-push-flight-label">T/O:</span>
        <span class="api-push-flight-val">{item.api.takeoff}</span>
      </div>
      <div class="api-push-flight-row">
        <span class="api-push-flight-label">DUR:</span>
        <span class="api-push-flight-val">{item.api.duration}</span>
      </div>
      <div class="api-push-flight-row">
        <span class="api-push-flight-label">CREW:</span>
        <span class="api-push-flight-val">{item.api.crew.join(', ')}</span>
      </div>
      <div class="api-push-flight-row">
        <span class="api-push-flight-label">ACTION:</span>
        <span class="api-push-flight-val">{action}</span>
      </div>
    </div>
  );
}
