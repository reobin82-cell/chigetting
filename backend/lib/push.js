async function pushViaFcm(config, devices, alert) {
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
  if (config.pushProvider === 'fcm') {
    return pushViaFcm(config, devices, alert);
  }
  return { delivered: 0, provider: 'none' };
}

module.exports = {
  deliverPush
};
