import { useRef, useState } from 'preact/hooks';
import type { AppState, LogEntry, PushAnalysis } from '../types';
import type { KlubkoClient } from '../klubko';
import { filteredLog } from './flight';
import { sortLog } from '../domain';
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
      <button type="button" class={language === 'cs' ? 'active' : ''} aria-pressed={language === 'cs'} onClick={() => onChange('cs')}>
        CZ
      </button>
      <button type="button" class={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => onChange('en')}>
        EN
      </button>
    </div>
  );
}

function ReturnAirborneIcon() {
  return (
    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20V5m0 0-5 5m5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v11m0 0-4-4m4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h4M9.5 13h5M9.5 17h4" />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18H5.5a3.5 3.5 0 0 1-.4-7A6 6 0 0 1 16.7 9a4.5 4.5 0 0 1 1.8 8.6" />
      <path d="M12 20v-8m0 0-3 3m3-3 3 3" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V4h6v3m2 0-1 14H8L7 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function FlightConfirmationDetails({
  entry,
  language
}: {
  entry: LogEntry;
  language: 'en' | 'cs';
}) {
  return (
    <div class="flight-confirm-details">
      <div class="flight-confirm-aircraft">
        <strong>#{entry.num} · {entry.reg}</strong>
        <span>{entry.acType}</span>
      </div>
      <div class="flight-confirm-crew">{entry.pilots.join(', ') || '-'}</div>
      <div class="flight-confirm-times">
        <span>
          <small>{translate(language, 'takeoffShort')}</small>
          <strong>{entry.toTime || '-'}</strong>
        </span>
        <span class="landing-time">
          <small>{translate(language, 'landingShort')}</small>
          <strong>{entry.ldgTime || '-'}</strong>
        </span>
        <span>
          <small>{translate(language, 'dur')}</small>
          <strong>{entry.dur || '-'}</strong>
        </span>
      </div>
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
  onReopen,
  onExport,
  onPush
}: {
  state: AppState;
  onClose: () => void;
  onPatch: (patch: Partial<AppState>) => void;
  onEdit: (id: string, field: 'pilot0' | 'pilot1' | 'note') => void;
  onEditTime: (entry: LogEntry, field: 'toTime' | 'ldgTime') => void;
  onDelete: (entry: LogEntry, deletePartner?: boolean) => void;
  onReopen: (entry: LogEntry) => void;
  onExport: () => void;
  onPush: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [reopenMode, setReopenMode] = useState(false);
  const [reopenCandidate, setReopenCandidate] = useState<LogEntry | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<LogEntry | null>(null);
  const [deletePartner, setDeletePartner] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const logTouch = useRef<{ x: number; y: number } | null>(null);
  const entries = reopenMode ? sortLog(state.log) : filteredLog(state);
  const total = entries.reduce((sum, entry) => sum + timeToMinutes(entry.dur), 0);
  const filters = {
    regs: [...new Set(state.log.map((entry) => entry.reg))],
    pilots: [...new Set(state.log.flatMap((entry) => entry.pilots).filter(Boolean))]
  };
  const deletePartnerEntry = deleteCandidate?.pair
    ? state.log.find(
        (entry) => entry.pair === deleteCandidate.pair && entry.id !== deleteCandidate.id
      )
    : undefined;
  return (
    <div
      id="log-overlay"
      class={`open${editMode ? ' edit-active' : ''}${reopenMode ? ' reopen-picking' : ''}`}
    >
      <div class="log-hdr">
        <span class="log-hdr-title">{translate(state.language, 'log')}</span>
        {editMode ? (
          <button
            class={`log-hdr-btn reopen${reopenMode ? ' active' : ''}`}
            disabled={!entries.length}
            aria-pressed={reopenMode}
            onClick={() => {
              setReopenMode(!reopenMode);
              setReopenCandidate(null);
            }}
          >
            <ReturnAirborneIcon />
            {translate(state.language, 'returnAirborne')}
          </button>
        ) : (
          <div class="export-dropdown">
            <button class="log-hdr-btn export" onClick={() => setExportOpen(!exportOpen)}>
              <ExportIcon />
              {translate(state.language, 'export')} ▾
            </button>
            {exportOpen && (
              <button
                type="button"
                class="export-menu-backdrop"
                aria-label={translate(state.language, 'close')}
                onClick={() => setExportOpen(false)}
              />
            )}
            <div
              class={`export-menu export-actions-menu${exportOpen ? ' open' : ''}`}
              role="dialog"
              aria-modal={exportOpen}
              aria-label={translate(state.language, 'export')}
            >
              <button
                class="export-menu-action klubko-primary"
                onClick={() => {
                  setExportOpen(false);
                  onPush();
                }}
              >
                <span class="export-menu-icon cloud"><CloudUploadIcon /></span>
                <span class="export-menu-copy">
                  <strong>{translate(state.language, 'pushToKlubko')}</strong>
                  <small>{translate(state.language, 'pushKlubkoHint')}</small>
                </span>
              </button>
              <button
                class="export-menu-action"
                onClick={() => {
                  setExportOpen(false);
                  onExport();
                }}
              >
                <span class="export-menu-icon pdf"><PdfIcon /></span>
                <span class="export-menu-copy">
                  <strong>{translate(state.language, 'exportPdf')}</strong>
                  <small>{translate(state.language, 'exportPdfHint')}</small>
                </span>
              </button>
            </div>
          </div>
        )}
        <button class="log-hdr-btn" onClick={onClose}>
          {translate(state.language, 'close')}
        </button>
      </div>
      {!reopenMode && (
        <>
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
        </>
      )}
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
          else if (editMode) {
            setEditMode(false);
            setReopenMode(false);
            setReopenCandidate(null);
          }
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
              <tr
                class={`flight-row ${entry.num % 2 ? 'odd' : 'even'}${
                  reopenMode ? ' reopen-selectable' : ''
                }${reopenCandidate?.id === entry.id ? ' reopen-selected' : ''}${
                  deleteCandidate?.id === entry.id ? ' delete-selected' : ''
                }`}
                key={entry.id}
                onClick={() => reopenMode && setReopenCandidate(entry)}
              >
                <td class="mono flight-num">{entry.num}</td>
                <td>{entry.acType}</td>
                <td class="mono">{entry.reg}</td>
                <td class={`log-edit-td${editMode && !reopenMode ? '' : ' edit-locked'}`} aria-disabled={!editMode || reopenMode} onClick={() => editMode && !reopenMode && onEdit(entry.id, 'pilot0')}>
                  {entry.pilots[0] || '-'}
                </td>
                <td class={`log-edit-td${editMode && !reopenMode ? '' : ' edit-locked'}`} aria-disabled={!editMode || reopenMode} onClick={() => editMode && !reopenMode && onEdit(entry.id, 'pilot1')}>
                  {entry.pilots[1] || '+'}
                </td>
                <td class={`log-edit-td mono${editMode && !reopenMode ? '' : ' edit-locked'}`} aria-disabled={!editMode || reopenMode} onClick={() => editMode && !reopenMode && onEditTime(entry, 'toTime')}>
                  {state.utcMode ? localToUTC(entry.toTime) : entry.toTime}
                </td>
                <td class={`log-edit-td mono${editMode && !reopenMode ? '' : ' edit-locked'}`} aria-disabled={!editMode || reopenMode} onClick={() => editMode && !reopenMode && onEditTime(entry, 'ldgTime')}>
                  {entry.ldgTime
                    ? state.utcMode
                      ? localToUTC(entry.ldgTime)
                      : entry.ldgTime
                    : '-'}
                </td>
                <td class="mono">{entry.dur || '-'}</td>
                <td class={`note-td${editMode && !reopenMode ? '' : ' edit-locked'}`} aria-disabled={!editMode || reopenMode} onClick={() => editMode && !reopenMode && onEdit(entry.id, 'note')}>
                  {entry.note || '+'}
                </td>
                <td
                  class={`log-del-td${editMode && !reopenMode ? '' : ' edit-locked'}`}
                  aria-disabled={!editMode || reopenMode}
                  onClick={(event) => {
                    if (!editMode || reopenMode) return;
                    event.stopPropagation();
                    setDeletePartner(false);
                    setDeleteCandidate(entry);
                  }}
                >
                  <DeleteIcon />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <div class="log-empty">NO FLIGHTS LOGGED</div>}
        {entries.length > 0 && (
          <div class={`log-edit-hint${editMode ? ' active' : ''}`}>
            {editMode ? translate(state.language, 'editActive') : translate(state.language, 'swipeEdit')}
            <button class="log-edit-toggle" onClick={() => {
              setEditMode(!editMode);
              setReopenMode(false);
              setReopenCandidate(null);
            }}>
              {editMode ? translate(state.language, 'lock') : translate(state.language, 'edit')}
            </button>
          </div>
        )}
      </div>
      {reopenCandidate && (
        <div class="reopen-confirm-backdrop">
          <div
            class="reopen-confirm-box"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reopen-confirm-title"
          >
            <ReturnAirborneIcon />
            <div id="reopen-confirm-title" class="reopen-confirm-title">
              {translate(state.language, 'confirmReturnTitle')}
            </div>
            <FlightConfirmationDetails entry={reopenCandidate} language={state.language} />
            <p>{translate(state.language, 'confirmReturnBody')}</p>
            <div class="reopen-confirm-actions">
              <button class="reopen-confirm-cancel" onClick={() => setReopenCandidate(null)}>
                {translate(state.language, 'cancel')}
              </button>
              <button
                class="reopen-confirm-submit"
                onClick={() => {
                  const entry = reopenCandidate;
                  setReopenCandidate(null);
                  setReopenMode(false);
                  onReopen(entry);
                }}
              >
                <ReturnAirborneIcon />
                {translate(state.language, 'returnAirborne')}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteCandidate && (
        <div class="reopen-confirm-backdrop delete-confirm-backdrop">
          <div
            class="reopen-confirm-box delete-confirm-box"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <DeleteIcon />
            <div id="delete-confirm-title" class="reopen-confirm-title">
              {translate(state.language, 'deleteFlightTitle')}
            </div>
            <FlightConfirmationDetails entry={deleteCandidate} language={state.language} />
            <p>{translate(state.language, 'deleteFlightBody')}</p>
            {deletePartnerEntry && (
              <label class="delete-partner-choice">
                <input
                  type="checkbox"
                  checked={deletePartner}
                  onChange={(event) => setDeletePartner(event.currentTarget.checked)}
                />
                <span>
                  {translate(state.language, 'alsoDeletePartner')}
                  <strong>#{deletePartnerEntry.num} · {deletePartnerEntry.reg}</strong>
                </span>
              </label>
            )}
            <div class="reopen-confirm-actions">
              <button class="reopen-confirm-cancel" onClick={() => setDeleteCandidate(null)}>
                {translate(state.language, 'cancel')}
              </button>
              <button
                class="delete-confirm-submit"
                onClick={() => {
                  const entry = deleteCandidate;
                  setDeleteCandidate(null);
                  onDelete(entry, deletePartner);
                }}
              >
                <DeleteIcon />
                {translate(state.language, 'deleteFlight')}
              </button>
            </div>
          </div>
        </div>
      )}
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
          <button
            class="api-push-btn"
            disabled={busy || !analysis || analysis.errors.length > 0}
            onClick={onConfirm}
          >
            {busy ? 'PUSHING...' : total ? `PUSH ALL (${total})` : 'CONFIRM SYNCED'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnappliedLogDialog({
  language,
  date,
  flightCount,
  onLater,
  onExport,
  onPush
}: {
  language: 'en' | 'cs';
  date: string;
  flightCount: number;
  onLater: () => void;
  onExport: () => void;
  onPush: () => void;
}) {
  return (
    <div id="unapplied-log-modal">
      <div
        class="unapplied-log-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unapplied-log-title"
      >
        <div class="unapplied-log-mark" aria-hidden="true">!</div>
        <div id="unapplied-log-title" class="unapplied-log-title">
          {translate(language, 'unappliedLogTitle')}
        </div>
        <p>{translate(language, 'unappliedLogBody')}</p>
        <div class="unapplied-log-summary">
          <span>
            <small>{translate(language, 'unappliedLogDate')}</small>
            <strong>{date}</strong>
          </span>
          <span>
            <small>{translate(language, 'unappliedLogFlights')}</small>
            <strong>{flightCount}</strong>
          </span>
        </div>
        <div class="unapplied-log-actions">
          <button class="unapplied-later" onClick={onLater}>
            {translate(language, 'remindLater')}
          </button>
          <button class="unapplied-export" onClick={onExport}>
            <PdfIcon />
            {translate(language, 'exportPdf')}
          </button>
          <button class="unapplied-push" onClick={onPush}>
            <CloudUploadIcon />
            {translate(language, 'pushToKlubko')}
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
