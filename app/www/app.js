const DEPLOYED_API_BASE = normalizeApiBase(window.__APP_CONFIG__?.apiBase || '');
const DEFAULT_TICKET_URL = 'https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004';

const state = {
  apiBase: '',
  stream: null,
  nativePushInitialized: false,
  games: [],
  alerts: [],
  health: null,
  nextGameTimer: null,
  pendingAlertOpen: null
};

const el = {
  topbarUpdatedAt: document.getElementById('topbarUpdatedAt'),
  serverStatus: document.getElementById('serverStatus'),
  lastRunAt: document.getElementById('lastRunAt'),
  watchedGames: document.getElementById('watchedGames'),
  alertCount: document.getElementById('alertCount'),
  streamBadge: document.getElementById('streamBadge'),
  permissionStatus: document.getElementById('permissionStatus'),
  backendStatus: document.getElementById('backendStatus'),
  apiBaseInput: document.getElementById('apiBaseInput'),
  saveApiBaseBtn: document.getElementById('saveApiBaseBtn'),
  enableAlertsBtn: document.getElementById('enableAlertsBtn'),
  manualRunBtn: document.getElementById('manualRunBtn'),
  sendTestNotificationBtn: document.getElementById('sendTestNotificationBtn'),
  homeGamesList: document.getElementById('homeGamesList'),
  scheduleList: document.getElementById('scheduleList'),
  alertsList: document.getElementById('alertsList'),
  recentAlertsList: document.getElementById('recentAlertsList'),
  liveAlert: document.getElementById('liveAlert'),
  monitoringSummary: document.getElementById('monitoringSummary'),
  nextGameText: document.getElementById('nextGameText'),
  countDays: document.getElementById('countDays'),
  countHours: document.getElementById('countHours'),
  countMinutes: document.getElementById('countMinutes'),
  countSeconds: document.getElementById('countSeconds'),
  statPolls: document.getElementById('statPolls'),
  statCancel: document.getElementById('statCancel'),
  statConsecutive: document.getElementById('statConsecutive'),
  statTransfer: document.getElementById('statTransfer'),
  tabButtons: [...document.querySelectorAll('.tab-btn')],
  pages: [...document.querySelectorAll('.page')]
};

function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.Plugins?.PushNotifications);
}

function getPushPlugin() {
  return window.Capacitor?.Plugins?.PushNotifications || window.Capacitor?.PushNotifications || null;
}

function getBrowserPlugin() {
  return window.Capacitor?.Plugins?.Browser || window.Capacitor?.Browser || null;
}

function getLocalNotificationsPlugin() {
  return window.Capacitor?.Plugins?.LocalNotifications || window.Capacitor?.LocalNotifications || null;
}

function extractNotificationTicketUrl(payload) {
  return (
    payload?.notification?.extra?.ticketUrl ||
    payload?.notification?.data?.ticketUrl ||
    payload?.extra?.ticketUrl ||
    payload?.data?.ticketUrl ||
    DEFAULT_TICKET_URL
  );
}

function hasFirebasePushConfig() {
  return Boolean(window.__HAS_FIREBASE_CONFIG__);
}

function canUseRemoteTestNotification() {
  return !isNativeApp() || hasFirebasePushConfig();
}

function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function inferDefaultApiBase() {
  if (DEPLOYED_API_BASE) return DEPLOYED_API_BASE;
  if (!isNativeApp() && window.location.protocol.startsWith('http')) {
    return normalizeApiBase(window.location.origin);
  }
  return '';
}

function setText(node, text) {
  if (node) node.textContent = text;
}

function setHtml(node, html) {
  if (node) node.innerHTML = html;
}

function setPermissionStatus(message) {
  setText(el.permissionStatus, message);
}

function setBackendStatus(message) {
  setText(el.backendStatus, message);
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('ko-KR') : '-';
}

