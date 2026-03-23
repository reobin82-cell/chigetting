const DEPLOYED_API_BASE = normalizeApiBase(window.__APP_CONFIG__?.apiBase || '');
const DEFAULT_TICKET_URL = 'https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004';
const RESERVATION_REMINDER_STORAGE_KEY = 'reservation-reminder-selections-v1';

const state = {
  apiBase: '',
  stream: null,
  nativePushInitialized: false,
  games: [],
  alerts: [],
  health: null,
  preferredConsecutiveSeats: 2,
  reminderSelections: {},
  nextGameTimer: null,
  interparkClockTimer: null,
  pendingAlertOpen: null
};

const el = {
  topbarUpdatedAt: document.getElementById('topbarUpdatedAt'),
  interparkServerTime: document.getElementById('interparkServerTime'),
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
  countdownInline: document.getElementById('countdownInline'),
  reservationRuleText: document.getElementById('reservationRuleText'),
  statPolls: document.getElementById('statPolls'),
  statCancel: document.getElementById('statCancel'),
  statConsecutive: document.getElementById('statConsecutive'),
  statTransfer: document.getElementById('statTransfer'),
  seatOptionHint: document.getElementById('seatOptionHint'),
  seatOptionButtons: [...document.querySelectorAll('[data-seat-option]')],
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function formatTeamName(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const rules = [
    [/doosan|bears/i, '두산'],
    [/hanwha|eagles/i, '한화'],
    [/kiwoom|heroes/i, '키움'],
    [/lg|twins/i, 'LG'],
    [/kt|wiz/i, 'KT'],
    [/ssg|landers/i, 'SSG'],
    [/lotte|giants/i, '롯데'],
    [/kia|tigers/i, 'KIA'],
    [/nc|dinos/i, 'NC'],
    [/samsung|lions/i, '삼성']
  ];

  const match = rules.find(([pattern]) => pattern.test(normalized));
  return match ? match[1] : normalized;
}

function formatStadiumName(value = '') {
  if (!value) return '잠실야구장';
  if (/jamsil/i.test(value)) return '잠실야구장';
  return value;
}

function formatReservationStart(value) {
  const pendingLabel = '\uC608\uB9E4 \uC2DC\uAC04 \uD655\uC778 \uC911';
  if (!value) return pendingLabel;

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return pendingLabel;

  return `\uC608\uB9E4 \uC2DC\uC791 ${dt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
}

function buildExpectedReservationDate(game) {
  if (!game?.date) return null;
  const match = String(game.date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const dt = new Date(Number(year), Number(month) - 1, Number(day), 11, 0, 0, 0);
  dt.setDate(dt.getDate() - 7);
  return dt;
}

function formatReservationStartHero(game) {
  const dt = getReservationDate(game);
  if (!dt) return '예매 일정 확인 중';
  return dt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatReservationDetail(game) {
  const dt = getReservationDate(game);
  if (!dt) return '예매 시간을 확인하는 중입니다.';
  return `공식 예매 시각 · ${dt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
}

function getReservationDate(game) {
  const expected = buildExpectedReservationDate(game);
  if (game?.reservationStart) {
    const parsed = new Date(game.reservationStart);
    if (!Number.isNaN(parsed.getTime())) {
      if (expected && Math.abs(parsed.getTime() - expected.getTime()) > 30 * 60 * 1000) {
        return expected;
      }
      return parsed;
    }
  }

  return expected;
}

function formatReservationDateOnly(game) {
  const dt = getReservationDate(game);
  if (!dt) return '예매 일정 확인 중';
  return dt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatCountdownInline(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}일 ${hours}시간 ${minutes}분 ${seconds}초 남음`;
}

function formatAlertTitle(alert = {}) {
  const seats = alert?.seatResult?.consecutive || alert?.seatResult?.total || 0;
  if (seats >= 2) return `${seats}연석 감지`;
  return '취소표 알림';
}

function formatAlertMessage(alert = {}) {
  const game = alert.game || {};
  const opponent = formatTeamName(game.awayTeam || '') || '상대팀';
  const dateTime = [game.date, game.time].filter(Boolean).join(' ');

  if (alert?.seatResult?.consecutive >= 2) {
    return `${dateTime} ${opponent}전 · ${alert.seatResult.consecutive}연석 확인`;
  }
  if (alert?.seatResult?.total) {
    return `${dateTime} ${opponent}전 · 좌석 ${alert.seatResult.total}석 확인`;
  }
  return alert.message || '앱 안에서 알림 내용을 확인해 주세요.';
}

function renderSeatOptions() {
  const preferred = Number(state.preferredConsecutiveSeats || 2);
  el.seatOptionButtons.forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.seatOption) === preferred);
  });
  setText(el.seatOptionHint, `${preferred}연석 이상 감지되면 알림을 보냅니다.`);
}

function loadReminderSelections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESERVATION_REMINDER_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function persistReminderSelections() {
  localStorage.setItem(RESERVATION_REMINDER_STORAGE_KEY, JSON.stringify(state.reminderSelections));
}

function getReminderKey(game) {
  return String(game?.id || `${game?.date || ''}-${game?.time || ''}-${game?.awayTeam || ''}`);
}

function getReminderSelectionsForGame(game) {
  const list = state.reminderSelections[getReminderKey(game)];
  return Array.isArray(list) ? list.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];
}

function buildReminderNotificationId(game, minutes) {
  const source = `${getReminderKey(game)}:${minutes}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash % 2000000000) + 1000;
}

function renderReminderButtons(game) {
  const selected = new Set(getReminderSelectionsForGame(game));
  return [5, 3, 1].map((minutes) => {
    const activeClass = selected.has(minutes) ? 'active' : '';
    return `<button class="reminder-btn ${activeClass}" type="button" data-game-id="${escapeHtml(getReminderKey(game))}" data-reminder-minutes="${minutes}">${minutes}분 전</button>`;
  }).join('');
}

async function scheduleReservationReminder(game, minutes) {
  const localNotifications = getLocalNotificationsPlugin();
  if (!isNativeApp() || !localNotifications?.schedule) {
    throw new Error('현재 기기에서는 예약 알림을 지원하지 않습니다.');
  }

  if (localNotifications.requestPermissions) {
    const permission = await localNotifications.requestPermissions();
    if (permission.display !== 'granted') {
      throw new Error('알림 권한이 허용되지 않았습니다.');
    }
  }

  const reservationDate = getReservationDate(game);
  if (!reservationDate) {
    throw new Error('예매 시작 시간을 아직 확인하지 못했습니다.');
  }

  const triggerAt = new Date(reservationDate.getTime() - (minutes * 60 * 1000));
  if (triggerAt.getTime() <= Date.now()) {
    throw new Error(`${minutes}분 전 알림을 설정하기에는 시간이 이미 지났습니다.`);
  }

  await localNotifications.schedule({
    notifications: [
      {
        id: buildReminderNotificationId(game, minutes),
        title: `${formatTeamName(game.awayTeam)}전 예매 ${minutes}분 전`,
        body: `${formatReservationStartHero(game)} 예매가 곧 시작됩니다.`,
        schedule: { at: triggerAt, allowWhileIdle: true },
        smallIcon: 'ic_launcher_foreground',
        extra: {
          ticketUrl: buildInterparkUrl(game),
          reminderMinutes: minutes,
          gameId: getReminderKey(game)
        }
      }
    ]
  });
}

async function cancelReservationReminder(game, minutes) {
  const localNotifications = getLocalNotificationsPlugin();
  if (!localNotifications?.cancel) return;
  await localNotifications.cancel({
    notifications: [{ id: buildReminderNotificationId(game, minutes) }]
  });
}

async function toggleReservationReminder(game, minutes) {
  const key = getReminderKey(game);
  const current = new Set(getReminderSelectionsForGame(game));
  const isActive = current.has(minutes);

  try {
    if (isActive) {
      current.delete(minutes);
      await cancelReservationReminder(game, minutes);
      setBackendStatus(`${formatTeamName(game.awayTeam)}전 ${minutes}분 전 알림을 해제했습니다.`);
    } else {
      await scheduleReservationReminder(game, minutes);
      current.add(minutes);
      setBackendStatus(`${formatTeamName(game.awayTeam)}전 ${minutes}분 전 알림을 설정했습니다.`);
    }

    state.reminderSelections[key] = [...current].sort((a, b) => a - b);
    if (!state.reminderSelections[key].length) {
      delete state.reminderSelections[key];
    }
    persistReminderSelections();
    renderGames();
  } catch (error) {
    setBackendStatus(`예매 알림 설정 실패: ${error.message}`);
  }
}

function syncInterparkClock(health = {}) {
  if (state.interparkClockTimer) clearInterval(state.interparkClockTimer);

  const interparkDate = health.interparkServerTime ? new Date(health.interparkServerTime) : null;
  if (!interparkDate || Number.isNaN(interparkDate.getTime())) {
    setText(el.interparkServerTime, '확인 중');
    return;
  }

  const serverDate = health.serverTime ? new Date(health.serverTime) : new Date();
  const offset = interparkDate.getTime() - serverDate.getTime();
  const tick = () => {
    setText(el.interparkServerTime, formatDateTime(new Date(Date.now() + offset).toISOString()));
  };

  tick();
  state.interparkClockTimer = setInterval(tick, 1000);
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
          title: formatAlertTitle(alert),
          body: formatAlertMessage(alert),
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
  const preferred = Number(state.preferredConsecutiveSeats || 2);
  const consecutiveAlerts = state.alerts.filter((item) => (item.seatResult?.consecutive || 0) >= preferred).length;

  setText(el.statPolls, String(state.games.length));
  setText(el.statCancel, String(state.alerts.length));
  setText(el.statConsecutive, String(preferred));
  setText(el.statTransfer, String(consecutiveAlerts));
}

function createGameCard(game) {
  const reservationLabel = formatReservationDetail(game);
  const reservationHero = formatReservationStartHero(game);
  const awayTeam = formatTeamName(game.awayTeam || '');
  const homeTeam = formatTeamName(game.homeTeam || '');
  const seatPreference = Number(state.preferredConsecutiveSeats || 2);
  const ticketUrl = buildInterparkUrl(game);

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
          <div class="match-title">${homeTeam} <span class="match-kind">vs</span> ${awayTeam}</div>
          <div class="match-sub">${formatStadiumName(game.stadium)}</div>
          <div class="reservation-cta">
            <div class="reservation-cta-label">예매 시작</div>
            <div class="reservation-cta-time">${reservationHero}</div>
            <div class="reservation-cta-note">${reservationLabel}</div>
          </div>
        </div>
        <div class="match-right">
          <div class="meta-inline">예매 링크</div>
          <div class="status-chip">감시 중</div>
          <a class="action-link" href="${ticketUrl}" target="_blank" rel="noreferrer">예매하기</a>
        </div>
      </div>
      <div class="match-footer">
        <div class="match-footer-main">
          <div class="monitoring-state">${seatPreference}연석 이상 알림 중</div>
          <div class="reminder-panel">
            <div class="reminder-title">예매 시작 알림</div>
            <div class="reminder-group">${renderReminderButtons(game)}</div>
            <div class="reminder-helper">선택한 시점에 앱 알림으로 알려드립니다.</div>
          </div>
        </div>
        <button class="secondary-btn" type="button" data-open-ticket="${ticketUrl}">인터파크 열기</button>
      </div>
    </article>
  `;
}

function createAlertCard(alert, compact = false) {
  const title = formatAlertTitle(alert);
  const message = formatAlertMessage(alert);
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

  const seatTag = (alert.seatResult?.consecutive || 0) >= 2
    ? `${alert.seatResult.consecutive}연석 감지`
    : '취소표 감지';
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

function bindReminderButtons() {
  document.querySelectorAll('[data-reminder-minutes][data-game-id]').forEach((button) => {
    button.onclick = () => {
      const gameId = button.getAttribute('data-game-id');
      const minutes = Number(button.getAttribute('data-reminder-minutes'));
      const game = state.games.find((item) => getReminderKey(item) === gameId);
      if (!game) {
        setBackendStatus('알림을 설정할 경기 정보를 찾지 못했습니다.');
        return;
      }
      toggleReservationReminder(game, minutes);
    };
  });
}

function renderGames() {
  const empty = '<div class="live-alert empty">백엔드에 연결되면 경기 일정이 자동으로 표시됩니다.</div>';
  const html = state.games.length ? state.games.map(createGameCard).join('') : empty;
  setText(el.monitoringSummary, `잠실 두산 경기 모니터링 (${state.games.length}경기)`);
  setText(el.reservationRuleText, '두산베어스 홈 경기 티켓은 경기 7일 전 오전 11시부터 예매가 시작됩니다. 공식 홈페이지와 인터파크, 서버 시간을 함께 확인해 주세요.');
  setHtml(el.homeGamesList, html);
  setHtml(el.scheduleList, html);
  bindTicketButtons();
  bindReminderButtons();
}

function showInAppAlert(alert) {
  const ticketUrl = buildInterparkUrl(alert.ticketUrl || alert.game);
  el.liveAlert?.classList.remove('empty');
  setHtml(el.liveAlert, `
    <div class="alert-title">${formatAlertTitle(alert)}</div>
    <div class="alert-message">${formatAlertMessage(alert)}</div>
    <div class="alert-footer">
      <div class="meta-inline">${formatDateTime(alert.createdAt)}</div>
      <button class="primary-btn" type="button" data-open-ticket="${ticketUrl}">인터파크 바로가기</button>
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
      .map((game) => ({ game, date: getReservationDate(game) }))
      .filter((item) => item.date)
      .filter((item) => item.date > new Date())
      .sort((a, b) => a.date - b.date)[0];

    if (!next) {
      setText(el.nextGameText, '예정된 인터파크 예매 일정이 없습니다.');
      setText(el.countdownInline, '예매 대기 일정이 없습니다.');
      return;
    }

    const diff = next.date.getTime() - Date.now();
    const totalSeconds = Math.max(0, Math.floor(diff / 1000));

    setText(
      el.nextGameText,
      `${formatTeamName(next.game.awayTeam)}전 예매 · ${formatReservationDateOnly(next.game)} 시작`
    );
    setText(el.countdownInline, formatCountdownInline(totalSeconds));
  };

  tick();
  state.nextGameTimer = setInterval(tick, 1000);
}

