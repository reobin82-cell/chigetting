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
        setPermissionStatus('로컬 알림 권한이 허용되지 않아 시스템 알림을 표시하지 못했습니다.');
        return false;
      }
    }

    const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
    const id = Number(String(Date.now()).slice(-9));
    await localNotifications.schedule({
      notifications: [
        {
          id,
          title: alert.title || '취소표 알림',
          body: alert.message || '좌석 변동이 감지되었습니다.',
          schedule: { at: new Date(Date.now() + 1000) },
          smallIcon: 'ic_launcher_foreground',
          extra: { ticketUrl }
        }
      ]
    });
    return true;
  } catch (error) {
    setPermissionStatus(`로컬 알림 표시 실패: ${error.message}`);
    return false;
  }
}

async function api(path, options = {}) {
  if (!state.apiBase) {
    throw new Error('백엔드 연결 정보가 설정되지 않았습니다.');
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
    title: payload?.notification?.title || payload?.title || '취소표 알림',
    message: payload?.notification?.body || payload?.body || '앱 안에서 알림 내용을 확인해 주세요.',
    createdAt: new Date().toISOString(),
    ticketUrl: extractNotificationTicketUrl(payload)
  };
}

function openAlertInsideApp(alert) {
  prependAlert(alert);
  showInAppAlert(alert);
  setActiveTab('alerts');
  setBackendStatus('알림을 눌러 앱 내부 알림 화면으로 이동했습니다.');
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
  return `
    <article class="match-card">
      <div class="match-main">
        <div class="match-date">
          <div class="weekday">${getWeekdayLabel(game)}</div>
          <div class="day-num">${getDayLabel(game)}</div>
          <div class="game-time">${game.time || '18:00'}</div>
        </div>
        <div class="match-center">
          <div class="match-kind">잠실 두산 경기</div>
          <div class="match-title">${game.homeTeam} <span class="match-kind">vs</span> ${game.awayTeam}</div>
          <div class="match-sub">${game.stadium}</div>
        </div>
        <div class="match-right">
          <div class="meta-inline">예매 링크</div>
          <div class="status-chip">모니터링 중</div>
          <a class="action-link" href="${buildInterparkUrl(game)}" target="_blank" rel="noreferrer">예매하기</a>
        </div>
      </div>
      <div class="match-footer">
        <div class="monitoring-state">취소표 감시 대기</div>
        <button class="secondary-btn" type="button" data-open-ticket="${buildInterparkUrl(game)}">인터파크 열기</button>
      </div>
    </article>
  `;
}

function createAlertCard(alert, compact = false) {
  const title = alert.title || '취소표 알림';
  const message = alert.message || '좌석 변동이 감지되었습니다.';
  const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
  const timeLabel = formatDateTime(alert.createdAt);

  if (compact) {
    return `
      <article class="alert-card">
        <div class="alert-main">
          <div class="match-date">
            <div class="weekday">${timeLabel}</div>
            <div class="alert-tag">최근 알림</div>
          </div>
          <div class="match-center">
            <div class="alert-title">${title}</div>
            <div class="alert-message">${message}</div>
          </div>
          <div class="match-right">
            <a class="action-link" href="${ticketUrl}" target="_blank" rel="noreferrer">인터파크 바로가기</a>
          </div>
        </div>
      </article>
    `;
  }

  const seatTag = (alert.seatResult?.consecutive || 0) >= 2 ? '연석 감지' : '취소표 감지';
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
          <div class="meta-inline">알림 즉시 접속</div>
          <a class="action-link" href="${ticketUrl}" target="_blank" rel="noreferrer">인터파크 열기</a>
        </div>
      </div>
      <div class="alert-footer">
        <div class="meta-inline">${alert.game?.date || ''} ${alert.game?.time || ''}</div>
        <button class="secondary-btn" type="button" data-open-ticket="${ticketUrl}">예매 화면 보기</button>
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
  const empty = '<div class="live-alert empty">백엔드에 연결되어야 경기 일정이 자동으로 표시됩니다.</div>';
  const html = state.games.length ? state.games.map(createGameCard).join('') : empty;
  setText(el.monitoringSummary, `잠실 두산 경기 모니터링 (${state.games.length}경기)`);
  setHtml(el.homeGamesList, html);
  setHtml(el.scheduleList, html);
  bindTicketButtons();
}

function showInAppAlert(alert) {
  const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
  el.liveAlert?.classList.remove('empty');
  setHtml(el.liveAlert, `
    <div class="alert-title">${alert.title || '취소표 알림'}</div>
    <div class="alert-message">${alert.message || '좌석 변동이 감지되었습니다.'}</div>
    <div class="alert-footer">
      <div class="meta-inline">${formatDateTime(alert.createdAt)}</div>
      <button class="primary-btn" type="button" data-open-ticket="${ticketUrl}">인터파크 바로 접속</button>
    </div>
  `);
  bindTicketButtons();
}