function formatReservationStart(value) {
  const pendingLabel = '\uC608\uB9E4 \uC2DC\uAC04 \uD655\uC778 \uC911';
  if (!value) return pendingLabel;

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return pendingLabel;

  return `\uC608\uB9E4 \uC2DC\uC791 ${dt.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
}

function getGameDate(game) {
  return new Date(`${game.date}T${game.time || '18:00'}:00+09:00`);
}

function getWeekdayLabel(game) {
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(getGameDate(game));
}

function getDayLabel(game) {
  const dt = getGameDate(game);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function buildInterparkUrl(gameOrUrl) {
  if (!gameOrUrl) return DEFAULT_TICKET_URL;
  if (typeof gameOrUrl === 'string') return gameOrUrl;
  return gameOrUrl.ticketUrl || DEFAULT_TICKET_URL;
}

async function openTicketUrl(gameOrUrl) {
  const url = buildInterparkUrl(gameOrUrl);
  const browser = getBrowserPlugin();
  if (browser?.open) {
    await browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function showNativeLocalNotification(alert) {
  const localNotifications = getLocalNotificationsPlugin();
  if (!isNativeApp() || !localNotifications?.schedule) return false;

  try {
    if (localNotifications.requestPermissions) {
      const permission = await localNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        setPermissionStatus('濡쒖뺄 ?뚮┝ 沅뚰븳???덉슜?섏? ?딆븘 ?쒖뒪???뚮┝???쒖떆?섏? 紐삵뻽?듬땲??');
        return false;
      }
    }

    const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
    const id = Number(String(Date.now()).slice(-9));
    await localNotifications.schedule({
      notifications: [
        {
          id,
          title: alert.title || '痍⑥냼???뚮┝',
          body: alert.message || '醫뚯꽍 蹂?숈씠 媛먯??섏뿀?듬땲??',
          schedule: { at: new Date(Date.now() + 1000) },
          smallIcon: 'ic_launcher_foreground',
          extra: { ticketUrl }
        }
      ]
    });
    return true;
  } catch (error) {
    setPermissionStatus(`濡쒖뺄 ?뚮┝ ?쒖떆 ?ㅽ뙣: ${error.message}`);
    return false;
  }
}

async function api(path, options = {}) {
  if (!state.apiBase) {
    throw new Error('諛깆뿏???곌껐 ?뺣낫媛 ?ㅼ젙?섏? ?딆븯?듬땲??');
  }
  const response = await fetch(`${state.apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok && response.status !== 207) {
    throw new Error(payload.error || `API ${response.status}`);
  }

  return payload;
}

function prependAlert(alert) {
  state.alerts.unshift(alert);
  state.alerts = state.alerts.slice(0, 50);
  renderAlerts();
  renderStats();
}

function buildNotificationAlert(payload) {
  return {
    title: payload?.notification?.title || payload?.title || '痍⑥냼???뚮┝',
    message: payload?.notification?.body || payload?.body || '???덉뿉???뚮┝ ?댁슜???뺤씤??二쇱꽭??',
    createdAt: new Date().toISOString(),
    ticketUrl: extractNotificationTicketUrl(payload)
  };
}

function openAlertInsideApp(alert) {
  prependAlert(alert);
  showInAppAlert(alert);
  setActiveTab('alerts');
  setBackendStatus('?뚮┝???뚮윭 ???대? ?뚮┝ ?붾㈃?쇰줈 ?대룞?덉뒿?덈떎.');
}

function renderStats() {
  const pollCount = state.health?.lastRunAt ? 1 : 0;
  const cancelCount = state.alerts.filter((item) => (item.seatResult?.consecutive || 0) < 2).length;
  const consecutiveCount = state.alerts.filter((item) => (item.seatResult?.consecutive || 0) >= 2).length;

  setText(el.statPolls, String(pollCount));
  setText(el.statCancel, String(cancelCount));
  setText(el.statConsecutive, String(consecutiveCount));
  setText(el.statTransfer, '0');
}

function createGameCard(game) {
  const reservationLabel = formatReservationStart(game.reservationStart);

  return `
    <article class="match-card">
      <div class="match-main">
        <div class="match-date">
          <div class="weekday">${getWeekdayLabel(game)}</div>
          <div class="day-num">${getDayLabel(game)}</div>
          <div class="game-time">${game.time || '18:00'}</div>
        </div>
        <div class="match-center">
          <div class="match-kind">?좎떎 ?먯궛 寃쎄린</div>
          <div class="match-title">${game.homeTeam} <span class="match-kind">vs</span> ${game.awayTeam}</div>
          <div class="match-sub">${game.stadium}</div>
          <div class="match-sub">${reservationLabel}</div>
        </div>
        <div class="match-right">
          <div class="meta-inline">?덈ℓ 留곹겕</div>
          <div class="status-chip">紐⑤땲?곕쭅 以?/div>
          <a class="action-link" href="${buildInterparkUrl(game)}" target="_blank" rel="noreferrer">?덈ℓ?섍린</a>
        </div>
      </div>
      <div class="match-footer">
        <div class="monitoring-state">痍⑥냼??媛먯떆 ?湲?/div>
        <button class="secondary-btn" type="button" data-open-ticket="${buildInterparkUrl(game)}">?명꽣?뚰겕 ?닿린</button>
      </div>
    </article>
  `;
}

