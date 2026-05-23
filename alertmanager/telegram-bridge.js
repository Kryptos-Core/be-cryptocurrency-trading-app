const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.TELEGRAM_BRIDGE_PORT || 9095);
const HOST = process.env.TELEGRAM_BRIDGE_HOST || '127.0.0.1';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}
if (!CHAT_ID) {
  console.error('Missing TELEGRAM_CHAT_ID');
  process.exit(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function summarizeAlert(alert) {
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};
  const status = escapeHtml(alert.status || 'firing');
  const name = escapeHtml(labels.alertname || 'Alert');
  const severity = escapeHtml(labels.severity || 'unknown');
  const summary = annotations.summary ? `\n<b>Summary:</b> ${escapeHtml(annotations.summary)}` : '';
  const description = annotations.description ? `\n<b>Description:</b> ${escapeHtml(annotations.description)}` : '';
  const labelPairs = Object.entries(labels)
    .filter(([k]) => !['alertname'].includes(k))
    .map(([k, v]) => `${escapeHtml(k)}=${escapeHtml(v)}`)
    .join(' ');
  const labelBlock = labelPairs ? `\n<b>Labels:</b> ${labelPairs}` : '';
  return `• <b>${name}</b>\n<b>Status:</b> ${status}\n<b>Severity:</b> ${severity}${summary}${description}${labelBlock}`;
}

function buildMessage(payload) {
  const status = escapeHtml(payload.status || 'firing');
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  const common = payload.commonLabels || {};
  const groupName = escapeHtml(common.alertname || (alerts[0] && alerts[0].labels && alerts[0].labels.alertname) || 'Alert');
  const severity = escapeHtml(common.severity || (alerts[0] && alerts[0].labels && alerts[0].labels.severity) || 'unknown');
  const prefix = status === 'resolved' ? '✅' : severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : '🔔';
  const body = alerts.slice(0, 10).map(summarizeAlert).join('\n\n');
  const truncated = alerts.length > 10 ? `\n\n…and ${alerts.length - 10} more alerts` : '';
  return `${prefix} <b>${groupName}</b>\n<b>Group status:</b> ${status}\n<b>Alert count:</b> ${alerts.length}${body ? `\n\n${body}` : ''}${truncated}`;
}

function sendTelegramMessage(message) {
  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  const child = spawn('curl', [
    '--silent',
    '--show-error',
    '--fail',
    '--max-time', '20',
    '-H', 'Content-Type: application/json',
    '-d', body,
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
  ]);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('close', (code) => {
    if (code === 0) {
      console.log('telegram_send_ok', stdout.trim() || '200');
    } else {
      console.error('telegram_send_failed', code, stderr.trim() || stdout.trim());
    }
  });
}

function handleWebhook(req, res, raw) {
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('invalid json');
    return;
  }

  const message = buildMessage(payload);
  console.log('webhook_received', JSON.stringify({
    status: payload.status,
    alertCount: Array.isArray(payload.alerts) ? payload.alerts.length : 0,
    groupLabels: payload.groupLabels || {},
    commonLabels: payload.commonLabels || {},
  }));
  sendTelegramMessage(message);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/alert') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        req.destroy(new Error('payload too large'));
      }
    });
    req.on('end', () => handleWebhook(req, res, raw));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log(`telegram_bridge_listening ${HOST}:${PORT}`);
});