function renderAlerts() {
  const emptyMain = '<div class="live-alert empty">아직 발생한 취소표 알림이 없습니다.</div>';
  const emptyRecent = '<div class="live-alert empty">최근 알림이 없습니다.</div>';
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
      setText(el.nextGameText, '예정된 잠실 두산 경기가 없습니다.');
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

    setText(el.nextGameText, `${next.game.awayTeam}전 · ${next.game.date} ${next.game.time} · ${next.game.stadium}`);
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

  const notification = new Notification(alert.title || '취소표 알림', {
    body: alert.message || '좌석 변동이 감지되었습니다.'
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
        setPermissionStatus('안드로이드 로컬 알림 권한이 허용되었습니다.');
      }
    }
    await registerNativePush(true);
    return;
  }

  if (!('Notification' in window)) {
    setPermissionStatus('이 브라우저는 알림 API를 지원하지 않습니다.');
    return;
  }

  if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    setPermissionStatus('브라우저 알림은 https 또는 localhost 환경에서만 동작합니다.');
    return;
  }

  const result = await Notification.requestPermission();
  if (result === 'granted') setPermissionStatus('브라우저 알림이 허용되었습니다.');
  else if (result === 'denied') setPermissionStatus('브라우저 알림이 차단되었습니다.');
  else setPermissionStatus('브라우저 알림 권한 요청이 보류되었습니다.');
}

async function registerNativePush(fromButton = false) {
  const push = getPushPlugin();
  if (!push) {
    if (fromButton) setPermissionStatus('현재는 APK 네이티브 푸시 환경이 아닙니다.');
    return;
  }

  if (!hasFirebasePushConfig()) {
    if (fromButton) {
      setPermissionStatus('Firebase 미설정 상태입니다. 지금은 테스트용 로컬 알림만 사용할 수 있습니다.');
    }
    return;
  }

  if (state.nativePushInitialized) {
    setPermissionStatus('앱 푸시 등록이 이미 완료되었습니다.');
    return;
  }

  const permissionResult = await push.requestPermissions();
  if (permissionResult.receive !== 'granted') {
    setPermissionStatus('앱 푸시 권한이 허용되지 않았습니다.');
    return;
  }

  push.addListener('registration', async (token) => {
    try {
      await api('/api/devices/register', {
        method: 'POST',
        body: JSON.stringify({ token: token.value, platform: 'android' })
      });
      setPermissionStatus('앱 푸시 등록이 완료되었습니다.');
    } catch (error) {
      setPermissionStatus(`푸시 토큰 등록 실패: ${error.message}`);
    }
  });

  push.addListener('registrationError', (error) => {
    setPermissionStatus(`푸시 등록 오류: ${error.error || JSON.stringify(error)}`);
  });

  push.addListener('pushNotificationReceived', (notification) => {
    showInAppAlert({
      title: notification.title || '취소표 알림',
      message: notification.body || '좌석 변동이 감지되었습니다.',
      createdAt: new Date().toISOString(),
      ticketUrl: notification.data?.ticketUrl || DEFAULT_TICKET_URL
    });
  });

  push.addListener('pushNotificationActionPerformed', (event) => {
    openAlertInsideApp(buildNotificationAlert(event));
  });

  await push.register();
  state.nativePushInitialized = true;
  setPermissionStatus('앱 푸시 권한이 허용되었고 기기 등록을 진행 중입니다.');
}

function syncPermissionStatus() {
  if (isNativeApp()) {
    if (hasFirebasePushConfig()) {
      setText(el.enableAlertsBtn, '앱 푸시 권한 허용');
      setPermissionStatus('APK에서는 브라우저 알림 대신 앱 푸시 권한을 사용합니다.');
    } else {
      setText(el.enableAlertsBtn, '알림 권한 허용');
      setPermissionStatus('Firebase 없이도 테스트용 로컬 알림을 받을 수 있습니다.');
    }
    return;
  }

  if (!('Notification' in window)) {
    setPermissionStatus('이 브라우저는 Notification API를 지원하지 않습니다.');
    return;
  }

  if (Notification.permission === 'granted') setPermissionStatus('브라우저 알림이 허용되어 있습니다.');
  else if (Notification.permission === 'denied') setPermissionStatus('브라우저 알림이 차단되어 있습니다.');
  else setPermissionStatus('브라우저 알림 권한이 아직 요청되지 않았습니다.');
}