function createAlertCard(alert, compact = false) {
  const title = alert.title || '痍⑥냼???뚮┝';
  const message = alert.message || '醫뚯꽍 蹂?숈씠 媛먯??섏뿀?듬땲??';
  const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
  const timeLabel = formatDateTime(alert.createdAt);

  if (compact) {
    return `
      <article class="alert-card">
        <div class="alert-main">
          <div class="match-date">
            <div class="weekday">${timeLabel}</div>
            <div class="alert-tag">理쒓렐 ?뚮┝</div>
          </div>
          <div class="match-center">
            <div class="alert-title">${title}</div>
            <div class="alert-message">${message}</div>
          </div>
          <div class="match-right">
            <a class="action-link" href="${ticketUrl}" target="_blank" rel="noreferrer">?명꽣?뚰겕 諛붾줈媛湲?/a>
          </div>
        </div>
      </article>
    `;
  }

  const seatTag = (alert.seatResult?.consecutive || 0) >= 2 ? '?곗꽍 媛먯?' : '痍⑥냼??媛먯?';
  return `
    <article class="alert-card">
      <div class="alert-main">
        <div class="match-date">
          <div class="weekday">${timeLabel}</div>
          <div class="alert-tag">${seatTag}</div>
        </div>
        <div class="match-center">
          <div class="alert-title">${title}</div>
          <div class="alert-message">${message}</div>
        </div>
        <div class="match-right">
          <div class="meta-inline">?뚮┝ 利됱떆 ?묒냽</div>
          <a class="action-link" href="${ticketUrl}" target="_blank" rel="noreferrer">?명꽣?뚰겕 ?닿린</a>
        </div>
      </div>
      <div class="alert-footer">
        <div class="meta-inline">${alert.game?.date || ''} ${alert.game?.time || ''}</div>
        <button class="secondary-btn" type="button" data-open-ticket="${ticketUrl}">?덈ℓ ?붾㈃ 蹂닿린</button>
      </div>
    </article>
  `;
}

function bindTicketButtons() {
  document.querySelectorAll('[data-open-ticket]').forEach((button) => {
    button.onclick = () => {
      openTicketUrl(button.getAttribute('data-open-ticket')).catch(() => {});
    };
  });
}

function renderGames() {
  const empty = '<div class="live-alert empty">諛깆뿏?쒖뿉 ?곌껐?섏뼱??寃쎄린 ?쇱젙???먮룞?쇰줈 ?쒖떆?⑸땲??</div>';
  const html = state.games.length ? state.games.map(createGameCard).join('') : empty;
  setText(el.monitoringSummary, `?좎떎 ?먯궛 寃쎄린 紐⑤땲?곕쭅 (${state.games.length}寃쎄린)`);
  setHtml(el.homeGamesList, html);
  setHtml(el.scheduleList, html);
  bindTicketButtons();
}

function showInAppAlert(alert) {
  const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
  el.liveAlert?.classList.remove('empty');
  setHtml(el.liveAlert, `
    <div class="alert-title">${alert.title || '痍⑥냼???뚮┝'}</div>
    <div class="alert-message">${alert.message || '醫뚯꽍 蹂?숈씠 媛먯??섏뿀?듬땲??'}</div>
    <div class="alert-footer">
      <div class="meta-inline">${formatDateTime(alert.createdAt)}</div>
      <button class="primary-btn" type="button" data-open-ticket="${ticketUrl}">?명꽣?뚰겕 諛붾줈 ?묒냽</button>
    </div>
  `);
  bindTicketButtons();
}

function renderAlerts() {
  const emptyMain = '<div class="live-alert empty">?꾩쭅 諛쒖깮??痍⑥냼???뚮┝???놁뒿?덈떎.</div>';
  const emptyRecent = '<div class="live-alert empty">理쒓렐 ?뚮┝???놁뒿?덈떎.</div>';
  setHtml(el.alertsList, state.alerts.length ? state.alerts.map((item) => createAlertCard(item)).join('') : emptyMain);
  setHtml(el.recentAlertsList, state.alerts.length ? state.alerts.slice(0, 2).map((item) => createAlertCard(item, true)).join('') : emptyRecent);
  if (state.alerts[0]) {
    showInAppAlert(state.alerts[0]);
  }
  bindTicketButtons();
}

