const DEFAULT_GAME_URL = 'https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004';
const DOOSAN_PATTERN = /(?:Doosan|Bears|\uB450\uC0B0)/i;
const JAMSIL_PATTERN = /(?:Jamsil|\uC7A0\uC2E4)/i;

function isDoosan(value = '') {
  return DOOSAN_PATTERN.test(String(value));
}

function isJamsil(value = '') {
  return JAMSIL_PATTERN.test(String(value));
}

function normalizeDate(dateString = '') {
  return String(dateString).trim().replace(/[./]/g, '-');
}

function normalizeTime(timeString = '') {
  const value = String(timeString).trim();
  if (!value) return '18:00';
  const compact = value.replace(/[^0-9]/g, '');
  if (compact.length >= 4) {
    return `${compact.slice(0, 2)}:${compact.slice(2, 4)}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    return value.padStart(5, '0');
  }
  return '18:00';
}

function normalizeReservationDateTime(value = '') {
  const text = String(value).trim();
  const match = text.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2}).*?(\d{1,2}:\d{2})/);
  if (!match) return '';
  const [, year, month, day, time] = match;
  return `${year}-${month}-${day}T${normalizeTime(time)}:00+09:00`;
}

function buildDefaultReservationStart(game) {
  if (!game?.date) return '';
  const match = String(game.date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, year, month, day] = match;

  const dt = new Date(Number(year), Number(month) - 1, Number(day), 11, 0, 0, 0);
  dt.setDate(dt.getDate() - 7);

  const reservationYear = dt.getFullYear();
  const reservationMonth = String(dt.getMonth() + 1).padStart(2, '0');
  const reservationDay = String(dt.getDate()).padStart(2, '0');
  return `${reservationYear}-${reservationMonth}-${reservationDay}T11:00:00+09:00`;
}

function getReservationStartDate(game) {
  const value = String(game?.reservationStart || '').trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function gameDateObject(dateString, time = '18:00') {
  return new Date(`${dateString}T${normalizeTime(time)}:00+09:00`);
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseKboRows(xml) {
  const rows = [...xml.matchAll(/<row>([\s\S]*?)<\/row>/gi)].map((match) => match[1]);
  return rows.map((row) => {
    const pick = (tag) => {
      const found = row.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'i'));
      return found ? found[1].trim() : '';
    };

    const homeTeam = pick('HOME_NM') || pick('homeNm');
    const awayTeam = pick('AWAY_NM') || pick('awayNm');
    const stadium = pick('STADIUM_NM') || pick('stadiumNm');
    const date = normalizeDate(pick('GAME_DATE') || pick('gameDate'));
    const time = normalizeTime(pick('START_TIME') || pick('startTime') || '18:00');
    const goodsCode = pick('GOODS_CODE') || pick('goodsCode');

    return {
      id: goodsCode || `${date}-${homeTeam}-${awayTeam}`,
      goodsCode,
      date,
      time,
      homeTeam,
      awayTeam,
      stadium,
      ticketUrl: goodsCode
        ? `https://ticket.interpark.com/TPGoodsBuy.asp?GoodsCode=${goodsCode}`
        : DEFAULT_GAME_URL
    };
  });
}

async function fetchKboSchedule(config, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return fetchOfficialScheduleMonth(ym);
}

function uniqueGames(games) {
  const seen = new Map();
  for (const game of games) {
    if (!game || !game.date) continue;
    const key = game.goodsCode || `${game.date}_${game.time}_${game.homeTeam}_${game.awayTeam}`;
    if (!seen.has(key)) {
      seen.set(key, game);
    }
  }
  return [...seen.values()];
}

