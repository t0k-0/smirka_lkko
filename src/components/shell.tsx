import { useState } from 'preact/hooks';
import type { AppState } from '../types';
import type { KlubkoClient } from '../klubko';
import type { SyncStatus } from '../sync';
import { translate } from '../i18n';
import { pad2 } from '../time';

interface TimeDialogState {
  title: string;
  value: string;
  confirm: (value: string) => void;
}

function PasswordEyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
      {visible && <path d="m4 4 16 16" />}
    </svg>
  );
}

interface Toast {
  id: number;
  message: string;
}

function LogbookIcon() {
  return (
    <svg class="logbook-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h12a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V4.5Z" />
      <path d="M8 4.5V20M11 9h5M11 13h5" />
    </svg>
  );
}

export function Login({
  state,
  client,
  onLanguage,
  onTheme,
  onSuccess
}: {
  state: AppState;
  client: KlubkoClient;
  onLanguage: (language: 'en' | 'cs') => void;
  onTheme: () => void;
  onSuccess: () => Promise<void>;
}) {
  const config = client.getConfig();
  const [username, setUsername] = useState(config.username);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [useTest, setUseTest] = useState(config.useTest);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setStatus('Fill in username and password');
      return;
    }
    setBusy(true);
    setStatus('Connecting...');
    try {
      client.setUseTest(useTest);
      await client.login(username.trim(), password);
      setStatus('LOGGED IN');
      await onSuccess();
    } catch (error) {
      setStatus(`LOGIN FAILED: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="login-overlay">
      <form class="login-box" onSubmit={submit}>
        <div class="login-hdr">
          <button
            type="button"
            class="theme-switch"
            onClick={onTheme}
            aria-label={state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {state.theme === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
          <select
            class="language-select"
            aria-label={translate(state.language, 'language')}
            value={state.language}
            onChange={(event) => onLanguage(event.currentTarget.value as 'en' | 'cs')}
          >
            <option value="cs">CZ</option>
            <option value="en">EN</option>
          </select>
        </div>
        <div class="login-body">
          <div class="login-logo-wrap">
            <div class="login-logo">
              <img
                src={`${import.meta.env.BASE_URL}icon_${
                  state.theme === 'dark' ? 'darkmode' : 'lightmode'
                }.svg`}
                alt="Šmírka logo"
                class="login-logo-img"
              />
            </div>
          </div>
          <div class="login-mode">
            <span class="login-field-hint">{translate(state.language, 'mode')}</span>
            <div class="form-seg">
              <button
                type="button"
                class={`seg prod${!useTest ? ' on' : ''}`}
                onClick={() => setUseTest(false)}
              >
                {translate(state.language, 'production')}
              </button>
              <button
                type="button"
                class={`seg test${useTest ? ' on' : ''}`}
                onClick={() => setUseTest(true)}
              >
                {translate(state.language, 'test')}
              </button>
            </div>
          </div>
          <div class="login-fields">
            <input
              class="form-in"
              value={username}
              onInput={(event) => setUsername(event.currentTarget.value)}
              aria-label={translate(state.language, 'user')}
              placeholder={translate(state.language, 'user')}
              autoComplete="username"
            />
            <div class="password-field">
              <input
                class="form-in"
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onInput={(event) => setPassword(event.currentTarget.value)}
                aria-label={translate(state.language, 'pass')}
                placeholder={translate(state.language, 'pass')}
                autoComplete="current-password"
              />
              <button
                type="button"
                class="password-eye"
                aria-label={translate(
                  state.language,
                  passwordVisible ? 'hidePassword' : 'showPassword'
                )}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                <PasswordEyeIcon visible={passwordVisible} />
              </button>
            </div>
          </div>
          <div class="login-status">{status}</div>
          <button class="login-btn" disabled={busy}>
            {busy
              ? translate(state.language, 'loggingIn')
              : translate(state.language, 'login')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Header({
  state,
  syncStatus: _syncStatus,
  online,
  onLog,
  onSettings
}: {
  state: AppState;
  syncStatus: SyncStatus;
  online: boolean;
  onLog: () => void;
  onSettings: () => void;
}) {
  const now = new Date();
  return (
    <div id="hdr">
      <button class="log-pull" onClick={onLog}>
        <LogbookIcon />
        <span class="log-label">LOG</span>
        <span class="log-arr">▼</span>
      </button>
      <span class="date-str">
        {translate(state.language, 'date')}: {pad2(now.getDate())} {pad2(now.getMonth() + 1)} {now.getFullYear()}
      </span>
      <div class="hdr-btns">
        <span
          id="sync-indicator"
          title={online ? 'CONNECTED' : 'OFFLINE'}
          aria-label={online ? 'Connected' : 'Offline'}
        >
          <span class="sync-status-symbol" aria-hidden="true">{online ? '↕' : '×'}</span>
        </span>
        <span
          id="local-save-indicator"
          class="status-icon saved"
          title={state.language === 'cs' ? 'ZÁZNAM ULOŽEN LOKÁLNĚ' : 'LOG SAVED LOCALLY'}
          aria-label={state.language === 'cs' ? 'Záznam uložen lokálně' : 'Log saved locally'}
        ></span>
        <button class="hdr-btn" onClick={onSettings}>
          <span class="hdr-btn-icon" aria-hidden="true">⚙</span>
          <span class="hdr-btn-label">SETTINGS</span>
        </button>
      </div>
    </div>
  );
}


export function TimeDialog({
  dialog,
  onClose
}: {
  dialog: TimeDialogState;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.value);
  return (
    <div id="time-modal" class="open">
      <form
        class="tmodal-box"
        onSubmit={(event) => {
          event.preventDefault();
          if (!value) return;
          dialog.confirm(value);
          onClose();
        }}
      >
        <div class="tmodal-title">{dialog.title}</div>
        <input
          type="time"
          class="tmodal-in"
          value={value}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
        <div class="tmodal-btns">
          <button type="button" class="tmodal-cancel" onClick={onClose}>
            CANCEL
          </button>
          <button class="tmodal-ok">OK</button>
        </div>
      </form>
    </div>
  );
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div id="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div class="toast" key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