function updateCountdown() {
  if (state.nextGameTimer) clearInterval(state.nextGameTimer);

  const tick = () => {
    const next = state.games
      .map((game) => ({ game, date: getGameDate(game) }))
      .filter((item) => item.date > new Date())
      .sort((a, b) => a.date - b.date)[0];

    if (!next) {
      setText(el.nextGameText, '?덉젙???좎떎 ?먯궛 寃쎄린媛 ?놁뒿?덈떎.');
      setText(el.countDays, '00');
      setText(el.countHours, '00');
      setText(el.countMinutes, '00');
      setText(el.countSeconds, '00');
      return;
    }

    const diff = next.date.getTime() - Date.now();
    const totalSeconds = Math.max(0, Math.floor(diff / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    setText(
      el.nextGameText,
      `${next.game.awayTeam}전 · ${next.game.date} ${next.game.time} · ${formatReservationStart(next.game.reservationStart)}`
    );
    setText(el.countDays, String(days).padStart(2, '0'));
    setText(el.countHours, String(hours).padStart(2, '0'));
    setText(el.countMinutes, String(minutes).padStart(2, '0'));
    setText(el.countSeconds, String(seconds).padStart(2, '0'));
  };

  tick();
  state.nextGameTimer = setInterval(tick, 1000);
}

function showBrowserNotification(alert) {
  if (isNativeApp() || !('Notification' in window) || Notification.permission !== 'granted') return;

  const notification = new Notification(alert.title || '痍⑥냼???뚮┝', {
    body: alert.message || '醫뚯꽍 蹂?숈씠 媛먯??섏뿀?듬땲??'
  });
  notification.onclick = () => {
    openTicketUrl(alert.ticketUrl || alert.game).catch(() => {});
    window.focus();
  };
}

async function ensureBrowserPermission() {
  if (isNativeApp()) {
    const localNotifications = getLocalNotificationsPlugin();
    if (localNotifications?.requestPermissions) {
      const permission = await localNotifications.requestPermissions();
      if (permission.display === 'granted') {
        setPermissionStatus('?덈뱶濡쒖씠??濡쒖뺄 ?뚮┝ 沅뚰븳???덉슜?섏뿀?듬땲??');
      }
    }
    await registerNativePush(true);
    return;
  }

  if (!('Notification' in window)) {
    setPermissionStatus('??釉뚮씪?곗????뚮┝ API瑜?吏?먰븯吏 ?딆뒿?덈떎.');
    return;
  }

  if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    setPermissionStatus('釉뚮씪?곗? ?뚮┝? https ?먮뒗 localhost ?섍꼍?먯꽌留??숈옉?⑸땲??');
    return;
  }

  const result = await Notification.requestPermission();
  if (result === 'granted') setPermissionStatus('釉뚮씪?곗? ?뚮┝???덉슜?섏뿀?듬땲??');
  else if (result === 'denied') setPermissionStatus('釉뚮씪?곗? ?뚮┝??李⑤떒?섏뿀?듬땲??');
  else setPermissionStatus('釉뚮씪?곗? ?뚮┝ 沅뚰븳 ?붿껌??蹂대쪟?섏뿀?듬땲??');
}

async function registerNativePush(fromButton = false) {
  const push = getPushPlugin();
  if (!push) {
    if (fromButton) setPermissionStatus('?꾩옱??APK ?ㅼ씠?곕툕 ?몄떆 ?섍꼍???꾨떃?덈떎.');
    return;
  }

  if (!hasFirebasePushConfig()) {
    if (fromButton) {
      setPermissionStatus('Firebase 誘몄꽕???곹깭?낅땲?? 吏湲덉? ?뚯뒪?몄슜 濡쒖뺄 ?뚮┝留??ъ슜?????덉뒿?덈떎.');
    }
    return;
  }

  if (state.nativePushInitialized) {
    setPermissionStatus('???몄떆 ?깅줉???대? ?꾨즺?섏뿀?듬땲??');
    return;
  }

  const permissionResult = await push.requestPermissions();
  if (permissionResult.receive !== 'granted') {
    setPermissionStatus('???몄떆 沅뚰븳???덉슜?섏? ?딆븯?듬땲??');
    return;
  }

  push.addListener('registration', async (token) => {
    try {
      await api('/api/devices/register', {
        method: 'POST',
        body: JSON.stringify({ token: token.value, platform: 'android' })
      });
      setPermissionStatus('???몄떆 ?깅줉???꾨즺?섏뿀?듬땲??');
    } catch (error) {
      setPermissionStatus(`?몄떆 ?좏겙 ?깅줉 ?ㅽ뙣: ${error.message}`);
    }
  });

  push.addListener('registrationError', (error) => {
    setPermissionStatus(`?몄떆 ?깅줉 ?ㅻ쪟: ${error.error || JSON.stringify(error)}`);
  });

  push.addListener('pushNotificationReceived', (notification) => {
    showInAppAlert({
      title: notification.title || '痍⑥냼???뚮┝',
      message: notification.body || '醫뚯꽍 蹂?숈씠 媛먯??섏뿀?듬땲??',
      createdAt: new Date().toISOString(),
      ticketUrl: notification.data?.ticketUrl || DEFAULT_TICKET_URL
    });
  });

  push.addListener('pushNotificationActionPerformed', (event) => {
    openAlertInsideApp(buildNotificationAlert(event));
  });

  await push.register();
  state.nativePushInitialized = true;
  setPermissionStatus('???몄떆 沅뚰븳???덉슜?섏뿀怨?湲곌린 ?깅줉??吏꾪뻾 以묒엯?덈떎.');
}

function syncPermissionStatus() {
  if (isNativeApp()) {
    if (hasFirebasePushConfig()) {
      setText(el.enableAlertsBtn, '???몄떆 沅뚰븳 ?덉슜');
      setPermissionStatus('APK?먯꽌??釉뚮씪?곗? ?뚮┝ ??????몄떆 沅뚰븳???ъ슜?⑸땲??');
    } else {
      setText(el.enableAlertsBtn, '?뚮┝ 沅뚰븳 ?덉슜');
      setPermissionStatus('Firebase ?놁씠???뚯뒪?몄슜 濡쒖뺄 ?뚮┝??諛쏆쓣 ???덉뒿?덈떎.');
    }
    return;
  }

  if (!('Notification' in window)) {
    setPermissionStatus('??釉뚮씪?곗???Notification API瑜?吏?먰븯吏 ?딆뒿?덈떎.');
    return;
  }

  if (Notification.permission === 'granted') setPermissionStatus('釉뚮씪?곗? ?뚮┝???덉슜?섏뼱 ?덉뒿?덈떎.');
  else if (Notification.permission === 'denied') setPermissionStatus('釉뚮씪?곗? ?뚮┝??李⑤떒?섏뼱 ?덉뒿?덈떎.');
  else setPermissionStatus('釉뚮씪?곗? ?뚮┝ 沅뚰븳???꾩쭅 ?붿껌?섏? ?딆븯?듬땲??');
}

function updateHealth(data) {
  state.health = data;
  setText(el.serverStatus, data.ok ? '?뺤긽' : '?ㅻ쪟');
  setText(el.lastRunAt, formatDateTime(data.lastRunAt));
  setText(el.watchedGames, String(data.watchedGames || 0));
  setText(el.alertCount, String(data.alerts || 0));
  setText(el.topbarUpdatedAt, formatDateTime(data.lastRunAt));
  if (data.lastError) setBackendStatus(`諛깆뿏???곌껐?? 理쒓렐 ?ㅻ쪟: ${data.lastError}`);
  else setBackendStatus('諛깆뿏???곌껐???뺤긽?낅땲??');
}

async function loadHealth() {
  updateHealth(await api('/api/health'));
}

async function loadGames() {
  const data = await api('/api/games');
  state.games = data.games || [];
  renderGames();
  updateCountdown();
}

async function loadAlerts() {
  const data = await api('/api/alerts');
  state.alerts = data.alerts || [];
  renderAlerts();
  renderStats();
}

async function hydrateDataAfterConnection() {
  await refresh();

  if (!state.health?.lastRunAt || (!state.games.length && !state.alerts.length)) {
    await api('/api/monitor/run', { method: 'POST', body: '{}' });
    await refresh();
  }
}

function bindStream() {
  if (!state.apiBase) return;
  if (state.stream) state.stream.close();
  setText(el.streamBadge, '\uC2E4\uC2DC\uAC04 \uC5F0\uACB0 \uC911');
  state.stream = new EventSource(`${state.apiBase}/api/stream`);

  state.stream.addEventListener('hello', () => {
    setText(el.streamBadge, '\uC2E4\uC2DC\uAC04 \uC5F0\uACB0\uB428');
    setBackendStatus('\uC2E4\uC2DC\uAC04 \uC2A4\uD2B8\uB9BC \uC5F0\uACB0\uC774 \uC815\uC0C1\uC785\uB2C8\uB2E4.');
  });

  state.stream.addEventListener('alert', async (event) => {
    const alert = JSON.parse(event.data);
    state.alerts.unshift(alert);
    state.alerts = state.alerts.slice(0, 50);
    renderAlerts();
    renderStats();
    showBrowserNotification(alert);
    await loadHealth();
  });

  state.stream.onerror = () => {
    setText(el.streamBadge, '?ㅼ떆媛??곌껐 ?ㅽ뙣');
    setBackendStatus('?ㅼ떆媛??곌껐 ?ㅽ뙣: 諛깆뿏?쒖뿉 ?묒냽?????놁뒿?덈떎.');
  };
}

async function refresh() {
  try {
    await Promise.all([loadHealth(), loadGames(), loadAlerts()]);
  } catch (error) {
    setText(el.serverStatus, '?곌껐 ?ㅽ뙣');
    setText(el.watchedGames, '0');
    setText(el.alertCount, '0');
    setText(el.topbarUpdatedAt, '?곌껐 ?ㅽ뙣');
    setHtml(el.homeGamesList, '<div class="live-alert empty">諛깆뿏?쒖뿉 ?곌껐?섏뼱??寃쎄린 ?쇱젙???먮룞?쇰줈 ?쒖떆?⑸땲??</div>');
    setHtml(el.scheduleList, '<div class="live-alert empty">諛깆뿏?쒖뿉 ?곌껐?섏뼱??寃쎄린 ?쇱젙???먮룞?쇰줈 ?쒖떆?⑸땲??</div>');
    setHtml(el.alertsList, '<div class="live-alert empty">諛깆뿏?쒖뿉 ?곌껐?섏뼱???뚮┝ ?댁뿭???쒖떆?⑸땲??</div>');
    setHtml(el.recentAlertsList, '<div class="live-alert empty">諛깆뿏???곌껐 ??理쒓렐 ?뚮┝??蹂댁엯?덈떎.</div>');
    setBackendStatus(`諛깆뿏???곌껐 ?ㅽ뙣: ${error.message}`);
    throw error;
  }
}

async function initializeConnectionFlow() {
  await hydrateDataAfterConnection();
  bindStream();
}

async function manualRun() {
  try {
    const result = await api('/api/monitor/run', { method: 'POST', body: '{}' });
    if (result.error) {
      setBackendStatus(`?섎룞 ?먭?? ?ㅽ뻾?먯?留??쒕쾭 ?ㅻ쪟媛 ?덉뒿?덈떎: ${result.error}`);
    }
    await refresh();
  } catch (error) {
    setBackendStatus(`?섎룞 ?먭? ?ㅽ뙣: ${error.message}`);
  }
}

async function restorePreviousConnection(previousApiBase) {
  state.apiBase = previousApiBase;
  if (previousApiBase) {
    try {
      await initializeConnectionFlow();
    } catch (error) {
      setBackendStatus(`湲곗〈 ?쒕쾭?먮룄 ?ㅼ떆 ?곌껐?섏? 紐삵뻽?듬땲?? ${error.message}`);
    }
    return;
  }

  setText(el.streamBadge, '\uB300\uAE30 \uC911');
}

async function saveApiBase() {
  const value = DEPLOYED_API_BASE;
  if (!value) {
    setBackendStatus('諛고룷 諛깆뿏??二쇱냼媛 ?꾩쭅 ?깆뿉 ?ㅼ젙?섏? ?딆븯?듬땲??');
    return;
  }

  const previousApiBase = state.apiBase;
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }

  el.saveApiBaseBtn.disabled = true;
  state.apiBase = value;
  setBackendStatus('諛깆뿏???곌껐 ?뺤씤 以묒엯?덈떎.');

  try {
    await initializeConnectionFlow();
    setBackendStatus('諛깆뿏???곌껐???뺤씤?섏뿀怨??쇱젙/?뚮┝ ?곗씠?곕? 諛붾줈 遺덈윭?붿뒿?덈떎.');
  } catch (error) {
    await restorePreviousConnection(previousApiBase);
    setBackendStatus(`諛깆뿏???곌껐 寃利??ㅽ뙣: ${error.message}`);
  } finally {
    el.saveApiBaseBtn.disabled = false;
  }
}