function parseJsonLdGames(html) {
  const scripts = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const games = [];

  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const offerUrl = item.url || item.offers?.url || DEFAULT_GAME_URL;
        const title = [item.name, item.description].filter(Boolean).join(' ');
        const dateSource = item.startDate || item.eventAttendanceMode || '';
        const date = normalizeDate(String(dateSource).slice(0, 10));
        const time = normalizeTime(String(dateSource).slice(11, 16) || '18:00');
        const locationName = item.location?.name || item.location?.address?.addressLocality || '';
        const homeTeam = item.homeTeam?.name || item.performer?.[0]?.name || '';
        const awayTeam = item.awayTeam?.name || item.performer?.[1]?.name || '';
        const goodsCode = /GoodsCode=(\d+)/i.test(offerUrl) ? offerUrl.match(/GoodsCode=(\d+)/i)[1] : '';
        games.push({
          id: goodsCode || `${date}-${homeTeam}-${awayTeam}`,
          goodsCode,
          date,
          time,
          homeTeam: homeTeam || title,
          awayTeam,
          stadium: locationName,
          ticketUrl: offerUrl.startsWith('http') ? offerUrl : `https://ticket.interpark.com${offerUrl}`
        });
      }
    } catch (error) {
      continue;
    }
  }

  return games;
}

function parseAnchorGames(html) {
  const anchors = [...html.matchAll(/href="([^"]*GoodsCode=(\d+)[^"]*)"[\s\S]{0,1500}?(\d{4}[.\-/]\d{2}[.\-/]\d{2})/gi)];
  return anchors.map((match) => {
    const href = match[1].startsWith('http') ? match[1] : `https://ticket.interpark.com${match[1]}`;
    const goodsCode = match[2];
    const date = normalizeDate(match[3]);
    const block = match[0];
    const reservationStart = normalizeReservationDateTime((block.match(/\uC2DC\uC791\s*\uC77C\uC2DC\s*([^\r\n<]+)/i) || [])[1] || '');

    return {
      id: goodsCode || `${date}-doosan-interpark`,
      goodsCode,
      date,
      time: '18:00',
      homeTeam: 'Doosan Bears',
      awayTeam: '',
      stadium: 'Jamsil Baseball Stadium',
      ticketUrl: href,
      reservationStart
    };
  });
}