function showBrowserNotification(alert) {
  if (isNativeApp() || !('Notification' in window) || Notification.permission !== 'granted') return;

  const notification = new Notification(formatAlertTitle(alert), {
    body: formatAlertMessage(alert)
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
  state.preferredConsecutiveSeats = Number(data.preferredConsecutiveSeats || state.preferredConsecutiveSeats || 2);
  setText(el.serverStatus, data.ok ? '정상' : '오류');
  setText(el.lastRunAt, formatDateTime(data.lastRunAt));
  setText(el.watchedGames, String(data.watchedGames || 0));
  setText(el.alertCount, String(data.alerts || 0));
  setText(el.topbarUpdatedAt, formatDateTime(data.lastRunAt || data.serverTime));
  syncInterparkClock(data);
  renderSeatOptions();
  renderStats();
  renderGames();
  updateCountdown();

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
  setText(el.streamBadge, '실시간 연결 중');
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
    setText(el.interparkServerTime, '확인 실패');
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
    setBackendStatus('백엔드 연결이 확인되었고 일정과 알림 데이터를 바로 불러왔습니다.');
  } catch (error) {
    await restorePreviousConnection(previousApiBase);
    setBackendStatus(`백엔드 연결 검증 실패: ${error.message}`);
  } finally {
    el.saveApiBaseBtn.disabled = false;
  }
}

function buildLocalTestAlert() {
  const preferred = Number(state.preferredConsecutiveSeats || 2);
  return {
    id: `${Date.now()}-local-test`,
    createdAt: new Date().toISOString(),
    title: '로컬 테스트 알림',
    message: '알림을 눌러 앱 내부 알림 화면으로 이동해 보세요.',
    ticketUrl: DEFAULT_TICKET_URL,
    game: {
      date: new Date().toISOString().slice(0, 10),
      time: '18:30',
      homeTeam: '두산',
      awayTeam: '상대팀',
      stadium: '잠실야구장'
    },
    seatResult: {
      total: preferred,
      consecutive: preferred,
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
  setBackendStatus(`${reason} 앱 내 카드와 시스템 알림을 함께 확인했습니다.`);
}

async function sendTestNotification() {
  if (!canUseRemoteTestNotification()) {
    runLocalTestNotification('Firebase 미설정 상태라 서버 푸시 대신 로컬 테스트 알림으로 확인했습니다.');
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
    runLocalTestNotification(`서버 테스트 알림 실패로 로컬 알림으로 대체했습니다: ${error.message}`);
  }
}

async function savePreferredSeatCount(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value < 2 || value > 4) return;

  try {
    state.preferredConsecutiveSeats = value;
    renderSeatOptions();
    renderStats();
    renderGames();
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ preferredConsecutiveSeats: value })
    });
    await loadHealth();
    setBackendStatus(`${value}연석 기준으로 알림 설정을 저장했습니다.`);
  } catch (error) {
    setBackendStatus(`연석 기준 저장 실패: ${error.message}`);
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
  el.seatOptionButtons.forEach((button) => {
    button.addEventListener('click', () => savePreferredSeatCount(button.dataset.seatOption));
  });
}

async function init() {
  state.apiBase = inferDefaultApiBase();
  state.reminderSelections = loadReminderSelections();
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

  renderSeatOptions();
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

