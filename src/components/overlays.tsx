import { useState } from 'preact/hooks';
import type { AppState, LogEntry, PushAnalysis } from '../types';
import type { KlubkoClient } from '../klubko';
import { localToUTC, pad2, timeToMinutes } from '../time';
import { filteredLog } from './flight';

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
  const entries = filteredLog(state);
  const total = entries.reduce((sum, entry) => sum + timeToMinutes(entry.dur), 0);
  const filters = {
    regs: [...new Set(state.log.map((entry) => entry.reg))],
    pilots: [...new Set(state.log.flatMap((entry) => entry.pilots).filter(Boolean))]
  };
  return (
    <div id="log-overlay" class="open">
      <div class="log-hdr">
        <span class="log-hdr-title">FLIGHT LOG</span>
        <div class="export-dropdown">
          <button class="log-hdr-btn export" onClick={() => setExportOpen(!exportOpen)}>
            EXPORT ▾
          </button>
          <div class={`export-menu${exportOpen ? ' open' : ''}`}>
            <button onClick={onExport}>📄 EXPORT PDF</button>
            <button onClick={onPush}>☁ PUSH TO KLUBKO</button>
          </div>
        </div>
        <button class="log-hdr-btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
      <div class="log-filter-bar">
        <span class="filter-lbl">FILTER</span>
        <select
          class="filter-sel"
          value={state.logFilter}
          onChange={(event) => onPatch({ logFilter: event.currentTarget.value })}
        >
          <option value="">ALL FLIGHTS</option>
          <optgroup label="BY AIRCRAFT">
            {filters.regs.map((reg) => (
              <option value={`reg::${reg}`}>{reg}</option>
            ))}
          </optgroup>
          <optgroup label="BY PILOT">
            {filters.pilots.map((pilot) => (
              <option value={`pilot::${pilot}`}>{pilot}</option>
            ))}
          </optgroup>
        </select>
        <button class="filter-all" onClick={() => onPatch({ logFilter: '' })}>
          ALL
        </button>
        <button
          class={`filter-tz-btn${state.utcMode ? ' utc-on' : ''}`}
          onClick={() => onPatch({ utcMode: !state.utcMode })}
        >
          {state.utcMode ? 'UTC' : 'LOCAL'}
        </button>
      </div>
      <div class="log-stats">
        {entries.length} FLIGHTS | {new Set(entries.map((entry) => entry.num)).size} TAKEOFFS |
        TOTAL: {pad2(Math.floor(total / 60))}:{pad2(total % 60)}{' '}
        {state.utcMode ? '(UTC)' : '(LCL)'}
      </div>
      <div class="log-wrap">
        <table class="log-tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>AC TYPE</th>
              <th>REG</th>
              <th>PILOT 1</th>
              <th>PILOT 2</th>
              <th>T/O</th>
              <th>LDG</th>
              <th>DUR</th>
              <th>NOTE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td class="mono">{entry.num}</td>
                <td>{entry.acType}</td>
                <td class="mono">{entry.reg}</td>
                <td class="log-edit-td" onClick={() => onEdit(entry.id, 'pilot0')}>
                  {entry.pilots[0] || '-'}
                </td>
                <td class="log-edit-td" onClick={() => onEdit(entry.id, 'pilot1')}>
                  {entry.pilots[1] || '+'}
                </td>
                <td class="log-edit-td mono" onClick={() => onEditTime(entry, 'toTime')}>
                  {state.utcMode ? localToUTC(entry.toTime) : entry.toTime}
                </td>
                <td class="log-edit-td mono" onClick={() => onEditTime(entry, 'ldgTime')}>
                  {entry.ldgTime
                    ? state.utcMode
                      ? localToUTC(entry.ldgTime)
                      : entry.ldgTime
                    : '-'}
                </td>
                <td class="mono">{entry.dur || '-'}</td>
                <td class="note-td" onClick={() => onEdit(entry.id, 'note')}>
                  {entry.note || '+'}
                </td>
                <td class="log-del-td" onClick={() => onDelete(entry)}>
                  ✕
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <div class="log-empty">NO FLIGHTS LOGGED</div>}
      </div>
    </div>
  );
}

export function Settings({
  state,
  autoSync,
  client,
  onClose,
  onPatch,
  onAutoSync,
  onSync,
  onManager,
  onLogout,
  onClearLog
}: {
  state: AppState;
  autoSync: boolean;
  client: KlubkoClient;
  onClose: () => void;
  onPatch: (patch: Partial<AppState>) => void;
  onAutoSync: (value: boolean) => void;
  onSync: () => void;
  onManager: (kind: 'planes' | 'pilots') => void;
  onLogout: () => void;
  onClearLog: () => void;
}) {
  return (
    <div id="settings-overlay">
      <div class="settings-box">
        <div class="settings-hdr">
          <span class="settings-title">SETTINGS</span>
          <button class="settings-close" onClick={onClose}>
            DONE
          </button>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <div class="settings-sec-hdr">ACCOUNT</div>
            <div class="auth-status">LOGGED IN AS {client.getConfig().username}</div>
            <button class="settings-row-btn danger" onClick={onLogout}>
              LOG OUT
            </button>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">LANGUAGE</div>
            <select
              class="language-select"
              value={state.language}
              onChange={(event) =>
                onPatch({ language: event.currentTarget.value as 'en' | 'cs' })
              }
            >
              <option value="en">EN</option>
              <option value="cs">CZ</option>
            </select>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">SYNC</div>
            <label class="auth-chk-row">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(event) => onAutoSync(event.currentTarget.checked)}
              />
              <span>AUTO-SYNC ONLINE</span>
            </label>
            <button class="settings-row-btn" onClick={onSync}>
              SYNC PLANES & PILOTS NOW
            </button>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">PRESET MANAGEMENT</div>
            <div class="setup-hint">AIRCRAFT ADDED ({state.dayPlanes.length})</div>
            <PresetChips
              values={state.dayPlanes}
              onRemove={(reg) =>
                onPatch({ dayPlanes: state.dayPlanes.filter((item) => item !== reg) })
              }
            />
            <button class="settings-row-btn" onClick={() => onManager('planes')}>
              MANAGE PLANES
            </button>
            <div class="setup-hint">PILOTS ADDED ({state.dayPilots.length})</div>
            <PresetChips
              values={state.dayPilots}
              onRemove={(pilot) =>
                onPatch({ dayPilots: state.dayPilots.filter((item) => item !== pilot) })
              }
            />
            <button class="settings-row-btn" onClick={() => onManager('pilots')}>
              MANAGE PILOTS
            </button>
          </div>
          <div class="settings-section">
            <div class="settings-sec-hdr">OTHER</div>
            <button class="settings-row-btn danger-soft" onClick={onClearLog}>
              CLEAR FLIGHT LOG
            </button>
            <button
              class="settings-row-btn"
              onClick={() => onPatch({ theme: state.theme === 'dark' ? 'light' : 'dark' })}
            >
              {state.theme === 'dark' ? '☀ LIGHT MODE' : '☾ DARK MODE'}
            </button>
            <div class="setup-hint">Airfield: {state.airport} (non-editable)</div>
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