function buildLocalTestAlert() {
  return {
    id: `${Date.now()}-local-test`,
    createdAt: new Date().toISOString(),
    title: '\uB85C\uCEEC \uD14C\uC2A4\uD2B8 \uC54C\uB9BC',
    message: '\uC54C\uB9BC\uC744 \uB20C\uB7EC \uC571 \uB0B4 \uC54C\uB9BC \uD654\uBA74\uC73C\uB85C \uC774\uB3D9\uD574 \uBCF4\uC138\uC694.',
    ticketUrl: DEFAULT_TICKET_URL,
    game: {
      date: new Date().toISOString().slice(0, 10),
      time: '18:30',
      homeTeam: '\uB450\uC0B0',
      awayTeam: '\uC0C1\uB300\uD300',
      stadium: '\uC7A0\uC2E4\uC57C\uAD6C\uC7A5'
    },
    seatResult: {
      total: 2,
      consecutive: 2,
      confirmed: true
    }
  };
}

function runLocalTestNotification(reason) {
  const alert = buildLocalTestAlert();
  prependAlert(alert);
  showInAppAlert(alert);
  showNativeLocalNotification(alert).then((shown) => {
    if (!shown) showBrowserNotification(alert);
  });
  setBackendStatus(`${reason} ????移대뱶? ?쒖뒪???뚮┝???④퍡 ?쒕룄?덉뒿?덈떎.`);
}

