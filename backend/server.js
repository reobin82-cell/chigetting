const http = require('http');
const fs = require('fs');
const path = require('path');
const { readState, writeState, ensureStateFile } = require('./lib/storage');
const { runMonitorCycle } = require('./lib/monitor');
const { deliverPush } = require('./lib/push');

const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'app', 'www');
const configPath = path.join(__dirname, 'config.json');
const exampleConfigPath = path.join(__dirname, 'config.example.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : JSON.parse(fs.readFileSync(exampleConfigPath, 'utf8'));

config.port = Number(process.env.PORT || config.port || 8787);
config.monitorIntervalSec = Number(process.env.MONITOR_INTERVAL_SEC || config.monitorIntervalSec || 20);
config.daysAhead = Number(process.env.DAYS_AHEAD || config.daysAhead || 21);
config.maxConcurrentGames = Number(process.env.MAX_CONCURRENT_GAMES || config.maxConcurrentGames || 8);
config.preferredConsecutiveSeats = Number(process.env.PREFERRED_CONSECUTIVE_SEATS || config.preferredConsecutiveSeats || 3);
config.kboEndpoint = process.env.KBO_ENDPOINT || config.kboEndpoint;
config.teamTicketUrl = process.env.TEAM_TICKET_URL || config.teamTicketUrl;
config.defaultGameUrl = process.env.DEFAULT_GAME_URL || config.defaultGameUrl;
config.pushProvider = process.env.PUSH_PROVIDER || config.pushProvider || 'none';
config.fcmServerKey = process.env.FCM_SERVER_KEY || config.fcmServerKey || '';
config.firebaseProjectId = process.env.FIREBASE_PROJECT_ID || config.firebaseProjectId || '';
config.firebaseServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || config.firebaseServiceAccountPath || '';
config.firebaseServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || config.firebaseServiceAccountJson || '';
config.dataFile = path.resolve(rootDir, process.env.DATA_FILE || config.dataFile || './backend/data/state.json');
ensureStateFile(config.dataFile);

const clients = new Set();
let running = false;
let lastGames = [];
let lastInterparkServerTime = '';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8'
  };
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(fs.readFileSync(filePath));
}

