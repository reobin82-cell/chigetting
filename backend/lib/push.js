const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

function resolveServiceAccount(config) {
  if (config.firebaseServiceAccountJson) {
    try {
      return JSON.parse(config.firebaseServiceAccountJson);
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 형식이 올바르지 않습니다.');
    }
  }

  if (config.firebaseServiceAccountPath) {
    const serviceAccountPath = path.isAbsolute(config.firebaseServiceAccountPath)
      ? config.firebaseServiceAccountPath
      : path.resolve(process.cwd(), config.firebaseServiceAccountPath);

    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Firebase 서비스 계정 파일을 찾지 못했습니다: ${serviceAccountPath}`);
    }

    return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }

  return null;
}

async function pushViaFcmV1(config, devices, alert) {
  const serviceAccount = resolveServiceAccount(config);
  if (!serviceAccount || !devices.length) {
    return { delivered: 0, provider: 'none' };
  }

  const projectId = config.firebaseProjectId || serviceAccount.project_id;
  if (!projectId) {
    throw new Error('Firebase project id가 설정되지 않았습니다.');
  }

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });
  const accessToken = await auth.getAccessToken();
  if (!accessToken) {
    throw new Error('Firebase access token 발급에 실패했습니다.');
  }

  let delivered = 0;
  for (const device of devices) {
    if (!device.token) continue;

    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: {
            title: alert.title,
            body: alert.message
          },
          data: {
            alertId: String(alert.id || ''),
            ticketUrl: String(alert.ticketUrl || ''),
            gameDate: String(alert.game?.date || '')
          },
          android: {
            priority: 'HIGH',
            notification: {
              clickAction: 'FCM_PLUGIN_ACTIVITY'
            }
          }
        }
      })
    });

    if (response.ok) delivered += 1;
  }

  return { delivered, provider: 'fcm-v1' };
}

async function pushViaFcmLegacy(config, devices, alert) {
  if (!config.fcmServerKey || !devices.length) {
    return { delivered: 0, provider: 'none' };
  }

  let delivered = 0;
  for (const device of devices) {
    if (!device.token) continue;
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${config.fcmServerKey}`
      },
      body: JSON.stringify({
        to: device.token,
        priority: 'high',
        notification: {
          title: alert.title,
          body: alert.message
        },
        data: {
          alertId: alert.id,
          ticketUrl: alert.ticketUrl,
          gameDate: alert.game.date
        }
      })
    });

    if (response.ok) delivered += 1;
  }

  return { delivered, provider: 'fcm-legacy' };
}

async function deliverPush(config, devices, alert) {
  if (config.pushProvider !== 'fcm') {
    return { delivered: 0, provider: 'none' };
  }

  if (config.firebaseServiceAccountJson || config.firebaseServiceAccountPath || config.firebaseProjectId) {
    return pushViaFcmV1(config, devices, alert);
  }

  return pushViaFcmLegacy(config, devices, alert);
}

module.exports = {
  deliverPush
};