async function sendTestNotification() {
  if (!canUseRemoteTestNotification()) {
    runLocalTestNotification('Firebase 誘몄꽕???곹깭???쒕쾭 ?몄떆 ??????대? 濡쒖뺄 ?뚯뒪???뚮┝?쇰줈 寃利앺뻽?듬땲??');
    return;
  }

  try {
    const result = await api('/api/test/alert', {
      method: 'POST',
      body: '{}'
    });
    if (result.alert) {
      prependAlert(result.alert);
      showBrowserNotification(result.alert);
      setBackendStatus('?쒕쾭 ?뚯뒪???뚮┝??諛쒖넚?덉뒿?덈떎.');
      return;
    }
  } catch (error) {
    runLocalTestNotification(`?쒕쾭 ?뚯뒪???뚮┝ ?ㅽ뙣, 濡쒖뺄 ?뚮┝?쇰줈 ?泥? ${error.message}`);
  }
}

function setActiveTab(tab) {
  el.tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  el.pages.forEach((page) => {
    page.classList.toggle('active', page.id === `page-${tab}`);
  });
}

async function initDataFlow() {
  await initializeConnectionFlow();
}

function bindTabEvents() {
  el.tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
}

async function init() {
  state.apiBase = inferDefaultApiBase();
  if (el.apiBaseInput) {
    el.apiBaseInput.value = '';
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  bindTabEvents();
  if (el.saveApiBaseBtn) {
    el.saveApiBaseBtn.addEventListener('click', saveApiBase);
  }
  el.enableAlertsBtn.addEventListener('click', ensureBrowserPermission);
  el.manualRunBtn.addEventListener('click', manualRun);
  el.sendTestNotificationBtn.addEventListener('click', sendTestNotification);

  syncPermissionStatus();

  const localNotifications = getLocalNotificationsPlugin();
  if (localNotifications?.addListener) {
    localNotifications.addListener('localNotificationActionPerformed', (event) => {
      openAlertInsideApp(buildNotificationAlert(event));
    });
  }

  setBackendStatus(state.apiBase ? '諛고룷 諛깆뿏???곌껐??以鍮?以묒엯?덈떎.' : '諛고룷 諛깆뿏??二쇱냼媛 ?꾩쭅 ?ㅼ젙?섏? ?딆븯?듬땲??');

  try {
    await initDataFlow();
  } catch (error) {
    // ?곹깭 臾멸뎄濡??덈궡
  }

  if (hasFirebasePushConfig()) {
    await registerNativePush();
  }
}

init().catch((error) => {
  setText(el.serverStatus, `?ㅻ쪟: ${error.message}`);
  setBackendStatus(`珥덇린???ㅽ뙣: ${error.message}`);
});

