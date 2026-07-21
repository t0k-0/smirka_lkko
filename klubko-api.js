/**
 * Klubko REST API Client
 * Handles authentication (session), flight CRUD, and offline sync queue
 * 
 * CORS Note: The API at klubko.aeroklub-kolin.cz requires a proxy for cross-origin requests.
 * Configure proxyUrl in auth overlay or use same-origin deployment.
 */
const KlubkoAPI = (() => {
  const BASE_URL = 'https://klubko.aeroklub-kolin.cz/rest-api/';

  let config = {
    baseUrl: BASE_URL,
    proxyUrl: 'https://klubko-proxy.onrender.com/',
    useTest: false,
    authMode: 'password',
    username: '',
    password: '',
    timezone: 'Europe/Prague',
  };

  let syncQueue = [];
  let isSyncing = false;
  let syncCallbacks = [];
  let heartbeatInterval = null;
  let authenticated = false; // tracked explicitly - session cookies are HttpOnly and invisible to document.cookie
  let authCallbacks = [];

  function setAuthenticated(value) {
    if (authenticated === value) return;
    authenticated = value;
    authCallbacks.forEach(cb => { try { cb(value); } catch (e) {} });
  }

  function onAuthChange(cb) {
    authCallbacks.push(cb);
    return () => { authCallbacks = authCallbacks.filter(c => c !== cb); };
  }

  /* ============ UTILS ============ */
  const p2 = n => String(n).padStart(2, '0');
  const nowISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  };
  const nowTime = () => {
    const d = new Date();
    return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  const durToMins = (hhmm) => {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const minsToHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${p2(h)}:${p2(m)}`;
  };

  function ep(endpoint) {
    if (!endpoint) return '';
    // Login and logout do not have test variants
    const noTestPrefix = ['login/', 'logout/'];
    if (noTestPrefix.includes(endpoint)) return endpoint;

    // When running in test mode, only a limited set of endpoints use the
    // `test-` prefix. This prevents accidentally calling test variants for
    // endpoints that don't support it. Allowed test endpoints (match by
    // prefix to tolerate query params) are:
    //   edit-flights/, tasks/, flight-dates/, get-flight/, get-flights-of-day/
    if (config.useTest) {
      const testAllowed = ['edit-flights/', 'tasks/', 'flight-dates/', 'get-flight/', 'get-flights-of-day/'];
      for (const a of testAllowed) {
        if (endpoint.startsWith(a)) return 'test-' + endpoint;
      }
    }
    return endpoint;
  }

  function buildUrl(endpoint) {
    if (config.proxyUrl) {
      const path = endpoint ? `rest-api/${ep(endpoint)}` : 'rest-api/';
      return `${config.proxyUrl}${path}`;
    }
    return config.baseUrl + ep(endpoint);  // baseUrl already has /rest-api/
  }

  /* ============ SNAP CALCULATION (MD5) ============ */
  async function computeSnap(flight) {
    const crewStr = flight.crew ? `[${flight.crew.join(', ')}]` : '[]';
    const task = flight.task || '';
    const note = flight.note || '';
    let payStr = '';
    if (flight.pay && Object.keys(flight.pay).length) {
      const entries = Object.entries(flight.pay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, val]) => `${name}: ${val}`)
        .join(', ');
      payStr = ` [${entries}]`;
    }
    const text = `${flight.date}T${flight.takeoff} ${flight.duration} ${flight.starts}${flight.powered} ${flight.sign} ${crewStr} "${task}" "${note}"${payStr}`;
    if (typeof window.md5 === 'function') return window.md5(text);
    throw new Error('MD5 support is unavailable; reload the app while online to load the checksum library.');
  }

  /* ============ HTTP HELPER ============ */
  async function request(endpoint, options = {}) {
    const url = buildUrl(endpoint);
    const isFormData = options.body instanceof FormData;
    const headers = { 'Accept': 'application/json' };
    if (!isFormData) headers['Content-Type'] = 'application/json; charset=utf-8';

    const fetchOptions = {
      method: options.method || 'GET',
      headers,
      credentials: 'include',
      ...options,
    };
    if (options.body && !isFormData && typeof options.body === 'object') {
      fetchOptions.body = JSON.stringify(options.body);
    } else if (isFormData) {
      fetchOptions.body = options.body;
    }

    try {
      console.log('[KlubkoAPI]', fetchOptions.method, url);
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch(url, fetchOptions);
          break;
        } catch (fetchErr) {
          if (attempt === 1) throw fetchErr;
          await new Promise(resolve => setTimeout(resolve, 700));
        }
      }
      const text = await response.text();
      console.log('[KlubkoAPI] Response:', response.status, text.substring(0, 300));
      let data;
      try { data = JSON.parse(text); }
      catch { data = { status: 'ERROR', message: 'Invalid JSON response', raw: text }; }

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.message || text}`);
      return data;
    } catch (err) {
      console.error('[KlubkoAPI] Request failed:', err);
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('NETWORK_ERROR: Cannot reach API. Check CORS/proxy.');
      }
      throw err;
    }
  }

  /* ============ AUTHENTICATION ============ */
  async function login(username, password) {
    config.username = username;
    config.password = password;
    config.authMode = 'password';

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    // Login is always /login/ (no test variant)
    const loginUrl = config.proxyUrl
      ? `${config.proxyUrl}rest-api/login/`
      : `${config.baseUrl}login/`;

    console.log('[KlubkoAPI] Login POST to:', loginUrl);

    const response = await fetch(loginUrl, {
      method: 'POST',
      body: formData,
      credentials: config.proxyUrl ? 'include' : 'include',
    });

    console.log('[KlubkoAPI] Login response status:', response.status);

    const text = await response.text();
    console.log('[KlubkoAPI] Login response text:', text);

    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      console.error('[KlubkoAPI] JSON parse failed:', e);
      throw new Error('Invalid JSON response');
    }

    if (data.status !== 'OK') throw new Error(data.message || 'Login failed');

    await verifySession(); // sets authenticated=true internally on success
    saveConfig();
    startHeartbeat();
    return data;
  }

  async function loginWithCert(certArrayBuffer, keyArrayBuffer, passphrase = '') {
    config.authMode = 'cert';
    throw new Error('SSL Certificate auth requires native wrapper (Capacitor/Tauri/Electron). Use password auth for PWA.');
  }

  async function verifySession() {
    console.log('[KlubkoAPI] verifySession starting');
    try {
      const data = await request('', { method: 'GET' });
      console.log('[KlubkoAPI] verifySession result:', data);
      if (data && data.status === 'OK') {
        config.timezone = data.timezone_name || 'Europe/Prague';
        setAuthenticated(true);
        return data;
      }

      const fallbackData = await request('login/', { method: 'GET' });
      console.log('[KlubkoAPI] verifySession fallback result:', fallbackData);
      if (fallbackData && fallbackData.status === 'OK') {
        config.timezone = fallbackData.timezone_name || 'Europe/Prague';
        setAuthenticated(true);
        return fallbackData;
      }

      setAuthenticated(false);
      throw new Error('Session verification failed: ' + (data?.message || fallbackData?.message || 'Unknown error'));
    } catch (err) {
      setAuthenticated(false);
      throw err;
    }
  }

  async function logout() {
    config.username = '';
    config.password = '';
    stopHeartbeat();
    setAuthenticated(false);
    saveConfig();
  }

  // NOTE: we deliberately do NOT inspect document.cookie here. The Klubko
  // session cookie is HttpOnly (invisible to JS by design, and rightly so -
  // that's what keeps it safe from XSS). isAuthenticated() instead reflects
  // the last known result of an actual API call (login/verifySession), which
  // is the only reliable signal available to client-side JS.
  function isAuthenticated() {
    return authenticated;
  }

  /* ============ HEARTBEAT (session maintenance) ============ */
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(async () => {
      if (!isAuthenticated()) { stopHeartbeat(); return; }
      try {
        await verifySession();
        console.log('[KlubkoAPI] Heartbeat OK');
      } catch (e) {
        console.warn('[KlubkoAPI] Heartbeat failed - session likely expired:', e.message);
        stopHeartbeat();
      }
    }, 5 * 60 * 1000); // every 5 minutes
  }

  function stopHeartbeat() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  }

  /* ============ CONFIG PERSISTENCE ============ */
  function saveConfig() {
    try {
      const toSave = {
        baseUrl: config.baseUrl,
        proxyUrl: config.proxyUrl,
        useTest: config.useTest,
        authMode: config.authMode,
        username: config.username,
        timezone: config.timezone,
      };
      localStorage.setItem('klubko-config', JSON.stringify(toSave));
    } catch (e) {}
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem('klubko-config');
      if (raw) config = { ...config, ...JSON.parse(raw) };
      if (!config.proxyUrl) config.proxyUrl = 'https://klubko-proxy.onrender.com/';
    } catch (e) {}
  }

  function setUseTest(useTest) {
    config.useTest = useTest;
    saveConfig();
  }

  function setProxy(proxyUrl) {
    config.proxyUrl = proxyUrl.endsWith('/') ? proxyUrl : proxyUrl + '/';
    saveConfig();
  }

  function getConfig() {
    return { ...config };
  }

  /* ============ REFERENCE DATA ============ */
  async function getAirplanes() {
    const data = await request('airplanes/');
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function getAirplaneSeats() {
    const data = await request('airplane-type-seats/');
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function getAirplaneTakeoffTypes(dateFrom, dateTo) {
    let endpoint = 'airplane-takeoff-types/';
    const params = [];
    if (dateFrom) params.push(`date_from=${dateFrom}`);
    if (dateTo) params.push(`date_to=${dateTo}`);
    if (params.length) endpoint += '?' + params.join('&');
    const data = await request(endpoint);
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function getPersons() {
    const data = await request('persons/');
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function getTasks() {
    const data = await request('tasks/');
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function addPerson(firstName, lastName) {
    const data = await request('add-person/', { method: 'POST', body: { first_name: firstName, last_name: lastName } });
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function addAirplane(type, signature) {
    const data = await request('add-airplane-sign/', { method: 'POST', body: { airplane_type: type, signature } });
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  /* ============ FLIGHT OPERATIONS ============ */
  async function getFlightDates() {
    const data = await request('flight-dates/');
    if (data.status !== 'OK') throw new Error(data.message);
    return data.data;
  }

  async function getFlightsOfDay(date) {
    const data = await request(`get-flights-of-day/?date=${date}`);
    if (data.status !== 'OK') throw new Error(data.message);
    return Array.isArray(data.flights) ? data.flights : [];
  }

  async function getFlightById(flightId) {
    const data = await request(`get-flight/?flight_id=${flightId}`);
    if (data.status !== 'OK') throw new Error(data.message);
    return data.flight;
  }

  async function editFlights(flights) {
    const data = await request('edit-flights/', { method: 'POST', body: flights });
    if (data.status === 'ERROR') throw new Error(data.message);
    return data;
  }

  /* ============ DATA MAPPING (Local <-> API) ============ */
  function mapPowered(mode) {
    if (mode === 'tow') return 'A';
    if (mode === 'motorized') return 'M';
    return 'W';
  }

  function localToApiFlight(localFlight) {
    // Completed entries in the app log are flat records, unlike composer records.
    if (localFlight.reg && !localFlight.plane && !localFlight.tow && !localFlight.glider) {
      const flatFlight = {
        date: localFlight.date || nowISO(),
        takeoff: localFlight.toTime || localFlight.takeoff || nowTime(),
        duration: durToMins(localFlight.dur || localFlight.duration || '0:00'),
        sign: localFlight.reg,
        crew: (localFlight.pilots || []).filter(Boolean),
        starts: localFlight.starts || 1,
        powered: mapPowered(localFlight.fn),
        task: localFlight.task || '',
        note: localFlight.note || '',
      };
      if (localFlight.flight_id) flatFlight.flight_id = localFlight.flight_id;
      if (localFlight.snap) flatFlight.snap = localFlight.snap;
      if (localFlight.pay) flatFlight.pay = localFlight.pay;
      return [flatFlight];
    }
    const isAerotow = localFlight.type === 'aerotow';
    const flights = [];
    const date = localFlight.date || nowISO();
    const takeoff = localFlight.takeoff || localFlight.toTime || nowTime();

    if (isAerotow) {
      const tow = localFlight.tow;
      const towDuration = tow.ldgTime ? durToMins(tow.dur) : durToMins(tow.duration || tow.airTime || '0:00');
      const towFlight = { date, takeoff, duration: towDuration, sign: tow.plane.reg, crew: tow.pilot ? [tow.pilot] : [], starts: tow.starts || 1, powered: 'A', task: localFlight.task || '', note: localFlight.note || '' };
      if (localFlight.pay) towFlight.pay = localFlight.pay;
      if (tow.flight_id) towFlight.flight_id = tow.flight_id;
      if (tow.snap) towFlight.snap = tow.snap;
      flights.push(towFlight);

      const glider = localFlight.glider;
      const gliderDuration = glider.ldgTime ? durToMins(glider.dur) : durToMins(glider.duration || glider.airTime || '0:00');
      const gliderFlight = { date, takeoff, duration: gliderDuration, sign: glider.plane.reg, crew: glider.pilots.filter(Boolean), starts: glider.starts || 1, powered: 'A', task: localFlight.task || '', note: localFlight.note || '' };
      if (localFlight.pay) gliderFlight.pay = localFlight.pay;
      if (glider.flight_id) gliderFlight.flight_id = glider.flight_id;
      if (glider.snap) gliderFlight.snap = glider.snap;
      flights.push(gliderFlight);
    } else {
      const duration = localFlight.ldgTime ? durToMins(localFlight.dur) : durToMins(localFlight.duration || localFlight.airTime || '0:00');
      const flight = { date, takeoff, duration, sign: localFlight.plane.reg, crew: localFlight.pilots.filter(Boolean), starts: localFlight.starts || 1, powered: mapPowered(localFlight.fn || localFlight.mode), task: localFlight.task || '', note: localFlight.note || '' };
      if (localFlight.pay) flight.pay = localFlight.pay;
      if (localFlight.flight_id) flight.flight_id = localFlight.flight_id;
      if (localFlight.snap) flight.snap = localFlight.snap;
      flights.push(flight);
    }
    return flights;
  }

  function apiToLocalFlight(apiFlight) {
    return {
      flight_id: apiFlight.flight_id,
      snap: apiFlight.snap,
      date: apiFlight.date,
      takeoff: apiFlight.takeoff,
      duration: minsToHHMM(apiFlight.duration),
      ldgTime: apiFlight.landing || null,
      sign: apiFlight.sign,
      plane: { reg: apiFlight.sign },
      pilots: apiFlight.crew || [],
      starts: apiFlight.starts,
      powered: apiFlight.powered,
      task: apiFlight.task,
      note: apiFlight.note,
      pay: apiFlight.pay,
    };
  }

  /* ============ SYNC ENGINE ============ */
  const SYNC_QUEUE_KEY = 'klubko-sync-queue';

  function loadSyncQueue() {
    try { const raw = localStorage.getItem(SYNC_QUEUE_KEY); if (raw) syncQueue = JSON.parse(raw); } catch (e) { syncQueue = []; }
  }

  function saveSyncQueue() {
    try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(syncQueue)); } catch (e) {}
  }

  function queueOperation(op) {
    syncQueue.push({ ...op, timestamp: Date.now(), retries: 0 });
    saveSyncQueue();
    notifySyncChange();
  }

  function notifySyncChange() {
    syncCallbacks.forEach(cb => cb(syncQueue.length, isSyncing));
  }

  function onSyncChange(cb) {
    syncCallbacks.push(cb);
    return () => { syncCallbacks = syncCallbacks.filter(c => c !== cb); };
  }

  function getSyncStatus() {
    return { queueLength: syncQueue.length, isSyncing, isAuthenticated: isAuthenticated() };
  }

  async function processSyncQueue() {
    if (isSyncing || syncQueue.length === 0 || !isAuthenticated()) return;
    isSyncing = true;
    notifySyncChange();

    const queue = [...syncQueue];
    syncQueue = [];
    saveSyncQueue();

    for (const op of queue) {
      try {
        if (op.type === 'create' || op.type === 'update') {
          const apiFlights = localToApiFlight(op.flight);
          for (const f of apiFlights) {
            if (op.type === 'update' && f.flight_id) {
              if (!f.snap) f.snap = await computeSnap(f);
            } else if (op.type === 'create') {
              f.snap = await computeSnap(f);
            }
          }
          await editFlights(apiFlights);
        } else if (op.type === 'delete') {
          await editFlights([{ flight_id: op.flightId, snap: op.snap, delete: 'y' }]);
        }
      } catch (err) {
        op.retries = (op.retries || 0) + 1;
        if (op.retries < 5) syncQueue.unshift(op);
        else console.error('Sync failed permanently:', err, op);
      }
    }

    saveSyncQueue();
    isSyncing = false;
    notifySyncChange();
  }

  async function syncFlightCreate(localFlight) {
    if (!isAuthenticated()) { queueOperation({ type: 'create', flight: localFlight }); return; }
    try {
      const apiFlights = localToApiFlight(localFlight);
      for (const f of apiFlights) f.snap = await computeSnap(f);
      await editFlights(apiFlights);
    } catch (err) {
      console.warn('Sync create failed, queued:', err);
      queueOperation({ type: 'create', flight: localFlight });
    }
  }

  async function syncFlightUpdate(localFlight) {
    if (!isAuthenticated()) { queueOperation({ type: 'update', flight: localFlight }); return; }
    try {
      const apiFlights = localToApiFlight(localFlight);
      for (const f of apiFlights) if (!f.snap) f.snap = await computeSnap(f);
      await editFlights(apiFlights);
    } catch (err) {
      console.warn('Sync update failed, queued:', err);
      queueOperation({ type: 'update', flight: localFlight });
    }
  }

  async function syncFlightDelete(flightId, snap) {
    if (!isAuthenticated()) { queueOperation({ type: 'delete', flightId, snap }); return; }
    try { await editFlights([{ flight_id: flightId, snap, delete: 'y' }]); }
    catch (err) { console.warn('Sync delete failed, queued:', err); queueOperation({ type: 'delete', flightId, snap }); }
  }

  async function syncAllPending() { await processSyncQueue(); }

  /* ============ API PUSH WITH OVERLAP DETECTION ============ */
  async function pushDayLog(localFlights, onProgress) {
    if (!isAuthenticated()) throw new Error('Not authenticated');

    const today = nowISO();
    onProgress?.('Fetching server flights...');

    // 1. Get all flights for today from server
    const serverFlights = await getFlightsOfDay(today);
    console.log('[KlubkoAPI] Server flights for today:', serverFlights.length);

    // 2. Group local flights by aircraft
    const localByReg = {};
    for (const lf of localFlights) {
      const apiFlights = localToApiFlight(lf);
      for (const af of apiFlights) {
        if (!localByReg[af.sign]) localByReg[af.sign] = [];
        localByReg[af.sign].push({ local: lf, api: af });
      }
    }

    // 3. For each local flight, find overlap with server flights of same aircraft
    const toCreate = [];
    const toUpdate = [];
    let processed = 0;
    const total = Object.values(localByReg).flat().length;

    for (const [reg, flights] of Object.entries(localByReg)) {
      const serverSameReg = serverFlights.filter(sf => sf.sign === reg);

      for (const { local, api } of flights) {
        processed++;
        onProgress?.(`Checking ${reg} (${processed}/${total})...`);

        // Find overlapping server flight (same aircraft, time overlap)
        let match = null;
        for (const sf of serverSameReg) {
          const sTakeoff = sf.takeoff;
          const sLanding = sTakeoff + Math.max(0, Number(sf.duration) || 0);
          const lTakeoff = api.takeoff;
          const lLanding = lTakeoff + Math.max(0, Number(api.duration) || 0);

          // Check time overlap: max(start1, start2) < min(end1, end2)
          const overlapStart = Math.max(timeToMins(sTakeoff), timeToMins(lTakeoff));
          const overlapEnd = Math.min(timeToMins(sLanding), timeToMins(lLanding));
          if (overlapStart < overlapEnd) {
            match = sf;
            break;
          }
        }

        if (match) {
          // Update the existing tracker record while preserving its timing.
          const update = {
            flight_id: match.flight_id,
            date: match.date || api.date,
            takeoff: match.takeoff,
            duration: Number(match.duration) || api.duration,
            sign: match.sign,
            crew: api.crew,
            starts: Number(match.starts) || api.starts || 1,
            powered: match.powered || api.powered,
            task: match.task || '',
            note: match.note || '',
          };
          if (api.pay) update.pay = api.pay;
          update.snap = await computeSnap(update);
          toUpdate.push(update);
        } else {
          // No overlap - create new
          api.snap = await computeSnap(api);
          toCreate.push(api);
        }
      }
    }

    // 4. Execute creates and updates
    const results = { created: [], updated: [], errors: [] };

if (toCreate.length) {
      onProgress?.(`Creating ${toCreate.length} new flights...`);
      try {
        const res = await editFlights(toCreate);
        if (res.flights) {
          for (const r of res.flights) {
            if (r.status === 'OK') results.created.push(r);
            else results.errors.push({ flight: r, error: r.message });
          }
        }
      } catch (e) {
        results.errors.push({ flights: toCreate, error: e.message });
      }
    }

    if (toUpdate.length) {
      onProgress?.(`Updating ${toUpdate.length} existing flights...`);
      try {
        const res = await editFlights(toUpdate);
        if (res.flights) {
          for (const r of res.flights) {
            if (r.status === 'OK') results.updated.push(r);
            else results.errors.push({ flight: r, error: r.message });
          }
        }
      } catch (e) {
        results.errors.push({ flights: toUpdate, error: e.message });
      }
    }

    onProgress?.(`Done: ${results.created.length} created, ${results.updated.length} updated, ${results.errors.length} errors`);
    return results;
  }

  function timeToMins(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  /* ============ INIT ============ */
  loadConfig();
  loadSyncQueue();

  return {
    login,
    loginWithCert,
    logout,
    verifySession,
    isAuthenticated,
    onAuthChange,
    getConfig,
    setUseTest,
    setProxy,
    getAirplanes,
    getAirplaneSeats,
    getAirplaneTakeoffTypes,
    getPersons,
    getTasks,
    addPerson,
    addAirplane,
    getFlightDates,
    getFlightsOfDay,
    getFlightById,
    editFlights,
    localToApiFlight,
    apiToLocalFlight,
    computeSnap,
    onSyncChange,
    getSyncStatus,
    syncFlightCreate,
    syncFlightUpdate,
    syncFlightDelete,
    syncAllPending,
    pushDayLog,
    ep,
  };
})();

window.KlubkoAPI = KlubkoAPI;