function updateHealth(data) {
  state.health = data;
  setText(el.serverStatus, data.ok ? '정상' : '오류');
  setText(el.lastRunAt, formatDateTime(data.lastRunAt));
  setText(el.watchedGames, String(data.watchedGames || 0));
  setText(el.alertCount, String(data.alerts || 0));
  setText(el.topbarUpdatedAt, formatDateTime(data.lastRunAt));
  if (data.lastError) setBackendStatus(`백엔드 연결됨. 최근 오류: ${data.lastError}`);
  else setBackendStatus('백엔드 연결이 정상입니다.');
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
  setText(el.streamBadge, 'SSE 연결 시도 중');
  state.stream = new EventSource(`${state.apiBase}/api/stream`);

  state.stream.addEventListener('hello', () => {
    setText(el.streamBadge, '실시간 연결됨');
    setBackendStatus('실시간 스트림 연결이 정상입니다.');
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
    setText(el.streamBadge, '실시간 연결 실패');
    setBackendStatus('실시간 연결 실패: 백엔드에 접속할 수 없습니다.');
  };
}

async function refresh() {
  try {
    await Promise.all([loadHealth(), loadGames(), loadAlerts()]);
  } catch (error) {
    setText(el.serverStatus, '연결 실패');
    setText(el.watchedGames, '0');
    setText(el.alertCount, '0');
    setText(el.topbarUpdatedAt, '연결 실패');
    setHtml(el.homeGamesList, '<div class="live-alert empty">백엔드에 연결되어야 경기 일정이 자동으로 표시됩니다.</div>');
    setHtml(el.scheduleList, '<div class="live-alert empty">백엔드에 연결되어야 경기 일정이 자동으로 표시됩니다.</div>');
    setHtml(el.alertsList, '<div class="live-alert empty">백엔드에 연결되어야 알림 내역이 표시됩니다.</div>');
    setHtml(el.recentAlertsList, '<div class="live-alert empty">백엔드 연결 후 최근 알림이 보입니다.</div>');
    setBackendStatus(`백엔드 연결 실패: ${error.message}`);
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
      setBackendStatus(`수동 점검은 실행됐지만 서버 오류가 있습니다: ${result.error}`);
    }
    await refresh();
  } catch (error) {
    setBackendStatus(`수동 점검 실패: ${error.message}`);
  }
}

async function restorePreviousConnection(previousApiBase) {
  state.apiBase = previousApiBase;
  if (previousApiBase) {
    try {
      await initializeConnectionFlow();
    } catch (error) {
      setBackendStatus(`기존 서버에도 다시 연결하지 못했습니다: ${error.message}`);
    }
    return;
  }

  setText(el.streamBadge, '대기 중');
}

async function saveApiBase() {
  const value = DEPLOYED_API_BASE;
  if (!value) {
    setBackendStatus('배포 백엔드 주소가 아직 앱에 설정되지 않았습니다.');
    return;
  }

  const previousApiBase = state.apiBase;
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }

  el.saveApiBaseBtn.disabled = true;
  state.apiBase = value;
  setBackendStatus('백엔드 연결 확인 중입니다.');

  try {
    await initializeConnectionFlow();
    setBackendStatus('백엔드 연결이 확인되었고 일정/알림 데이터를 바로 불러왔습니다.');
  } catch (error) {
    await restorePreviousConnection(previousApiBase);
    setBackendStatus(`백엔드 연결 검증 실패: ${error.message}`);
  } finally {
    el.saveApiBaseBtn.disabled = false;
  }
}

function buildLocalTestAlert() {
  return {
    id: `${Date.now()}-local-test`,
    createdAt: new Date().toISOString(),
    title: '로컬 테스트 알림',
    message: '알림 클릭 시 인터파크 예매 화면으로 이동합니다.',
    ticketUrl: DEFAULT_TICKET_URL,
    game: {
      date: new Date().toISOString().slice(0, 10),
      time: '18:30',
      homeTeam: '두산',
      awayTeam: '상대팀',
      stadium: '잠실야구장'
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
  setBackendStatus(`${reason} 앱 내 카드와 시스템 알림을 함께 시도했습니다.`);
}

async function sendTestNotification() {
  if (!canUseRemoteTestNotification()) {
    runLocalTestNotification('Firebase 미설정 상태라 서버 푸시 대신 앱 내부 로컬 테스트 알림으로 검증했습니다.');
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
      setBackendStatus('서버 테스트 알림을 발송했습니다.');
      return;
    }
  } catch (error) {
    runLocalTestNotification(`서버 테스트 알림 실패, 로컬 알림으로 대체: ${error.message}`);
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

  setBackendStatus(state.apiBase ? '배포 백엔드 연결을 준비 중입니다.' : '배포 백엔드 주소가 아직 설정되지 않았습니다.');

  try {
    await initDataFlow();
  } catch (error) {
    // 상태 문구로 안내
  }

  if (hasFirebasePushConfig()) {
    await registerNativePush();
  }
}

init().catch((error) => {
  setText(el.serverStatus, `오류: ${error.message}`);
  setBackendStatus(`초기화 실패: ${error.message}`);
});
