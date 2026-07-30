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

interface Toast {
  id: number;
  message: string;
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
  const [proxy, setProxy] = useState(config.proxyUrl);
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
      client.setProxy(proxy);
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
          <span class="login-title">ŠMÍRKA MOBILE</span>
          <select
            class="language-select"
            aria-label={translate(state.language, 'language')}
            value={state.language}
            onChange={(event) => onLanguage(event.currentTarget.value as 'en' | 'cs')}
          >
            <option value="en">EN</option>
            <option value="cs">CZ</option>
          </select>
        </div>
        <div class="login-body">
          <div class="login-logo-wrap">
            <button type="button" class="login-logo" onClick={onTheme} title="Toggle theme">
              <img
                src={`${import.meta.env.BASE_URL}icon_${
                  state.theme === 'dark' ? 'darkmode' : 'lightmode'
                }.svg`}
                alt="Šmírka logo"
                class="login-logo-img"
              />
            </button>
          </div>
          <div class="login-section">
            <div class="login-sec-hdr">{translate(state.language, 'connection')}</div>
            <div class="form-row">
              <span class="form-lbl">{translate(state.language, 'mode')}</span>
              <div class="form-seg">
                <button
                  type="button"
                  class={`seg${!useTest ? ' on' : ''}`}
                  onClick={() => setUseTest(false)}
                >
                  {translate(state.language, 'production')}
                </button>
                <button
                  type="button"
                  class={`seg${useTest ? ' on' : ''}`}
                  onClick={() => setUseTest(true)}
                >
                  {translate(state.language, 'test')}
                </button>
              </div>
            </div>
            <label class="form-row">
              <span class="form-lbl">{translate(state.language, 'proxy')}</span>
              <input
                class="form-in"
                value={proxy}
                onInput={(event) => setProxy(event.currentTarget.value)}
                autoCapitalize="none"
                spellcheck={false}
              />
            </label>
          </div>
          <div class="login-section">
            <div class="login-sec-hdr">{translate(state.language, 'credentials')}</div>
            <label class="form-row">
              <span class="form-lbl">{translate(state.language, 'user')}</span>
              <input
                class="form-in"
                value={username}
                onInput={(event) => setUsername(event.currentTarget.value)}
                autoComplete="username"
              />
            </label>
            <label class="form-row">
              <span class="form-lbl">{translate(state.language, 'pass')}</span>
              <input
                class="form-in"
                type="password"
                value={password}
                onInput={(event) => setPassword(event.currentTarget.value)}
                autoComplete="current-password"
              />
            </label>
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
  syncStatus,
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
        <span class="log-label">LOG</span>
        <span class="log-arr">▼</span>
      </button>
      <span class="date-str">
        Date: {pad2(now.getDate())} {pad2(now.getMonth() + 1)} {now.getFullYear()}
      </span>
      <div class="hdr-btns">
        {(syncStatus.queueLength > 0 || syncStatus.syncing) && (
          <span id="sync-badge">
            {syncStatus.syncing ? 'SYNC...' : `${syncStatus.queueLength} PENDING`}
          </span>
        )}
        <span id="sync-indicator" title={online ? 'CONNECTED' : 'OFFLINE'}>
          <span class="status-icon">{online ? '●' : '○'}</span>
        </span>
        <span
          id="local-save-indicator"
          class="status-icon saved"
          title={state.language === 'cs' ? 'ZÁZNAM ULOŽEN LOKÁLNĚ' : 'LOG SAVED LOCALLY'}
        >
          💾
        </span>
        <button class="hdr-btn" onClick={onSettings}>
          ⚙ SETTINGS
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