function broadcastAlert(alert) {
  const data = `event: alert\ndata: ${JSON.stringify(alert)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

async function monitorOnce(trigger = 'manual') {
  if (running) {
    return { skipped: true, reason: 'already-running' };
  }

  running = true;
  try {
    const state = readState(config.dataFile);
    let result = { games: [], freshAlerts: [] };
    try {
      result = await runMonitorCycle(config, state, {
        onAlert: async (alert) => {
          broadcastAlert(alert);
          await deliverPush(config, state.devices || [], alert);
        },
        onError: () => {}
      });
      lastGames = result.games;
      state.lastError = null;
    } catch (error) {
      state.lastError = error.message;
      state.lastRunAt = new Date().toISOString();
    }
    writeState(config.dataFile, state);
    return {
      trigger,
      checkedGames: result.games.length,
      freshAlerts: result.freshAlerts.length,
      error: state.lastError
    };
  } finally {
    running = false;
  }
}

async function fetchInterparkServerTime() {
  const now = Date.now();
  if (lastInterparkServerTime && fetchInterparkServerTime.lastFetchedAt && now - fetchInterparkServerTime.lastFetchedAt < 15000) {
    return lastInterparkServerTime;
  }

  const response = await fetch(config.teamTicketUrl || config.defaultGameUrl, {
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  const header = response.headers.get('date');
  lastInterparkServerTime = header ? new Date(header).toISOString() : '';
  fetchInterparkServerTime.lastFetchedAt = now;
  return lastInterparkServerTime;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    res.end();
    return;
  }

  if (req.url === '/api/health' && req.method === 'GET') {
    const state = readState(config.dataFile);
    let interparkServerTime = lastInterparkServerTime;
    try {
      interparkServerTime = await fetchInterparkServerTime();
    } catch (error) {
      interparkServerTime = lastInterparkServerTime;
    }
    sendJson(res, 200, {
      ok: true,
      running,
      serverTime: new Date().toISOString(),
      interparkServerTime,
      lastRunAt: state.lastRunAt,
      lastError: state.lastError,
      watchedGames: lastGames.length,
      alerts: state.alerts.length,
      preferredConsecutiveSeats: config.preferredConsecutiveSeats
    });
    return;
  }

  if (req.url === '/api/games' && req.method === 'GET') {
    sendJson(res, 200, { games: lastGames });
    return;
  }

  if (req.url === '/api/alerts' && req.method === 'GET') {
    const state = readState(config.dataFile);
    sendJson(res, 200, { alerts: state.alerts.slice(0, 50) });
    return;
  }

  if (req.url === '/api/monitor/run' && req.method === 'POST') {
    try {
      const result = await monitorOnce('manual');
      sendJson(res, result.error ? 207 : 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url === '/api/devices/register' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const state = readState(config.dataFile);
      const token = String(body.token || '').trim();
      if (!token) {
        sendJson(res, 400, { error: 'token is required' });
        return;
      }
      const existing = (state.devices || []).find((device) => device.token === token);
      if (!existing) {
        state.devices.push({
          token,
          platform: body.platform || 'android',
          createdAt: new Date().toISOString()
        });
        writeState(config.dataFile, state);
      }
      sendJson(res, 200, { ok: true, devices: state.devices.length });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.url === '/api/settings' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (typeof body.monitorIntervalSec === 'number') config.monitorIntervalSec = body.monitorIntervalSec;
      if (typeof body.daysAhead === 'number') config.daysAhead = body.daysAhead;
      if (typeof body.preferredConsecutiveSeats === 'number') {
        config.preferredConsecutiveSeats = Math.max(2, Math.min(4, Math.floor(body.preferredConsecutiveSeats)));
      }
      sendJson(res, 200, { ok: true, config });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.url === '/api/test/alert' && req.method === 'POST') {
    try {
      const state = readState(config.dataFile);
      const preferredSeats = Number(config.preferredConsecutiveSeats || 3);
      const alert = {
        id: `${Date.now()}-test`,
        key: `test_${Date.now()}`,
        createdAt: new Date().toISOString(),
        title: '로컬 테스트 알림',
        message: '알림을 눌러 앱 내부 알림 화면으로 이동해 보세요.',
        ticketUrl: config.defaultGameUrl,
        game: {
          date: new Date().toISOString().slice(0, 10),
          time: '18:30',
          homeTeam: '두산',
          awayTeam: '상대팀',
          stadium: '잠실야구장'
        },
        seatResult: {
          total: preferredSeats,
          consecutive: preferredSeats,
          confirmed: true,
          numStr: '101-102',
          desc: `${preferredSeats}연석 가능`
        }
      };
      state.alerts.unshift(alert);
      state.alerts = state.alerts.slice(0, 50);
      writeState(config.dataFile, state);
      broadcastAlert(alert);
      await deliverPush(config, state.devices || [], alert);
      sendJson(res, 200, { ok: true, alert });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  if ((req.url === '/' || req.url === '/index.html') && req.method === 'GET') {
    sendFile(res, path.join(appDir, 'index.html'));
    return;
  }

  if (req.url && req.method === 'GET' && !req.url.startsWith('/api/')) {
    const filePath = path.join(appDir, req.url.replace(/^\/+/, ''));
    if (filePath.startsWith(appDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath);
      return;
    }
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(config.port, async () => {
  console.log(`Doosan monitor server listening on http://localhost:${config.port}`);
  try {
    await monitorOnce('boot');
  } catch (error) {
    console.error('Initial monitor failed:', error.message);
  }
  setInterval(() => {
    monitorOnce('interval').catch((error) => {
      console.error('Monitor cycle failed:', error.message);
    });
  }, Math.max(config.monitorIntervalSec || 20, 10) * 1000);
});