async function fetchTeamTicketSchedule(config) {
  const html = await fetchText(config.teamTicketUrl || DEFAULT_GAME_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml'
    },
    timeoutMs: 7000
  });

  const games = uniqueGames([...parseJsonLdGames(html), ...parseAnchorGames(html)]);
  return games.filter((game) => game.date);
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMonthInfo(html) {
  const match = html.match(/lblGameMonth">(\d{4})\.(\d{2})</i);
  if (!match) {
    throw new Error('Unable to detect KBO month label');
  }
  return {
    year: Number(match[1]),
    month: Number(match[2])
  };
}

function parseHiddenField(html, name) {
  const escaped = name.replace(/[$]/g, '\\$&');
  const match = html.match(new RegExp(`name="${escaped}"[^>]*value="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

function parseOfficialScheduleRows(html) {
  const { year, month } = parseMonthInfo(html);
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const rows = [...tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  let currentDate = '';
  let currentType = '';
  const games = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({
      attrs: match[1],
      text: stripHtml(match[2])
    }));
    if (!cells.length) continue;

    let offset = 0;
    if (cells[offset] && /title="DATE"/i.test(cells[offset].attrs)) {
      currentDate = cells[offset].text;
      offset += 1;
    }
    if (cells[offset] && /title="TYPE"/i.test(cells[offset].attrs)) {
      currentType = cells[offset].text;
      offset += 1;
    }

    const time = cells[offset]?.text || '';
    const awayTeam = cells[offset + 1]?.text || '';
    const homeTeam = cells[offset + 3]?.text || '';
    const stadium = cells[offset + 6]?.text || '';
    const dayMatch = currentDate.match(/(\d{2})\.(\d{2})/);
    if (!dayMatch || !time || !awayTeam || !homeTeam) continue;

    const date = `${year}-${String(month).padStart(2, '0')}-${dayMatch[2]}`;
    games.push({
      id: `${date}-${homeTeam}-${awayTeam}`,
      goodsCode: '',
      date,
      time: normalizeTime(time),
      homeTeam,
      awayTeam,
      stadium,
      type: currentType,
      ticketUrl: DEFAULT_GAME_URL
    });
  }

  return games;
}

async function fetchOfficialScheduleMonth(targetYm) {
  const baseUrl = 'https://eng.koreabaseball.com/Schedule/DailySchedule.aspx';
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,application/xhtml+xml'
  };

  let html = await fetchText(baseUrl, { headers, timeoutMs: 8000 });
  let monthInfo = parseMonthInfo(html);
  const currentYm = `${monthInfo.year}-${String(monthInfo.month).padStart(2, '0')}`;
  if (currentYm === targetYm) {
    return parseOfficialScheduleRows(html);
  }

  const nextDate = new Date(`${currentYm}-01T00:00:00+09:00`);
  nextDate.setMonth(nextDate.getMonth() + 1);
  const nextYm = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  if (nextYm !== targetYm) {
    throw new Error(`Unsupported KBO month request: ${targetYm}`);
  }

  const form = new URLSearchParams({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: parseHiddenField(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: parseHiddenField(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: parseHiddenField(html, '__EVENTVALIDATION'),
    'ctl00$ctl00$ctl00$ctl00$cphContainer$cphContainer$cphContent$cphContent$hdTeamCD': '',
    'ctl00$ctl00$ctl00$ctl00$cphContainer$cphContainer$cphContent$cphContent$btnNext.x': '10',
    'ctl00$ctl00$ctl00$ctl00$cphContainer$cphContainer$cphContent$cphContent$btnNext.y': '10'
  });

  html = await fetchText(baseUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: baseUrl
    },
    body: form.toString(),
    timeoutMs: 8000
  });

  monthInfo = parseMonthInfo(html);
  const resolvedYm = `${monthInfo.year}-${String(monthInfo.month).padStart(2, '0')}`;
  if (resolvedYm !== targetYm) {
    throw new Error(`KBO month mismatch: expected ${targetYm}, got ${resolvedYm}`);
  }

  return parseOfficialScheduleRows(html);
}

async function fetchOfficialScheduleWindow() {
  const baseUrl = 'https://eng.koreabaseball.com/Schedule/DailySchedule.aspx';
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,application/xhtml+xml'
  };

  let html = await fetchText(baseUrl, { headers, timeoutMs: 8000 });
  const months = [parseOfficialScheduleRows(html)];

  const form = new URLSearchParams({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: parseHiddenField(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: parseHiddenField(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: parseHiddenField(html, '__EVENTVALIDATION'),
    'ctl00$ctl00$ctl00$ctl00$cphContainer$cphContainer$cphContent$cphContent$hdTeamCD': '',
    'ctl00$ctl00$ctl00$ctl00$cphContainer$cphContainer$cphContent$cphContent$btnNext.x': '10',
    'ctl00$ctl00$ctl00$ctl00$cphContainer$cphContainer$cphContent$cphContent$btnNext.y': '10'
  });

  html = await fetchText(baseUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: baseUrl
    },
    body: form.toString(),
    timeoutMs: 8000
  });
  months.push(parseOfficialScheduleRows(html));

  return uniqueGames(months.flat());
}

function filterTargetGames(games, daysAhead) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return games.filter((game) => {
    if (!game?.date) return false;
    if (!isJamsil(game.stadium || '')) return false;
    if (!(isDoosan(game.homeTeam || '') || isDoosan(game.awayTeam || ''))) return false;
    const gameDate = gameDateObject(game.date, game.time || '18:00');
    return gameDate >= start && gameDate <= end;
  });
}

function parseSeatAvailability(html) {
  const soldOut = /(?:sold.?out|\uB9E4\uC9C4)/i.test(html);
  const availableHint = /(?:\uC794\uC5EC|remain|available|\uC608\uB9E4\uD558\uAE30|\uC88C\uC11D)/i.test(html);
  if (soldOut && !availableHint) {
    return null;
  }

  const totalMatch =
    html.match(/(?:\uC794\uC5EC|remain|available)[^0-9]{0,20}(\d+)/i) ||
    html.match(/(?:seat|醫뚯꽍)[^0-9]{0,20}(\d+)/i);

  const seatNumbers = [...html.matchAll(/(?:seatNo|seat_num|\uC88C\uC11D)[^0-9]{0,20}(\d{1,3})/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  let longest = 0;
  let currentGroup = [];
  let bestGroup = [];
  for (let i = 0; i < seatNumbers.length; i += 1) {
    if (i === 0 || seatNumbers[i] === seatNumbers[i - 1] + 1) {
      currentGroup.push(seatNumbers[i]);
    } else {
      currentGroup = [seatNumbers[i]];
    }
    if (currentGroup.length > longest) {
      longest = currentGroup.length;
      bestGroup = [...currentGroup];
    }
  }

  const total = totalMatch ? Number(totalMatch[1]) : seatNumbers.length;
  const consecutive = longest || (total > 0 ? 1 : 0);
  if (!total && !consecutive) return null;

  return {
    total,
    consecutive,
    confirmed: bestGroup.length >= 2,
    numStr: bestGroup.length ? `${bestGroup[0]}-${bestGroup[bestGroup.length - 1]}` : '',
    desc: consecutive >= 2 ? `${consecutive} seats together` : `${total || 1}+ seats available`
  };
}

function createAlert(game, seatResult) {
  const key = `${game.id}_${seatResult.consecutive}_${seatResult.total}`;
  const opponent = game.awayTeam || game.homeTeam || '상대팀';
  const seatLabel = seatResult.consecutive >= 2
    ? `${seatResult.consecutive}연석 확인`
    : `좌석 ${seatResult.total}석 확인`;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    createdAt: new Date().toISOString(),
    game,
    seatResult,
    title: seatResult.consecutive >= 2
      ? `${seatResult.consecutive}연석 감지`
      : '취소표 알림',
    message: `${game.date} ${game.time} ${opponent}전 · ${seatLabel}`,
    ticketUrl: game.ticketUrl || DEFAULT_GAME_URL
  };
}

async function loadCandidateGames(config) {
  const officialGames = await fetchOfficialScheduleWindow();

  const ticketGames = await fetchTeamTicketSchedule(config).catch(() => []);
  const ticketMap = new Map(
    ticketGames.map((game) => [`${game.date}_${game.homeTeam}_${game.awayTeam}`, game])
  );

  return officialGames.map((game) => {
    const linked =
      ticketMap.get(`${game.date}_${game.homeTeam}_${game.awayTeam}`) ||
      ticketGames.find((candidate) => candidate.date === game.date) ||
      null;

      return linked
        ? {
            ...game,
            goodsCode: linked.goodsCode || game.goodsCode,
            ticketUrl: linked.ticketUrl || game.ticketUrl,
            reservationStart: linked.reservationStart || game.reservationStart || buildDefaultReservationStart(game)
          }
        : {
            ...game,
            reservationStart: game.reservationStart || buildDefaultReservationStart(game)
          };
    });
  }
  
async function runMonitorCycle(config, state, hooks = {}) {
  const preferredConsecutiveSeats = Number(config.preferredConsecutiveSeats || 2);
  const games = filterTargetGames(await loadCandidateGames(config), config.daysAhead || 21)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, config.maxConcurrentGames || 8);

  const freshAlerts = [];

  for (const game of games) {
    try {
      const reservationStartDate = getReservationStartDate(game);
      if (reservationStartDate && Date.now() < reservationStartDate.getTime()) {
        continue;
      }

      const html = await fetchText(game.ticketUrl || config.defaultGameUrl || DEFAULT_GAME_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml'
        },
        timeoutMs: 7000
      });

        const seatResult = parseSeatAvailability(html);
        if (!seatResult) continue;
        if ((seatResult.consecutive || 0) < preferredConsecutiveSeats) continue;

        const alert = createAlert(game, seatResult);
      if (state.sentKeys[alert.key] && state.sentKeys[alert.key] >= seatResult.total) continue;

      state.sentKeys[alert.key] = seatResult.total;
      state.alerts.unshift(alert);
      state.alerts = state.alerts.slice(0, 200);
      freshAlerts.push(alert);

      if (hooks.onAlert) {
        await hooks.onAlert(alert);
      }
    } catch (error) {
      state.lastError = `[${game.id}] ${error.message}`;
      if (hooks.onError) hooks.onError(error, game);
    }
  }

  state.lastRunAt = new Date().toISOString();
  return { games, freshAlerts };
}

module.exports = {
  fetchKboSchedule,
  fetchTeamTicketSchedule,
  loadCandidateGames,
  filterTargetGames,
  parseSeatAvailability,
  runMonitorCycle
};

